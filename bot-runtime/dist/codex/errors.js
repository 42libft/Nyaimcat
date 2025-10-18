"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCodexRetryExhaustedError = exports.CodexRetryExhaustedError = exports.isCodexCancellationError = exports.CodexCancellationError = void 0;
/**
 * Codex 実行がキャンセルされたことを示すエラー。
 *
 * - `runId` は Codex Runner で生成された実行 ID。
 * - `queueId` は Codex 実行キュー内で付与された ID。
 */
class CodexCancellationError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "CodexCancellationError";
        this.runId = options.runId ?? null;
        this.queueId = options.queueId ?? null;
    }
}
exports.CodexCancellationError = CodexCancellationError;
const isCodexCancellationError = (error) => error instanceof CodexCancellationError;
exports.isCodexCancellationError = isCodexCancellationError;
class CodexRetryExhaustedError extends Error {
    constructor(message, options) {
        super(message);
        this.name = "CodexRetryExhaustedError";
        this.attempts = options.attempts;
        this.maxAttempts = options.maxAttempts;
        this.reasons = options.reasons;
        this.lastResult = options.lastResult;
    }
}
exports.CodexRetryExhaustedError = CodexRetryExhaustedError;
const isCodexRetryExhaustedError = (error) => error instanceof CodexRetryExhaustedError;
exports.isCodexRetryExhaustedError = isCodexRetryExhaustedError;
//# sourceMappingURL=errors.js.map