import { promises as fs } from "node:fs";
import path from "node:path";

export class TeamStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "TeamStoreError";
    if (options?.cause) {
      // @ts-expect-error cause is supported in Node 16+
      this.cause = options.cause;
    }
  }
}

export type ResolveTeamIdResult = {
  teamId: number | null;
  fromStore: boolean;
};

export type TeamStoreState = {
  entries: Record<string, number>;
};

const sortEntries = (entries: Map<string, number>) =>
  [...entries.entries()].sort((a, b) => {
    if (a[0] < b[0]) {
      return -1;
    }
    if (a[0] > b[0]) {
      return 1;
    }
    return 0;
  });

export class TeamStore {
  private readonly filePath: string;
  private readonly defaultTeamId: number | null;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeLock: Promise<void> = Promise.resolve();
  private entries = new Map<string, number>();

  constructor(filePath: string, defaultTeamId: number | null = null) {
    this.filePath = filePath;
    this.defaultTeamId = defaultTeamId;
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

  async resolveTeamId(userId: string): Promise<ResolveTeamIdResult> {
    await this.ensureLoaded();

    const key = String(userId);
    if (this.entries.has(key)) {
      return { teamId: this.entries.get(key) ?? null, fromStore: true };
    }

    return {
      teamId: this.defaultTeamId,
      fromStore: false,
    };
  }

  async getTeamId(userId: string) {
    const result = await this.resolveTeamId(userId);
    return result.teamId;
  }

  async setTeamId(userId: string, teamId: number) {
    await this.ensureLoaded();
    const key = String(userId);

    await this.withWriteLock(async () => {
      this.entries.set(key, teamId);
      await this.flushLocked();
    });
  }

  async removeTeamId(userId: string) {
    await this.ensureLoaded();
    const key = String(userId);

    await this.withWriteLock(async () => {
      if (!this.entries.has(key)) {
        return;
      }
      this.entries.delete(key);
      await this.flushLocked();
    });
  }

  async allEntries(): Promise<TeamStoreState> {
    await this.ensureLoaded();
    return {
      entries: Object.fromEntries(sortEntries(this.entries)),
    };
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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TeamStoreError("team_ids.json が辞書形式ではありません。");
      }

      const map = new Map<string, number>();
      for (const [key, value] of Object.entries(parsed)) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          throw new TeamStoreError(
            `team_ids.json の値が数値化できません: key=${key}`
          );
        }
        map.set(String(key), Math.trunc(numeric));
      }

      this.entries = map;
      this.loaded = true;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        this.entries = new Map();
        this.loaded = true;
        return;
      }

      if (error instanceof TeamStoreError) {
        this.loaded = true;
        throw error;
      }

      throw new TeamStoreError("team_ids.json の読み込みに失敗しました。", {
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
    const entries = Object.fromEntries(sortEntries(this.entries));
    const directory = path.dirname(this.filePath);
    const tmpPath = `${this.filePath}.tmp`;

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2), "utf-8");
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      throw new TeamStoreError("team_ids.json の保存に失敗しました。", {
        cause: error,
      });
    }
  }
}
