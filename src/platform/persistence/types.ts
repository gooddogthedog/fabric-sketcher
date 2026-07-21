import type {
  BrushSnapshot,
  DesignDocument,
  DocumentOperation,
  PenSample,
  StrokeOperation,
} from "../../domain/document/types";

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
  if (
    !isRecord(candidate) ||
    candidate.schemaVersion !== 1 ||
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
  return candidate as DesignDocument;
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
  return (
    isRecord(value) &&
    value.id === "studio-pencil-v1" &&
    typeof value.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(value.color) &&
    isFiniteNumber(value.opacity) &&
    isPositiveFiniteNumber(value.size) &&
    isFiniteNumber(value.pressureSize) &&
    isFiniteNumber(value.pressureOpacity) &&
    isFiniteNumber(value.tiltShape)
  );
}

function isStrokeOperation(
  value: unknown,
  expectedProjectId: string,
  activeLayerId: string,
  maximumSequence: number,
): value is StrokeOperation {
  return (
    isRecord(value) &&
    value.type === "stroke.committed" &&
    typeof value.operationId === "string" &&
    value.operationId.length > 0 &&
    value.projectId === expectedProjectId &&
    value.layerId === activeLayerId &&
    Number.isInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    (value.sequence as number) <= maximumSequence &&
    typeof value.committedAt === "string" &&
    value.committedAt.length > 0 &&
    isBrushSnapshot(value.brush) &&
    Array.isArray(value.samples) &&
    value.samples.length >= 2 &&
    value.samples.every(isPenSample)
  );
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

  const hiddenStrokeIds = candidate.hiddenStrokeIds;
  if (
    !hiddenStrokeIds.every(
      (operationId): operationId is string =>
        typeof operationId === "string" && operationIds.includes(operationId),
    ) ||
    new Set(hiddenStrokeIds).size !== hiddenStrokeIds.length
  ) {
    return false;
  }

  return true;
}
