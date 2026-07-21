import type {
  DesignDocument,
  DocumentOperation,
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
    typeof candidate !== "object" ||
    candidate === null ||
    !("schemaVersion" in candidate) ||
    candidate.schemaVersion !== 1 ||
    !("projectId" in candidate) ||
    candidate.projectId !== expectedProjectId ||
    !("title" in candidate) ||
    typeof candidate.title !== "string" ||
    !("width" in candidate) ||
    typeof candidate.width !== "number" ||
    !Number.isFinite(candidate.width) ||
    !("height" in candidate) ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.height) ||
    !("background" in candidate) ||
    candidate.background !== "#F7F3EC" ||
    !("activeLayerId" in candidate) ||
    typeof candidate.activeLayerId !== "string" ||
    !("operationSequence" in candidate) ||
    !Number.isInteger(candidate.operationSequence) ||
    (candidate.operationSequence as number) < 0 ||
    !("strokes" in candidate) ||
    !Array.isArray(candidate.strokes) ||
    !("hiddenStrokeIds" in candidate) ||
    !Array.isArray(candidate.hiddenStrokeIds) ||
    !candidate.hiddenStrokeIds.every(
      (operationId) => typeof operationId === "string",
    )
  ) {
    throw new Error(`Invalid snapshot for project ${expectedProjectId}.`);
  }
  return candidate as DesignDocument;
}
