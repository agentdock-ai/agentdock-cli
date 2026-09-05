import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  MemorySaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from "@langchain/langgraph-checkpoint";

type EncodedStorage = Record<
  string,
  Record<string, Record<string, [string, string, string | undefined]>>
>;
type EncodedWrites = Record<string, Record<string, [string, string, string]>>;

interface CheckpointSnapshot {
  version: 1;
  storage: EncodedStorage;
  writes: EncodedWrites;
}

export class FileCheckpointSaver extends MemorySaver {
  private readonly ready: Promise<void>;
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath: string) {
    super();
    this.ready = this.load();
  }

  override async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    await this.ready;
    return super.getTuple(config);
  }

  override async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    await this.ready;
    yield* super.list(config, options);
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions?: ChannelVersions,
  ): Promise<RunnableConfig> {
    await this.ready;
    const nextConfig = await super.put(config, checkpoint, metadata);
    await this.persist();
    return nextConfig;
  }

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    await this.ready;
    await super.putWrites(config, writes, taskId);
    await this.persist();
  }

  override async deleteThread(threadId: string): Promise<void> {
    await this.ready;
    await super.deleteThread(threadId);
    await this.persist();
  }

  private async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const value: unknown = JSON.parse(content);
      if (!isRecord(value) || value.version !== 1) {
        throw new Error(`Invalid AgentDock checkpoint file: ${this.filePath}`);
      }
      this.storage = decodeStorage(value.storage, this.filePath);
      this.writes = decodeWrites(value.writes, this.filePath);
    } catch (error) {
      if (isFileNotFound(error)) return;
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid AgentDock checkpoint JSON: ${this.filePath}`);
      }
      throw error;
    }
  }

  private persist(): Promise<void> {
    const operation = this.writeQueue.then(() => this.writeSnapshot());
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async writeSnapshot(): Promise<void> {
    const snapshot: CheckpointSnapshot = {
      version: 1,
      storage: encodeStorage(this.storage),
      writes: encodeWrites(this.writes),
    };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, "utf8");
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

function encodeStorage(storage: MemorySaver["storage"]): EncodedStorage {
  const result: EncodedStorage = {};
  for (const [threadId, namespaces] of Object.entries(storage)) {
    result[threadId] = {};
    for (const [namespace, checkpoints] of Object.entries(namespaces)) {
      result[threadId][namespace] = {};
      for (const [checkpointId, tuple] of Object.entries(checkpoints)) {
        result[threadId][namespace][checkpointId] = [
          encodeBytes(tuple[0]),
          encodeBytes(tuple[1]),
          tuple[2],
        ];
      }
    }
  }
  return result;
}

function encodeWrites(writes: MemorySaver["writes"]): EncodedWrites {
  const result: EncodedWrites = {};
  for (const [threadId, checkpoints] of Object.entries(writes)) {
    result[threadId] = {};
    for (const [checkpointKey, tuple] of Object.entries(checkpoints)) {
      result[threadId][checkpointKey] = [tuple[0], tuple[1], encodeBytes(tuple[2])];
    }
  }
  return result;
}

function decodeStorage(value: unknown, filePath: string): MemorySaver["storage"] {
  if (!isRecord(value)) throw new Error(`Invalid checkpoint storage: ${filePath}`);
  const storage: MemorySaver["storage"] = {};
  for (const [threadId, namespacesValue] of Object.entries(value)) {
    if (!isRecord(namespacesValue)) throw new Error(`Invalid checkpoint storage: ${filePath}`);
    storage[threadId] = {};
    for (const [namespace, checkpointsValue] of Object.entries(namespacesValue)) {
      if (!isRecord(checkpointsValue)) throw new Error(`Invalid checkpoint storage: ${filePath}`);
      storage[threadId][namespace] = {};
      for (const [checkpointId, tupleValue] of Object.entries(checkpointsValue)) {
        if (!Array.isArray(tupleValue) || tupleValue.length !== 3 ||
          typeof tupleValue[0] !== "string" || typeof tupleValue[1] !== "string" ||
          (tupleValue[2] !== null && tupleValue[2] !== undefined && typeof tupleValue[2] !== "string")) {
          throw new Error(`Invalid checkpoint entry: ${filePath}`);
        }
        storage[threadId][namespace][checkpointId] = [
          decodeBytes(tupleValue[0]),
          decodeBytes(tupleValue[1]),
          tupleValue[2] ?? undefined,
        ];
      }
    }
  }
  return storage;
}

function decodeWrites(value: unknown, filePath: string): MemorySaver["writes"] {
  if (!isRecord(value)) throw new Error(`Invalid checkpoint writes: ${filePath}`);
  const writes: MemorySaver["writes"] = {};
  for (const [threadId, checkpointsValue] of Object.entries(value)) {
    if (!isRecord(checkpointsValue)) throw new Error(`Invalid checkpoint writes: ${filePath}`);
    writes[threadId] = {};
    for (const [checkpointKey, tupleValue] of Object.entries(checkpointsValue)) {
      if (!Array.isArray(tupleValue) || tupleValue.length !== 3 ||
        typeof tupleValue[0] !== "string" || typeof tupleValue[1] !== "string" ||
        typeof tupleValue[2] !== "string") {
        throw new Error(`Invalid checkpoint write: ${filePath}`);
      }
      writes[threadId][checkpointKey] = [
        tupleValue[0],
        tupleValue[1],
        decodeBytes(tupleValue[2]),
      ];
    }
  }
  return writes;
}

function encodeBytes(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function decodeBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
