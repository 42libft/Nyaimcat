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
export declare class CodexCancellationError extends Error {
    readonly runId: string | null;
    readonly queueId: string | null;
    constructor(message: string, options?: CodexCancellationErrorOptions);
}
export declare const isCodexCancellationError: (error: unknown) => error is CodexCancellationError;
export type CodexRetryExhaustedErrorOptions = {
    attempts: number;
    maxAttempts: number;
    reasons: string[];
    lastResult: CodexRunnerResult;
};
export declare class CodexRetryExhaustedError extends Error {
    readonly attempts: number;
    readonly maxAttempts: number;
    readonly reasons: string[];
    readonly lastResult: CodexRunnerResult;
    constructor(message: string, options: CodexRetryExhaustedErrorOptions);
}
export declare const isCodexRetryExhaustedError: (error: unknown) => error is CodexRetryExhaustedError;
//# sourceMappingURL=errors.d.ts.map