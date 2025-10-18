import type { CodexRunnerResult } from "./runner";

export type CodexCancellationErrorOptions = {
  runId?: string | null;
  queueId?: string | null;
};

/**
 * Codex 実行がキャンセルされたことを示すエラー。
 *
 * - `runId` は Codex Runner で生成された実行 ID。
 * - `queueId` は Codex 実行キュー内で付与された ID。
 */
export class CodexCancellationError extends Error {
  readonly runId: string | null;
  readonly queueId: string | null;

  constructor(
    message: string,
    options: CodexCancellationErrorOptions = {}
  ) {
    super(message);
    this.name = "CodexCancellationError";
    this.runId = options.runId ?? null;
    this.queueId = options.queueId ?? null;
  }
}

export const isCodexCancellationError = (
  error: unknown
): error is CodexCancellationError => error instanceof CodexCancellationError;

export type CodexRetryExhaustedErrorOptions = {
  attempts: number;
  maxAttempts: number;
  reasons: string[];
  lastResult: CodexRunnerResult;
};

export class CodexRetryExhaustedError extends Error {
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly reasons: string[];
  readonly lastResult: CodexRunnerResult;

  constructor(
    message: string,
    options: CodexRetryExhaustedErrorOptions
  ) {
    super(message);
    this.name = "CodexRetryExhaustedError";
    this.attempts = options.attempts;
    this.maxAttempts = options.maxAttempts;
    this.reasons = options.reasons;
    this.lastResult = options.lastResult;
  }
}

export const isCodexRetryExhaustedError = (
  error: unknown
): error is CodexRetryExhaustedError => error instanceof CodexRetryExhaustedError;
