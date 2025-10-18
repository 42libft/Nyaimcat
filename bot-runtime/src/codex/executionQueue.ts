import { randomUUID } from "crypto";

import type { CodexRunnerOptions, CodexRunnerResult } from "./runner";
import { runCodexTask } from "./runner";
import { CodexCancellationError, CodexRetryExhaustedError } from "./errors";
import { logger } from "../utils/logger";

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_MAX_ATTEMPTS = 2;
const RETRYABLE_EXIT_CODES = new Set([130, 137]);
const RETRYABLE_SIGNALS = new Set<NodeJS.Signals>(["SIGTERM", "SIGKILL", "SIGINT"]);

export type CodexQueueStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type CodexQueueResultSummary = {
  runId: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  historyPath: string | null;
  command: CodexRunnerResult["command"];
  task: {
    filename: string;
    title: string;
    priority: string;
  };
  fileChanges: CodexRunnerResult["fileChanges"];
  retry: CodexQueueRetryInfo;
};

export type CodexQueueError = {
  message: string;
  stack?: string;
};

export type CodexQueueRetryInfo = {
  attempts: number;
  maxAttempts: number;
  performedRetries: number;
  reasons: string[];
};

export type CodexQueueItem = {
  id: string;
  filename: string;
  status: CodexQueueStatus;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequested: boolean;
  retry: CodexQueueRetryInfo;
  result?: CodexQueueResultSummary;
  error?: CodexQueueError;
};

export type CodexQueueSnapshot = {
  active: CodexQueueItem | null;
  pending: CodexQueueItem[];
  history: CodexQueueItem[];
};

export type CodexQueueCancelResult =
  | { ok: true; state: "cancelled"; item: CodexQueueItem }
  | { ok: true; state: "running"; item: CodexQueueItem }
  | { ok: false; state: "finished"; item: CodexQueueItem }
  | { ok: false; state: "not_found" };

type InternalQueueItem = {
  id: string;
  filename: string;
  options?: CodexRunnerOptions;
  status: CodexQueueStatus;
  requestedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  cancelRequested: boolean;
  attempts: number;
  maxAttempts: number;
  retryReasons: string[];
  abortController?: AbortController;
  resolve: (result: CodexRunnerResult) => void;
  reject: (error: unknown) => void;
  resultSummary?: CodexQueueResultSummary;
  error?: CodexQueueError;
};

type QueueListener = (snapshot: CodexQueueSnapshot) => void;

type QueueRunner = (
  filename: string,
  options?: CodexRunnerOptions
) => Promise<CodexRunnerResult>;

type QueueConfig = {
  historyLimit?: number;
  runner?: QueueRunner;
};

const summarizeResult = (
  result: CodexRunnerResult,
  retry: CodexQueueRetryInfo
): CodexQueueResultSummary => ({
  runId: result.runId,
  exitCode: result.exitCode,
  signal: result.signal,
  durationMs: result.durationMs,
  timedOut: result.timedOut,
  historyPath: result.historyPath ?? null,
  command: result.command,
  task: {
    filename: result.task.filename,
    title: result.task.metadata.title,
    priority: result.task.metadata.priority,
  },
  fileChanges: result.fileChanges,
  retry,
});

const toPublicItem = (item: InternalQueueItem): CodexQueueItem => {
  const base: CodexQueueItem = {
    id: item.id,
    filename: item.filename,
    status: item.status,
    requestedAt: item.requestedAt.toISOString(),
    cancelRequested: item.cancelRequested,
    retry: buildRetryInfo(item),
  };

  if (item.startedAt) {
    base.startedAt = item.startedAt.toISOString();
  }

  if (item.finishedAt) {
    base.finishedAt = item.finishedAt.toISOString();
  }

  if (item.resultSummary) {
    base.result = item.resultSummary;
  }

  if (item.error) {
    base.error = item.error;
  }

  return base;
};

const toQueueError = (error: unknown): CodexQueueError => {
  if (error instanceof Error) {
    const info: CodexQueueError = {
      message: error.message,
    };

    if (error.stack) {
      info.stack = error.stack;
    }

    return info;
  }

  return {
    message: String(error),
  };
};

const buildRetryInfo = (item: InternalQueueItem): CodexQueueRetryInfo => ({
  attempts: item.attempts,
  maxAttempts: item.maxAttempts,
  performedRetries: item.retryReasons.length,
  reasons: [...item.retryReasons],
});

const determineRetryReason = (
  result: CodexRunnerResult
): string | null => {
  if (result.timedOut) {
    return "timeout";
  }

  if (
    typeof result.exitCode === "number" &&
    RETRYABLE_EXIT_CODES.has(result.exitCode)
  ) {
    return `exit_code_${result.exitCode}`;
  }

  if (result.signal && RETRYABLE_SIGNALS.has(result.signal)) {
    return `signal_${result.signal}`;
  }

  return null;
};

/**
 * Codex CLI 実行を直列化し、キューの状態を管理するクラス。
 *
 * - キューに登録されたタスクは 1 件ずつ順次実行される。
 * - キャンセル要求は保留中のタスクに対して即時反映し、実行中の場合は
 *   `cancelRequested` フラグを立てて完了待ちとする（今後の強制終了に備える）。
 * - 最近の履歴は `historyLimit` 件まで保持する。
 */
export class CodexExecutionQueue {
  private readonly historyLimit: number;
  private readonly runner: QueueRunner;
  private pending: InternalQueueItem[] = [];
  private active: InternalQueueItem | null = null;
  private history: CodexQueueItem[] = [];
  private processing = false;
  private listeners = new Set<QueueListener>();

  constructor(config: QueueConfig = {}) {
    this.historyLimit = config.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.runner = config.runner ?? runCodexTask;
  }

  enqueue(
    filename: string,
    options?: CodexRunnerOptions
  ): { id: string; promise: Promise<CodexRunnerResult> } {
    const id = randomUUID();

    let resolveFn: (result: CodexRunnerResult) => void;
    let rejectFn: (error: unknown) => void;

    const promise = new Promise<CodexRunnerResult>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const item: InternalQueueItem = {
      id,
      filename,
      status: "pending",
      requestedAt: new Date(),
      cancelRequested: false,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      retryReasons: [],
      resolve: resolveFn!,
      reject: rejectFn!,
    };

    if (options) {
      item.options = options;
    }

    this.pending.push(item);
    this.notifyListeners();
    void this.processQueue();

    return { id, promise };
  }

  cancel(queueId: string): CodexQueueCancelResult {
    const pendingIndex = this.pending.findIndex((item) => item.id === queueId);

    if (pendingIndex >= 0) {
      const [target] = this.pending.splice(pendingIndex, 1);

      if (target) {
        target.status = "cancelled";
        target.cancelRequested = true;
        target.finishedAt = new Date();
        const error = new CodexCancellationError(
          `Codex 実行キューがキャンセルされました (ID: ${queueId})`,
          { queueId }
        );
        target.error = toQueueError(error);
        target.reject(error);
        this.appendHistory(target);
        this.notifyListeners();
        return {
          ok: true,
          state: "cancelled",
          item: toPublicItem(target),
        };
      }
    }

    if (this.active && this.active.id === queueId) {
      this.active.cancelRequested = true;
      if (
        this.active.abortController &&
        !this.active.abortController.signal.aborted
      ) {
        const reason = new CodexCancellationError(
          `Codex 実行キューがキャンセルされました (ID: ${queueId})`,
          { queueId }
        );
        this.active.abortController.abort(reason);
      }
      this.notifyListeners();
      return {
        ok: true,
        state: "running",
        item: toPublicItem(this.active),
      };
    }

    const historyItem = this.history.find((item) => item.id === queueId);
    if (historyItem) {
      return {
        ok: false,
        state: "finished",
        item: historyItem,
      };
    }

    return {
      ok: false,
      state: "not_found",
    };
  }

  getSnapshot(): CodexQueueSnapshot {
    return {
      active: this.active ? toPublicItem(this.active) : null,
      pending: this.pending.map((item) => toPublicItem(item)),
      history: [...this.history],
    };
  }

  getItem(queueId: string): CodexQueueItem | null {
    if (this.active?.id === queueId) {
      return toPublicItem(this.active);
    }

    const pendingItem = this.pending.find((item) => item.id === queueId);
    if (pendingItem) {
      return toPublicItem(pendingItem);
    }

    const historyItem = this.history.find((item) => item.id === queueId);
    return historyItem ?? null;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.pending.length > 0) {
      const next = this.pending.shift();

      if (!next) {
        break;
      }

      if (next.cancelRequested) {
        next.status = "cancelled";
        next.finishedAt = new Date();
        this.appendHistory(next);
        continue;
      }

      this.active = next;
      next.status = "running";
      if (!next.startedAt) {
        next.startedAt = new Date();
      }
      this.notifyListeners();

      try {
        while (true) {
          if (next.cancelRequested) {
            throw new CodexCancellationError(
              `Codex 実行キューがキャンセルされました (ID: ${next.id})`,
              { queueId: next.id }
            );
          }

          const attempt = next.attempts + 1;
          const abortController = new AbortController();
          next.abortController = abortController;

          const runnerOptions: CodexRunnerOptions | undefined = next.options
            ? { ...next.options, signal: abortController.signal }
            : { signal: abortController.signal };

          let result: CodexRunnerResult;

          try {
            result = await this.runner(next.filename, runnerOptions);
          } finally {
            delete next.abortController;
          }

          next.attempts = attempt;
          const retryReason = determineRetryReason(result);

          if (retryReason) {
            next.retryReasons.push(retryReason);
            const retryInfo = buildRetryInfo(next);
            this.notifyListeners();

            if (next.cancelRequested) {
              throw new CodexCancellationError(
                `Codex 実行キューがキャンセルされました (ID: ${next.id})`,
                { queueId: next.id }
              );
            }

            if (next.attempts < next.maxAttempts) {
              logger.warn("Codex 実行を自動リトライします", {
                queueId: next.id,
                filename: next.filename,
                attempt: next.attempts,
                maxAttempts: next.maxAttempts,
                reason: retryReason,
                runId: result.runId,
              });
              continue;
            }

            throw new CodexRetryExhaustedError(
              `Codex 実行がリトライ上限に達しました (ID: ${next.id}, reason=${retryReason})`,
              {
                attempts: next.attempts,
                maxAttempts: next.maxAttempts,
                reasons: [...next.retryReasons],
                lastResult: result,
              }
            );
          }

          const retryInfo = buildRetryInfo(next);
          result.retry = {
            attempts: retryInfo.attempts,
            maxAttempts: retryInfo.maxAttempts,
            performedRetries: retryInfo.performedRetries,
            reasons: [...retryInfo.reasons],
          };

          next.status = "succeeded";
          next.finishedAt = new Date();
          next.resultSummary = summarizeResult(result, retryInfo);
          next.resolve(result);
          break;
        }
      } catch (error) {
        next.finishedAt = new Date();
        next.status = next.cancelRequested ? "cancelled" : "failed";
        next.error = toQueueError(error);

        if (error instanceof CodexRetryExhaustedError) {
          logger.error("Codex 自動リトライが上限に達しました", {
            queueId: next.id,
            filename: next.filename,
            attempts: error.attempts,
            maxAttempts: error.maxAttempts,
            reasons: error.reasons,
            lastRunId: error.lastResult.runId,
          });

          const retryInfo: CodexQueueRetryInfo = {
            attempts: error.attempts,
            maxAttempts: error.maxAttempts,
            performedRetries: error.reasons.length,
            reasons: [...error.reasons],
          };

          const lastResult = error.lastResult;
          lastResult.retry = {
            attempts: retryInfo.attempts,
            maxAttempts: retryInfo.maxAttempts,
            performedRetries: retryInfo.performedRetries,
            reasons: [...retryInfo.reasons],
          };
          next.resultSummary = summarizeResult(lastResult, retryInfo);
        }

        if (next.cancelRequested) {
          logger.info("Codex 実行がキャンセルされました", {
            queueId: next.id,
            filename: next.filename,
          });
        }

        next.reject(error);
      } finally {
        delete next.abortController;
        this.appendHistory(next);
        this.active = null;
        this.notifyListeners();
      }
    }

    this.processing = false;
  }

  private appendHistory(item: InternalQueueItem) {
    const publicItem = toPublicItem(item);
    this.history.unshift(publicItem);

    if (this.history.length > this.historyLimit) {
      this.history.length = this.historyLimit;
    }
  }

  private notifyListeners() {
    if (this.listeners.size === 0) {
      return;
    }

    const snapshot = this.getSnapshot();

    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        logger.warn("CodexExecutionQueue リスナーの呼び出しに失敗しました", {
          error:
            error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}

export const codexExecutionQueue = new CodexExecutionQueue();
