import { logger } from "../utils/logger";

export type HealthIssueLevel = "warning" | "error";

export type HealthIssue = {
  id: string;
  level: HealthIssueLevel;
  message: string;
  detectedAt: string;
  details?: Record<string, unknown>;
};

export type HealthIssueChangeType = "created" | "updated";

export type HealthIssueChangeContext = {
  previous: HealthIssue | null;
  change: HealthIssueChangeType;
};

export type HealthRegistryObserver = {
  onReport?: (
    issue: HealthIssue,
    context: HealthIssueChangeContext
  ) => void | Promise<void>;
  onResolve?: (issue: HealthIssue) => void | Promise<void>;
};

const levelPriority: Record<HealthIssueLevel, number> = {
  error: 0,
  warning: 1,
};

export class HealthRegistry {
  private readonly issues = new Map<string, HealthIssue>();
  private readonly observers = new Set<HealthRegistryObserver>();

  subscribe(observer: HealthRegistryObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  private notifyReport(change: {
    issue: HealthIssue;
    context: HealthIssueChangeContext;
  }) {
    for (const observer of Array.from(this.observers)) {
      if (!observer.onReport) {
        continue;
      }
      try {
        const result = observer.onReport(change.issue, change.context);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((error) => {
            logger.warn("ヘルスチェック報告オブザーバの処理でエラーが発生しました", {
              issueId: change.issue.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error) {
        logger.warn("ヘルスチェック報告オブザーバの呼び出しに失敗しました", {
          issueId: change.issue.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private notifyResolve(issue: HealthIssue) {
    for (const observer of Array.from(this.observers)) {
      if (!observer.onResolve) {
        continue;
      }
      try {
        const result = observer.onResolve(issue);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((error) => {
            logger.warn("ヘルスチェック解消オブザーバの処理でエラーが発生しました", {
              issueId: issue.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error) {
        logger.warn("ヘルスチェック解消オブザーバの呼び出しに失敗しました", {
          issueId: issue.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  report(
    issue: Omit<HealthIssue, "detectedAt"> & { detectedAt?: string }
  ): boolean {
    const prev = this.issues.get(issue.id);
    const detectedAt =
      issue.detectedAt ?? prev?.detectedAt ?? new Date().toISOString();
    const next: HealthIssue = {
      id: issue.id,
      level: issue.level,
      message: issue.message,
      detectedAt,
      ...(issue.details !== undefined ? { details: issue.details } : {}),
    };

    this.issues.set(issue.id, next);

    if (!prev) {
      this.notifyReport({
        issue: next,
        context: { previous: null, change: "created" },
      });
      return true;
    }

    const changed =
      prev.level !== next.level ||
      prev.message !== next.message ||
      prev.detectedAt !== next.detectedAt;

    if (changed) {
      this.notifyReport({
        issue: next,
        context: { previous: prev, change: "updated" },
      });
    }

    return changed;
  }

  resolve(id: string): boolean {
    const prev = this.issues.get(id);
    if (!prev) {
      return false;
    }
    const deleted = this.issues.delete(id);
    if (deleted) {
      this.notifyResolve(prev);
    }
    return deleted;
  }

  has(id: string): boolean {
    return this.issues.has(id);
  }

  list(): HealthIssue[] {
    const entries = Array.from(this.issues.values());
    return entries.sort((a, b) => {
      const levelDiff =
        (levelPriority[a.level] ?? 10) - (levelPriority[b.level] ?? 10);
      if (levelDiff !== 0) {
        return levelDiff;
      }
      return a.detectedAt.localeCompare(b.detectedAt);
    });
  }
}

export const healthRegistry = new HealthRegistry();
