import { promises as fs } from "fs";
import path from "path";

import type { CodexRunnerResult } from "./runner";
import type { CodexQueueItem } from "./executionQueue";
import { RUN_HISTORY_DIR, RUN_FAILURE_DIR } from "../tasks/paths";

const DEFAULT_STDOUT_LIMIT = 10_000;
const DEFAULT_STDERR_LIMIT = 10_000;

const ensureHistoryDirectory = async () => {
  await fs.mkdir(RUN_HISTORY_DIR, { recursive: true });
};

const ensureFailureDirectory = async () => {
  await fs.mkdir(RUN_FAILURE_DIR, { recursive: true });
};

const truncateLog = (value: string, limit: number) => {
  if (value.length <= limit) {
    return { content: value, truncated: false };
  }

  return {
    content: value.slice(0, limit),
    truncated: true,
  };
};

const summaryFromTaskFilename = (filename: string) => {
  const withoutExt = filename.replace(/\.md$/i, "");
  return withoutExt.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "task";
};

const buildHistoryFilename = (result: CodexRunnerResult) => {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const slug = summaryFromTaskFilename(result.task.filename);
  return `${timestamp}-${result.runId}-${slug}.json`;
};

const sanitizeForFilename = (value: string, fallback: string) => {
  const normalized = value.replace(/[^a-z0-9_-]/gi, "-");
  const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed.length > 0 ? collapsed : fallback;
};

const buildFailureHistoryFilename = (queueId: string, taskFilename: string) => {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const queueSlug = sanitizeForFilename(queueId, "queue");
  const taskSlug = summaryFromTaskFilename(taskFilename);
  return `${timestamp}-${queueSlug}-${taskSlug}-failure.json`;
};

const resolveHistoryFilePath = (filePath: string) => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(RUN_HISTORY_DIR, filePath);
};

export type RecordedRun = {
  run_id: string;
  executed_at: string;
  task: {
    filename: string;
    title: string;
    priority: string;
  };
  command: {
    bin: string;
    args: string[];
    cwd: string;
  };
  exit_code: number | null;
  signal: string | null;
  timed_out: boolean;
  duration_ms: number;
  stdout: {
    content: string;
    truncated: boolean;
    original_length: number;
  };
  stderr: {
    content: string;
    truncated: boolean;
    original_length: number;
  };
  files: {
    path: string;
    status: string;
    original_path: string | null;
  }[];
  retry: {
    attempts: number;
    max_attempts: number;
    performed_retries: number;
    reasons: string[];
  } | null;
};

export type RecordedRunWithPath = {
  filePath: string;
  run: RecordedRun;
};

export type RecordedRunFailure = {
  queue_id: string;
  recorded_at: string;
  task: {
    filename: string;
    title: string;
    priority: string;
  };
  status: string;
  cancel_requested: boolean;
  requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: {
    message: string;
    stack: string | null;
  };
};

export type RecordedRunFailureWithPath = {
  filePath: string;
  failure: RecordedRunFailure;
};

export const loadRecordedRunFromPath = async (
  historyPath: string
): Promise<RecordedRunWithPath | null> => {
  const resolved = resolveHistoryFilePath(historyPath);

  try {
    const content = await fs.readFile(resolved, "utf-8");
    const run = JSON.parse(content) as RecordedRun;
    return { filePath: resolved, run };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const findRecordedRunById = async (
  runId: string
): Promise<RecordedRunWithPath | null> => {
  await ensureHistoryDirectory();

  const entries = await fs.readdir(RUN_HISTORY_DIR);
  const target = entries.find((filename) => filename.includes(runId));

  if (!target) {
    return null;
  }

  return loadRecordedRunFromPath(path.join(RUN_HISTORY_DIR, target));
};

export const recordCodexRunResult = async (result: CodexRunnerResult) => {
  await ensureHistoryDirectory();

  const stdoutLimit =
    Number.parseInt(process.env.CODEX_CLI_HISTORY_STDOUT_LIMIT ?? "", 10) ||
    DEFAULT_STDOUT_LIMIT;
  const stderrLimit =
    Number.parseInt(process.env.CODEX_CLI_HISTORY_STDERR_LIMIT ?? "", 10) ||
    DEFAULT_STDERR_LIMIT;

  const stdoutInfo = truncateLog(result.stdout, stdoutLimit);
  const stderrInfo = truncateLog(result.stderr, stderrLimit);

  const payload: RecordedRun = {
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
  const filePath = path.join(RUN_HISTORY_DIR, filename);

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

  return filePath;
};

export type RecordCodexRunFailureOptions = {
  queueId: string;
  task: {
    filename: string;
    title: string;
    priority: string;
  };
  queueItem?: CodexQueueItem | null;
  error: {
    message: string;
    stack?: string | null;
  };
};

export const recordCodexRunFailure = async (
  options: RecordCodexRunFailureOptions
) => {
  await ensureFailureDirectory();

  const queueItem = options.queueItem ?? null;
  const payload: RecordedRunFailure = {
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

  const filename = buildFailureHistoryFilename(
    options.queueId,
    options.task.filename
  );
  const filePath = path.join(RUN_FAILURE_DIR, filename);

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

  return filePath;
};
