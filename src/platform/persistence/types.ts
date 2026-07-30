import type {
  BrushSnapshot,
  DesignDocument,
  DocumentOperation,
  EraseOperation,
  EraserSnapshot,
  PenSample,
  StrokeOperation,
} from "../../domain/document/types";
import { normalizeFoundationState } from "../../domain/document/foundationState";

export type ProjectSummary = Readonly<{
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
}>;

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectSummary[]>;
  createProject(document: DesignDocument): Promise<void>;
  loadProject(projectId: string): Promise<DesignDocument>;
  appendOperation(operation: DocumentOperation): Promise<void>;
  writeSnapshot(document: DesignDocument): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}

export interface AtomicSnapshotFileStore {
  writeAtomically(path: string, contents: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
}

export interface SnapshotCodec {
  readonly encoding: "gzip-json-v1";
  compress(json: string): Promise<Uint8Array>;
  decompress(payload: Uint8Array): Promise<string>;
}

export class PersistenceError extends Error {
  readonly retryable = true;

  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

export class DocumentOperationValidationError extends Error {
  constructor() {
    super("Invalid document operation.");
    this.name = "DocumentOperationValidationError";
  }
}

const snapshotEncoder = new TextEncoder();
const snapshotDecoder = new TextDecoder("utf-8", { fatal: true });

export function encodeDocumentSnapshot(document: DesignDocument): Uint8Array {
  return snapshotEncoder.encode(JSON.stringify(document));
}

export function decodeDocumentSnapshot(
  contents: Uint8Array,
  expectedProjectId: string,
): DesignDocument {
  const candidate: unknown = JSON.parse(snapshotDecoder.decode(contents));
  return normalizeDesignDocument(candidate, expectedProjectId);
}

export function normalizeDesignDocument(
  value: unknown,
  expectedProjectId: string,
): DesignDocument {
  const candidate = value;
  if (
    !isRecord(candidate) ||
    (candidate.schemaVersion !== 1 &&
      candidate.schemaVersion !== 2 &&
      candidate.schemaVersion !== 3) ||
    (candidate.schemaVersion === 3 && !Array.isArray(candidate.erases)) ||
    candidate.projectId !== expectedProjectId ||
    typeof candidate.title !== "string" ||
    !isPositiveFiniteNumber(candidate.width) ||
    !isPositiveFiniteNumber(candidate.height) ||
    candidate.background !== "#F7F3EC" ||
    typeof candidate.activeLayerId !== "string" ||
    candidate.activeLayerId.length === 0 ||
    !Number.isInteger(candidate.operationSequence) ||
    (candidate.operationSequence as number) < 0 ||
    !Array.isArray(candidate.strokes) ||
    !Array.isArray(candidate.hiddenStrokeIds) ||
    !isCanonicalDocumentHistory(candidate, expectedProjectId)
  ) {
    throw new Error(`Invalid snapshot for project ${expectedProjectId}.`);
  }

  const foundation =
    candidate.schemaVersion === 1 || candidate.foundation === null
      ? null
      : normalizeFoundationState(candidate.foundation);

  return {
    schemaVersion: 3,
    projectId: candidate.projectId,
    title: candidate.title,
    width: candidate.width,
    height: candidate.height,
    background: candidate.background,
    activeLayerId: candidate.activeLayerId,
    operationSequence: candidate.operationSequence as number,
    foundation,
    strokes: candidate.strokes.map((stroke) =>
      normalizeLegacyPencilStroke(stroke as StrokeOperation),
    ),
    erases:
      candidate.schemaVersion === 3
        ? (candidate.erases as readonly EraseOperation[]).map((erase) => ({
            ...erase,
            samples: [...erase.samples],
          }))
        : [],
    hiddenStrokeIds: [...candidate.hiddenStrokeIds],
  };
}

export function normalizeDocumentOperation(value: unknown): DocumentOperation {
  if (isValidStrokeOperation(value)) {
    return normalizeLegacyPencilStroke(value);
  }
  if (isValidEraseOperation(value)) {
    return value;
  }
  if (isValidVisibilityOperation(value)) {
    return value;
  }
  if (isFoundationSetOperation(value)) {
    try {
      return {
        type: "foundation.set",
        operationId: value.operationId,
        projectId: value.projectId,
        sequence: value.sequence,
        committedAt: value.committedAt,
        foundation:
          value.foundation === null
            ? null
            : normalizeFoundationState(value.foundation),
      };
    } catch {
      throw new DocumentOperationValidationError();
    }
  }
  if (isDocumentTitleSetOperation(value)) {
    return value;
  }
  throw new DocumentOperationValidationError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isPenSample(value: unknown): value is PenSample {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.pressure) &&
    isFiniteNumber(value.tiltX) &&
    isFiniteNumber(value.tiltY) &&
    isFiniteNumber(value.twist) &&
    isNullableFiniteNumber(value.altitudeAngle) &&
    isNullableFiniteNumber(value.azimuthAngle) &&
    isFiniteNumber(value.time)
  );
}

function isBrushSnapshot(value: unknown): value is BrushSnapshot {
  const isLegacyPencil =
    isRecord(value) &&
    value.id === "studio-pencil-v1" &&
    value.texture === undefined;
  return (
    isRecord(value) &&
    isBrushPresetId(value.id) &&
    typeof value.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(value.color) &&
    isUnitIntervalFiniteNumber(value.opacity) &&
    isPositiveFiniteNumber(value.size) &&
    isUnitIntervalFiniteNumber(value.pressureSize) &&
    isUnitIntervalFiniteNumber(value.pressureOpacity) &&
    isUnitIntervalFiniteNumber(value.tiltShape) &&
    (isLegacyPencil || isBrushTextureSnapshot(value.texture))
  );
}

function isBrushPresetId(value: unknown): boolean {
  return (
    value === "studio-pencil-v1" ||
    value === "silk-v1" ||
    value === "denim-v1" ||
    value === "wool-v1" ||
    value === "knit-v1"
  );
}

function isBrushTextureSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === "graphite" ||
      value.kind === "silk" ||
      value.kind === "denim" ||
      value.kind === "wool" ||
      value.kind === "knit") &&
    isPositiveFiniteNumber(value.scale) &&
    isUnitIntervalFiniteNumber(value.strength) &&
    isFiniteNumber(value.angle) &&
    isUnitIntervalFiniteNumber(value.scatter)
  );
}

function isUnitIntervalFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isStrokeOperation(
  value: unknown,
  expectedProjectId: string,
  activeLayerId: string,
  maximumSequence: number,
): value is StrokeOperation {
  return (
    isValidStrokeOperation(value) &&
    value.projectId === expectedProjectId &&
    value.layerId === activeLayerId &&
    value.sequence <= maximumSequence
  );
}

function isValidStrokeOperation(value: unknown): value is StrokeOperation {
  return (
    isOperationMetadata(value) &&
    value.type === "stroke.committed" &&
    typeof value.layerId === "string" &&
    value.layerId.length > 0 &&
    isBrushSnapshot(value.brush) &&
    Array.isArray(value.samples) &&
    value.samples.length >= 2 &&
    value.samples.every(isPenSample)
  );
}

function isEraserSnapshot(value: unknown): value is EraserSnapshot {
  return (
    isRecord(value) &&
    isBrushPresetId(value.tipBrushId) &&
    isPositiveFiniteNumber(value.size) &&
    isUnitIntervalFiniteNumber(value.opacity) &&
    isUnitIntervalFiniteNumber(value.pressureSize) &&
    isUnitIntervalFiniteNumber(value.pressureOpacity) &&
    isUnitIntervalFiniteNumber(value.tiltShape)
  );
}

function isValidEraseOperation(value: unknown): value is EraseOperation {
  return (
    isOperationMetadata(value) &&
    value.type === "erase.committed" &&
    typeof value.layerId === "string" &&
    value.layerId.length > 0 &&
    isEraserSnapshot(value.eraser) &&
    Array.isArray(value.samples) &&
    value.samples.length >= 2 &&
    value.samples.every(isPenSample)
  );
}

function isValidVisibilityOperation(
  value: unknown,
): value is DocumentOperation {
  return (
    isOperationMetadata(value) &&
    value.type === "stroke.visibility-set" &&
    typeof value.targetOperationId === "string" &&
    value.targetOperationId.length > 0 &&
    typeof value.visible === "boolean"
  );
}

function isFoundationSetOperation(value: unknown): value is OperationMetadata &
  Readonly<{
    type: "foundation.set";
    foundation: Record<string, unknown> | null;
  }> {
  return (
    isOperationMetadata(value) &&
    value.type === "foundation.set" &&
    (value.foundation === null || isRecord(value.foundation))
  );
}

function isDocumentTitleSetOperation(
  value: unknown,
): value is DocumentOperation {
  return (
    isOperationMetadata(value) &&
    value.type === "document.title-set" &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 80
  );
}

type OperationMetadata = Record<string, unknown> &
  Readonly<{
    operationId: string;
    projectId: string;
    sequence: number;
    committedAt: string;
  }>;

function isOperationMetadata(value: unknown): value is OperationMetadata {
  return (
    isRecord(value) &&
    typeof value.operationId === "string" &&
    value.operationId.length > 0 &&
    typeof value.projectId === "string" &&
    value.projectId.length > 0 &&
    Number.isInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    typeof value.committedAt === "string" &&
    value.committedAt.length > 0
  );
}

function normalizeLegacyPencilStroke(
  operation: StrokeOperation,
): StrokeOperation {
  if (
    operation.brush.id !== "studio-pencil-v1" ||
    operation.brush.texture !== undefined
  ) {
    return operation;
  }
  return {
    ...operation,
    brush: {
      ...operation.brush,
      texture: {
        kind: "graphite",
        scale: 18,
        strength: 0.34,
        angle: 0,
        scatter: 0.18,
      },
    },
  };
}

function isCanonicalDocumentHistory(
  candidate: Record<string, unknown>,
  expectedProjectId: string,
): boolean {
  if (
    typeof candidate.activeLayerId !== "string" ||
    !Number.isInteger(candidate.operationSequence) ||
    !Array.isArray(candidate.strokes) ||
    !Array.isArray(candidate.hiddenStrokeIds)
  ) {
    return false;
  }

  const maximumSequence = candidate.operationSequence as number;
  const strokes = candidate.strokes;
  if (
    !strokes.every((stroke) =>
      isStrokeOperation(
        stroke,
        expectedProjectId,
        candidate.activeLayerId as string,
        maximumSequence,
      ),
    )
  ) {
    return false;
  }

  const operationIds = strokes.map((stroke) => stroke.operationId);
  if (new Set(operationIds).size !== operationIds.length) {
    return false;
  }
  for (let index = 1; index < strokes.length; index += 1) {
    if (strokes[index - 1].sequence >= strokes[index].sequence) {
      return false;
    }
  }

  const erases = Array.isArray(candidate.erases) ? candidate.erases : [];
  if (!erases.every(isValidEraseOperation)) {
    return false;
  }
  const eraseIds = erases.map((erase) => erase.operationId);
  const markIds = [...operationIds, ...eraseIds];
  if (new Set(markIds).size !== markIds.length) {
    return false;
  }

  const hiddenStrokeIds = candidate.hiddenStrokeIds;
  if (
    !hiddenStrokeIds.every(
      (operationId): operationId is string =>
        typeof operationId === "string" && markIds.includes(operationId),
    ) ||
    new Set(hiddenStrokeIds).size !== hiddenStrokeIds.length
  ) {
    return false;
  }

  return true;
}
