"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codexWorkManager = exports.CodexWorkManager = void 0;
const notifications_1 = require("./notifications");
const docUpdates_1 = require("./docUpdates");
const executionQueue_1 = require("./executionQueue");
const inbox_1 = require("../tasks/inbox");
const logger_1 = require("../utils/logger");
const settings_1 = require("./settings");
const errors_1 = require("./errors");
const progressNotifier_1 = require("./progressNotifier");
const history_1 = require("./history");
const failureMonitor_1 = require("./failureMonitor");
const toErrorInfo = (value) => {
    if (value instanceof Error) {
        return {
            message: value.message,
            stack: typeof value.stack === "string" ? value.stack : null,
        };
    }
    if (value &&
        typeof value === "object" &&
        "message" in value &&
        typeof value.message === "string") {
        const record = value;
        return {
            message: typeof record.message === "string"
                ? record.message
                : String(record.message),
            stack: typeof record.stack === "string" ? record.stack : null,
        };
    }
    const stack = value &&
        typeof value === "object" &&
        "stack" in value &&
        typeof value.stack === "string"
        ? value.stack
        : null;
    return {
        message: String(value),
        stack,
    };
};
class CodexWorkManager {
    constructor(queue = executionQueue_1.codexExecutionQueue) {
        this.recentResults = new Map();
        this.recentResultLimit = 30;
        this.queue = queue;
        this.progressNotifier = new progressNotifier_1.CodexProgressNotifier(queue);
        this.failureMonitor = failureMonitor_1.codexFailureMonitor;
    }
    async startWork(options) {
        const task = await (0, inbox_1.readTaskFile)(options.filename);
        const runnerOptions = {};
        if (typeof options.recordHistory === "boolean") {
            runnerOptions.recordHistory = options.recordHistory;
        }
        const { id, promise } = this.queue.enqueue(options.filename, runnerOptions);
        const notifyOptions = {};
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
        const shouldUpdateDocs = typeof options.updateDocs === "boolean"
            ? options.updateDocs
            : (0, settings_1.isDocsUpdateEnabledByDefault)();
        promise
            .then(async (result) => {
            this.rememberResult(id, result);
            try {
                await (0, notifications_1.notifyRunResult)(result, notifyOptions);
            }
            catch (error) {
                logger_1.logger.warn("Codex 実行結果の通知処理でエラーが発生しました", {
                    queueId: id,
                    filename: options.filename,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            if (shouldUpdateDocs) {
                try {
                    await (0, docUpdates_1.updateDocumentsForRun)(result);
                }
                catch (error) {
                    logger_1.logger.warn("Codex 実行結果のドキュメント更新に失敗しました", {
                        queueId: id,
                        filename: options.filename,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        })
            .catch(async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if ((0, errors_1.isCodexCancellationError)(error)) {
                logger_1.logger.info("Codex 実行がキャンセルにより終了しました", {
                    queueId: id,
                    filename: options.filename,
                    error: message,
                });
                try {
                    const queueItem = this.queue.getItem(id);
                    await (0, notifications_1.notifyRunCancellation)({
                        task,
                        queueId: id,
                        queueItem,
                        reason: message,
                        runId: error.runId ?? null,
                    }, notifyOptions);
                }
                catch (notifyError) {
                    logger_1.logger.warn("Codex 実行キャンセルの通知処理でエラーが発生しました", {
                        queueId: id,
                        filename: options.filename,
                        error: notifyError instanceof Error
                            ? notifyError.message
                            : String(notifyError),
                    });
                }
            }
            else {
                logger_1.logger.error("Codex 実行キュー処理でエラーが発生しました", {
                    queueId: id,
                    filename: options.filename,
                    error: message,
                });
                const errorInfo = toErrorInfo(error);
                const queueItem = this.queue.getItem(id);
                let failureRecordPath = null;
                try {
                    failureRecordPath = await (0, history_1.recordCodexRunFailure)({
                        queueId: id,
                        task: {
                            filename: task.filename,
                            title: task.metadata.title,
                            priority: task.metadata.priority,
                        },
                        queueItem,
                        error: errorInfo,
                    });
                }
                catch (recordError) {
                    logger_1.logger.warn("Codex 実行失敗ログの保存に失敗しました", {
                        queueId: id,
                        filename: options.filename,
                        error: recordError instanceof Error
                            ? recordError.message
                            : String(recordError),
                    });
                }
                try {
                    await (0, notifications_1.notifyRunFailure)({
                        task,
                        queueId: id,
                        queueItem,
                        error: errorInfo,
                        failureRecordPath,
                    }, notifyOptions);
                }
                catch (notifyError) {
                    logger_1.logger.warn("Codex 実行失敗通知の送信でエラーが発生しました", {
                        queueId: id,
                        filename: options.filename,
                        error: notifyError instanceof Error
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
    rememberResult(queueId, result) {
        this.recentResults.set(result.runId, { queueId, result });
        while (this.recentResults.size > this.recentResultLimit) {
            const oldestKey = this.recentResults.keys().next().value;
            if (!oldestKey) {
                break;
            }
            this.recentResults.delete(oldestKey);
        }
    }
    cancel(queueId) {
        return this.queue.cancel(queueId);
    }
    getQueueSnapshot() {
        return this.queue.getSnapshot();
    }
    getQueueItemByRunId(runId) {
        const snapshot = this.queue.getSnapshot();
        if (snapshot.active?.result?.runId === runId) {
            return snapshot.active;
        }
        const historyMatch = snapshot.history.find((item) => item.result?.runId === runId);
        if (historyMatch) {
            return historyMatch;
        }
        return null;
    }
    getRecentRunResult(runId) {
        return this.recentResults.get(runId) ?? null;
    }
    getQueueItem(queueId) {
        return this.queue.getItem(queueId);
    }
}
exports.CodexWorkManager = CodexWorkManager;
exports.codexWorkManager = new CodexWorkManager();
//# sourceMappingURL=workManager.js.map