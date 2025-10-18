"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCodexRunFailure = exports.recordCodexRunResult = exports.findRecordedRunById = exports.loadRecordedRunFromPath = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../tasks/paths");
const DEFAULT_STDOUT_LIMIT = 10000;
const DEFAULT_STDERR_LIMIT = 10000;
const ensureHistoryDirectory = async () => {
    await fs_1.promises.mkdir(paths_1.RUN_HISTORY_DIR, { recursive: true });
};
const ensureFailureDirectory = async () => {
    await fs_1.promises.mkdir(paths_1.RUN_FAILURE_DIR, { recursive: true });
};
const truncateLog = (value, limit) => {
    if (value.length <= limit) {
        return { content: value, truncated: false };
    }
    return {
        content: value.slice(0, limit),
        truncated: true,
    };
};
const summaryFromTaskFilename = (filename) => {
    const withoutExt = filename.replace(/\.md$/i, "");
    return withoutExt.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "task";
};
const buildHistoryFilename = (result) => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const slug = summaryFromTaskFilename(result.task.filename);
    return `${timestamp}-${result.runId}-${slug}.json`;
};
const sanitizeForFilename = (value, fallback) => {
    const normalized = value.replace(/[^a-z0-9_-]/gi, "-");
    const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
    return collapsed.length > 0 ? collapsed : fallback;
};
const buildFailureHistoryFilename = (queueId, taskFilename) => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const queueSlug = sanitizeForFilename(queueId, "queue");
    const taskSlug = summaryFromTaskFilename(taskFilename);
    return `${timestamp}-${queueSlug}-${taskSlug}-failure.json`;
};
const resolveHistoryFilePath = (filePath) => {
    if (path_1.default.isAbsolute(filePath)) {
        return filePath;
    }
    return path_1.default.join(paths_1.RUN_HISTORY_DIR, filePath);
};
const loadRecordedRunFromPath = async (historyPath) => {
    const resolved = resolveHistoryFilePath(historyPath);
    try {
        const content = await fs_1.promises.readFile(resolved, "utf-8");
        const run = JSON.parse(content);
        return { filePath: resolved, run };
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw error;
    }
};
exports.loadRecordedRunFromPath = loadRecordedRunFromPath;
const findRecordedRunById = async (runId) => {
    await ensureHistoryDirectory();
    const entries = await fs_1.promises.readdir(paths_1.RUN_HISTORY_DIR);
    const target = entries.find((filename) => filename.includes(runId));
    if (!target) {
        return null;
    }
    return (0, exports.loadRecordedRunFromPath)(path_1.default.join(paths_1.RUN_HISTORY_DIR, target));
};
exports.findRecordedRunById = findRecordedRunById;
const recordCodexRunResult = async (result) => {
    await ensureHistoryDirectory();
    const stdoutLimit = Number.parseInt(process.env.CODEX_CLI_HISTORY_STDOUT_LIMIT ?? "", 10) ||
        DEFAULT_STDOUT_LIMIT;
    const stderrLimit = Number.parseInt(process.env.CODEX_CLI_HISTORY_STDERR_LIMIT ?? "", 10) ||
        DEFAULT_STDERR_LIMIT;
    const stdoutInfo = truncateLog(result.stdout, stdoutLimit);
    const stderrInfo = truncateLog(result.stderr, stderrLimit);
    const payload = {
        run_id: result.runId,
        executed_at: new Date().toISOString(),
        task: {
            filename: result.task.filename,
            title: result.task.metadata.title,
            priority: result.task.metadata.priority,
        },
        command: result.command,
        exit_code: result.exitCode,
        signal: result.signal,
        timed_out: result.timedOut,
        duration_ms: result.durationMs,
        stdout: {
            content: stdoutInfo.content,
            truncated: stdoutInfo.truncated,
            original_length: result.stdout.length,
        },
        stderr: {
            content: stderrInfo.content,
            truncated: stderrInfo.truncated,
            original_length: result.stderr.length,
        },
        files: result.fileChanges.map((change) => ({
            path: change.path,
            status: change.status,
            original_path: change.originalPath ?? null,
        })),
        retry: result.retry
            ? {
                attempts: result.retry.attempts,
                max_attempts: result.retry.maxAttempts,
                performed_retries: result.retry.performedRetries,
                reasons: [...result.retry.reasons],
            }
            : null,
    };
    const filename = buildHistoryFilename(result);
    const filePath = path_1.default.join(paths_1.RUN_HISTORY_DIR, filename);
    await fs_1.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
    return filePath;
};
exports.recordCodexRunResult = recordCodexRunResult;
const recordCodexRunFailure = async (options) => {
    await ensureFailureDirectory();
    const queueItem = options.queueItem ?? null;
    const payload = {
        queue_id: options.queueId,
        recorded_at: new Date().toISOString(),
        task: {
            filename: options.task.filename,
            title: options.task.title,
            priority: options.task.priority,
        },
        status: queueItem?.status ?? "failed",
        cancel_requested: queueItem?.cancelRequested ?? false,
        requested_at: queueItem?.requestedAt ?? null,
        started_at: queueItem?.startedAt ?? null,
        finished_at: queueItem?.finishedAt ?? null,
        error: {
            message: options.error.message,
            stack: options.error.stack ?? null,
        },
    };
    const filename = buildFailureHistoryFilename(options.queueId, options.task.filename);
    const filePath = path_1.default.join(paths_1.RUN_FAILURE_DIR, filename);
    await fs_1.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
    return filePath;
};
exports.recordCodexRunFailure = recordCodexRunFailure;
//# sourceMappingURL=history.js.map