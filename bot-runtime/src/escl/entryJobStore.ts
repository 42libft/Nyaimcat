import { promises as fs } from "node:fs";
import path from "node:path";

export class EntryJobStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EntryJobStoreError";
    if (options?.cause) {
      // @ts-expect-error cause is supported in Node 16+
      this.cause = options.cause;
    }
  }
}

export type PersistedDispatchTime = {
  hour: number;
  minute: number;
};

export type EntryJobRecord = {
  jobId: string;
  scrimId: number;
  teamId: number;
  entryDate: string;
  dispatchTime: PersistedDispatchTime | null;
  runAt: string;
  createdBy: string;
  createdAt: string;
  accountId: string | null;
  jwtFingerprint: string | null;
};

const sortRecords = (records: Iterable<EntryJobRecord>) =>
  [...records].sort((a, b) => {
    if (a.runAt < b.runAt) {
      return -1;
    }
    if (a.runAt > b.runAt) {
      return 1;
    }
    if (a.createdAt < b.createdAt) {
      return -1;
    }
    if (a.createdAt > b.createdAt) {
      return 1;
    }
    return a.jobId.localeCompare(b.jobId);
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidDispatchTime = (value: unknown): value is PersistedDispatchTime => {
  if (!isPlainObject(value)) {
    return false;
  }

  const hour = Number(value.hour);
  const minute = Number(value.minute);

  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
};

const normalizeRecord = (rawKey: string, rawValue: unknown): EntryJobRecord => {
  if (!isPlainObject(rawValue)) {
    throw new EntryJobStoreError(`ジョブ ${rawKey} がオブジェクトではありません。`);
  }

  const {
    scrimId,
    teamId,
    entryDate,
    dispatchTime,
    runAt,
    createdBy,
    createdAt,
    accountId,
    jwtFingerprint,
  } = rawValue;

  const jobId = String(rawValue.jobId ?? rawKey).trim();
  if (!jobId) {
    throw new EntryJobStoreError(`ジョブ ${rawKey} の jobId が空です。`);
  }

  const scrim = Number(scrimId);
  if (!Number.isInteger(scrim) || scrim <= 0) {
    throw new EntryJobStoreError(`ジョブ ${jobId} の scrimId が正の整数ではありません。`);
  }

  const team = Number(teamId);
  if (!Number.isInteger(team) || team <= 0) {
    throw new EntryJobStoreError(`ジョブ ${jobId} の teamId が正の整数ではありません。`);
  }

  if (typeof entryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    throw new EntryJobStoreError(`ジョブ ${jobId} の entryDate が YYYY-MM-DD 形式ではありません。`);
  }

  let persistedDispatch: PersistedDispatchTime | null = null;
  if (dispatchTime !== undefined && dispatchTime !== null) {
    if (!isValidDispatchTime(dispatchTime)) {
      throw new EntryJobStoreError(
        `ジョブ ${jobId} の dispatchTime が不正な形式です。`
      );
    }

    persistedDispatch = {
      hour: Number(dispatchTime.hour),
      minute: Number(dispatchTime.minute),
    };
  }

  if (typeof runAt !== "string" || Number.isNaN(Date.parse(runAt))) {
    throw new EntryJobStoreError(`ジョブ ${jobId} の runAt が ISO8601 形式ではありません。`);
  }

  if (typeof createdBy !== "string" || !createdBy.trim()) {
    throw new EntryJobStoreError(`ジョブ ${jobId} の createdBy が空です。`);
  }

  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    throw new EntryJobStoreError(
      `ジョブ ${jobId} の createdAt が ISO8601 形式ではありません。`
    );
  }

  let normalizedAccountId: string | null = null;
  if (accountId !== undefined && accountId !== null) {
    if (typeof accountId !== "string") {
      throw new EntryJobStoreError(`ジョブ ${jobId} の accountId が文字列ではありません。`);
    }
    const trimmedAccount = accountId.trim();
    if (!trimmedAccount) {
      throw new EntryJobStoreError(`ジョブ ${jobId} の accountId が空文字です。`);
    }
    normalizedAccountId = trimmedAccount;
  }

  let normalizedFingerprint: string | null = null;
  if (jwtFingerprint !== undefined && jwtFingerprint !== null) {
    if (typeof jwtFingerprint !== "string") {
      throw new EntryJobStoreError(
        `ジョブ ${jobId} の jwtFingerprint が文字列ではありません。`
      );
    }
    const trimmedFingerprint = jwtFingerprint.trim();
    if (!trimmedFingerprint) {
      throw new EntryJobStoreError(`ジョブ ${jobId} の jwtFingerprint が空文字です。`);
    }
    normalizedFingerprint = trimmedFingerprint;
  }

  return {
    jobId,
    scrimId: scrim,
    teamId: team,
    entryDate,
    dispatchTime: persistedDispatch,
    runAt,
    createdBy: createdBy.trim(),
    createdAt,
    accountId: normalizedAccountId,
    jwtFingerprint: normalizedFingerprint,
  };
};

export class EntryJobStore {
  private readonly filePath: string;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeLock: Promise<void> = Promise.resolve();
  private records = new Map<string, EntryJobRecord>();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load() {
    if (this.loaded) {
      return;
    }

    if (!this.loadPromise) {
      this.loadPromise = this.performLoad();
    }

    await this.loadPromise;
  }

  async list(): Promise<EntryJobRecord[]> {
    await this.ensureLoaded();
    return sortRecords(this.records.values());
  }

  async get(jobId: string): Promise<EntryJobRecord | null> {
    await this.ensureLoaded();
    return this.records.get(jobId) ?? null;
  }

  async save(record: EntryJobRecord) {
    await this.ensureLoaded();
    await this.withWriteLock(async () => {
      this.records.set(record.jobId, record);
      await this.flushLocked();
    });
  }

  async remove(jobId: string) {
    await this.ensureLoaded();
    await this.withWriteLock(async () => {
      if (!this.records.has(jobId)) {
        return;
      }
      this.records.delete(jobId);
      await this.flushLocked();
    });
  }

  private async ensureLoaded() {
    if (!this.loaded) {
      await this.load();
    }
  }

  private async performLoad() {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      if (!isPlainObject(parsed)) {
        throw new EntryJobStoreError("entry_jobs.json がオブジェクト形式ではありません。");
      }

      const next = new Map<string, EntryJobRecord>();
      for (const [key, value] of Object.entries(parsed)) {
        const record = normalizeRecord(key, value);
        next.set(record.jobId, record);
      }

      this.records = next;
      this.loaded = true;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        this.records = new Map();
        this.loaded = true;
        return;
      }

      if (error instanceof EntryJobStoreError) {
        this.loaded = true;
        throw error;
      }

      throw new EntryJobStoreError("entry_jobs.json の読み込みに失敗しました。", {
        cause: error,
      });
    }
  }

  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.writeLock;
    let release: (() => void) | undefined;

    this.writeLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  private async flushLocked() {
    const directory = path.dirname(this.filePath);
    const tmpPath = `${this.filePath}.tmp`;
    const payload = Object.fromEntries(
      sortRecords(this.records.values()).map((record) => [
        record.jobId,
        {
          jobId: record.jobId,
          scrimId: record.scrimId,
          teamId: record.teamId,
          entryDate: record.entryDate,
          dispatchTime: record.dispatchTime,
          runAt: record.runAt,
          createdBy: record.createdBy,
          createdAt: record.createdAt,
          accountId: record.accountId,
          jwtFingerprint: record.jwtFingerprint,
        },
      ])
    );

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      throw new EntryJobStoreError("entry_jobs.json の保存に失敗しました。", {
        cause: error,
      });
    }
  }
}
