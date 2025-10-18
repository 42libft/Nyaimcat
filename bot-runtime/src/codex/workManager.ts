import {
  notifyRunResult,
  notifyRunCancellation,
  notifyRunFailure,
} from "./notifications";
import { updateDocumentsForRun } from "./docUpdates";
import {
  codexExecutionQueue,
  type CodexExecutionQueue,
  type CodexQueueItem,
  type CodexQueueSnapshot,
  type CodexQueueCancelResult,
} from "./executionQueue";
import type { CodexRunnerOptions, CodexRunnerResult } from "./runner";
import { readTaskFile, type TaskFile } from "../tasks/inbox";
import { logger } from "../utils/logger";
import { isDocsUpdateEnabledByDefault } from "./settings";
import { isCodexCancellationError } from "./errors";
import { CodexProgressNotifier } from "./progressNotifier";
import { recordCodexRunFailure } from "./history";
import { codexFailureMonitor, type CodexFailureMonitor } from "./failureMonitor";

export type StartWorkOptions = {
  filename: string;
  notifyChannelId?: string | null;
  stdoutLimit?: number;
  stderrLimit?: number;
  updateDocs?: boolean;
  recordHistory?: boolean;
};

export type StartWorkResult = {
  queueId: string;
  task: TaskFile;
  queueItem: CodexQueueItem | null;
};

type StoredRunResult = {
  queueId: string;
  result: CodexRunnerResult;
};

const toErrorInfo = (
  value: unknown
): { message: string; stack: string | null } => {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: typeof value.stack === "string" ? value.stack : null,
    };
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    const record = value as { message?: unknown; stack?: unknown };
    return {
      message:
        typeof record.message === "string"
          ? record.message
          : String(record.message),
      stack: typeof record.stack === "string" ? record.stack : null,
    };
  }

  const stack =
    value &&
    typeof value === "object" &&
    "stack" in value &&
    typeof (value as { stack?: unknown }).stack === "string"
      ? ((value as { stack?: unknown }).stack as string)
      : null;

  return {
    message: String(value),
    stack,
  };
};

export class CodexWorkManager {
  private readonly queue: CodexExecutionQueue;
  private readonly progressNotifier: CodexProgressNotifier;
  private readonly failureMonitor: CodexFailureMonitor;
  private readonly recentResults = new Map<string, StoredRunResult>();
  private readonly recentResultLimit = 30;

  constructor(queue: CodexExecutionQueue = codexExecutionQueue) {
    this.queue = queue;
    this.progressNotifier = new CodexProgressNotifier(queue);
    this.failureMonitor = codexFailureMonitor;
  }

  async startWork(options: StartWorkOptions): Promise<StartWorkResult> {
    const task = await readTaskFile(options.filename);

    const runnerOptions: CodexRunnerOptions = {};
    if (typeof options.recordHistory === "boolean") {
      runnerOptions.recordHistory = options.recordHistory;
    }

    const { id, promise } = this.queue.enqueue(options.filename, runnerOptions);

    const notifyOptions: Parameters<typeof notifyRunResult>[1] = {};
    if (options.notifyChannelId !== undefined) {
      notifyOptions.channelId = options.notifyChannelId;
    }
    if (typeof options.stdoutLimit === "number") {
      notifyOptions.stdoutLimit = options.stdoutLimit;
    }
    if (typeof options.stderrLimit === "number") {
      notifyOptions.stderrLimit = options.stderrLimit;
    }

    this.progressNotifier.track({
      queueId: id,
      task,
      notifyOptions,
    });

    const shouldUpdateDocs =
      typeof options.updateDocs === "boolean"
        ? options.updateDocs
        : isDocsUpdateEnabledByDefault();

    promise
      .then(async (result) => {
        this.rememberResult(id, result);

        try {
          await notifyRunResult(result, notifyOptions);
        } catch (error) {
          logger.warn("Codex 実行結果の通知処理でエラーが発生しました", {
            queueId: id,
            filename: options.filename,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (shouldUpdateDocs) {
          try {
            await updateDocumentsForRun(result);
          } catch (error) {
            logger.warn("Codex 実行結果のドキュメント更新に失敗しました", {
              queueId: id,
              filename: options.filename,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (isCodexCancellationError(error)) {
          logger.info("Codex 実行がキャンセルにより終了しました", {
            queueId: id,
            filename: options.filename,
            error: message,
          });

          try {
            const queueItem = this.queue.getItem(id);
            await notifyRunCancellation(
              {
                task,
                queueId: id,
                queueItem,
                reason: message,
                runId: error.runId ?? null,
              },
              notifyOptions
            );
          } catch (notifyError) {
            logger.warn("Codex 実行キャンセルの通知処理でエラーが発生しました", {
              queueId: id,
              filename: options.filename,
              error:
                notifyError instanceof Error
                  ? notifyError.message
                  : String(notifyError),
            });
          }
        } else {
          logger.error("Codex 実行キュー処理でエラーが発生しました", {
            queueId: id,
            filename: options.filename,
            error: message,
          });

          const errorInfo = toErrorInfo(error);
          const queueItem = this.queue.getItem(id);
          let failureRecordPath: string | null = null;

          try {
            failureRecordPath = await recordCodexRunFailure({
              queueId: id,
              task: {
                filename: task.filename,
                title: task.metadata.title,
                priority: task.metadata.priority,
              },
              queueItem,
              error: errorInfo,
            });
          } catch (recordError) {
            logger.warn("Codex 実行失敗ログの保存に失敗しました", {
              queueId: id,
              filename: options.filename,
              error:
                recordError instanceof Error
                  ? recordError.message
                  : String(recordError),
            });
          }

          try {
            await notifyRunFailure(
              {
                task,
                queueId: id,
                queueItem,
                error: errorInfo,
                failureRecordPath,
              },
              notifyOptions
            );
          } catch (notifyError) {
            logger.warn("Codex 実行失敗通知の送信でエラーが発生しました", {
              queueId: id,
              filename: options.filename,
              error:
                notifyError instanceof Error
                  ? notifyError.message
                  : String(notifyError),
            });
          }

          void this.failureMonitor.evaluate();
        }
      });

    const queueItem = this.queue.getItem(id);

    return {
      queueId: id,
      task,
      queueItem,
    };
  }

  private rememberResult(queueId: string, result: CodexRunnerResult) {
    this.recentResults.set(result.runId, { queueId, result });

    while (this.recentResults.size > this.recentResultLimit) {
      const oldestKey = this.recentResults.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.recentResults.delete(oldestKey);
    }
  }

  cancel(queueId: string): CodexQueueCancelResult {
    return this.queue.cancel(queueId);
  }

  getQueueSnapshot(): CodexQueueSnapshot {
    return this.queue.getSnapshot();
  }

  getQueueItemByRunId(runId: string): CodexQueueItem | null {
    const snapshot = this.queue.getSnapshot();

    if (snapshot.active?.result?.runId === runId) {
      return snapshot.active;
    }

    const historyMatch = snapshot.history.find(
      (item) => item.result?.runId === runId
    );
    if (historyMatch) {
      return historyMatch;
    }

    return null;
  }

  getRecentRunResult(runId: string): StoredRunResult | null {
    return this.recentResults.get(runId) ?? null;
  }

  getQueueItem(queueId: string): CodexQueueItem | null {
    return this.queue.getItem(queueId);
  }
}

export const codexWorkManager = new CodexWorkManager();
