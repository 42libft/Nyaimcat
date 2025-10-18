"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCodexTask = exports.getDefaultCodexRunnerConfig = exports.buildPromptForTask = void 0;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
const inbox_1 = require("../tasks/inbox");
const paths_1 = require("../tasks/paths");
const logger_1 = require("../utils/logger");
const history_1 = require("./history");
const errors_1 = require("./errors");
const gitStatus_1 = require("../utils/gitStatus");
const security_1 = require("./security");
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);
const buildPromptForTask = (task) => {
    const metadata = task.metadata;
    const summary = metadata.summary && metadata.summary.trim().length > 0
        ? metadata.summary.trim()
        : "(概要未入力)";
    const lines = [];
    lines.push("# タスク情報");
    lines.push(`- タイトル: ${metadata.title}`);
    lines.push(`- 優先度: ${metadata.priority_label ?? metadata.priority ?? "(未設定)"}`);
    lines.push(`- 概要: ${summary}`);
    if (metadata.author?.tag || metadata.author?.id) {
        const authorTag = metadata.author?.tag ?? "(タグ未設定)";
        const authorId = metadata.author?.id ?? "(ID未設定)";
        lines.push(`- 依頼者: ${authorTag} (${authorId})`);
    }
    if (metadata.created_at) {
        lines.push(`- 受付日時: ${metadata.created_at}`);
    }
    lines.push("");
    lines.push("## 依頼本文");
    lines.push(task.body.length > 0 ? task.body : "(本文なし)");
    lines.push("");
    lines.push("## 指示");
    lines.push("- 依頼内容を確認し、日本語で対応内容をまとめてください。");
    lines.push("- 必要に応じてリポジトリ内のファイル更新やコマンド実行を行って構いません。");
    return lines.join("\n") + "\n";
};
exports.buildPromptForTask = buildPromptForTask;
const parseArgs = (value) => {
    if (!value) {
        return [];
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) &&
                parsed.every((item) => typeof item === "string")) {
                return parsed;
            }
        }
        catch (error) {
            logger_1.logger.warn("CODEX_CLI_ARGS の JSON 解析に失敗しました。スペース区切りとして処理します。", {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return trimmed.split(/\s+/);
};
const resolveDefaultConfig = () => {
    const bin = process.env.CODEX_CLI_BIN ?? "codex";
    const args = parseArgs(process.env.CODEX_CLI_ARGS);
    const cwd = process.env.CODEX_CLI_WORKDIR && process.env.CODEX_CLI_WORKDIR.length > 0
        ? process.env.CODEX_CLI_WORKDIR
        : paths_1.REPO_ROOT;
    const timeoutRaw = process.env.CODEX_CLI_TIMEOUT_MS;
    const timeoutParsed = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : NaN;
    const timeoutMs = Number.isFinite(timeoutParsed) && timeoutParsed > 0
        ? timeoutParsed
        : DEFAULT_TIMEOUT_MS;
    const recordHistoryEnv = process.env.CODEX_CLI_HISTORY_ENABLED;
    const recordHistory = recordHistoryEnv === undefined
        ? true
        : TRUTHY_VALUES.has(recordHistoryEnv.toLowerCase());
    return {
        bin,
        args,
        cwd: path_1.default.resolve(cwd),
        timeoutMs,
        recordHistory,
    };
};
exports.getDefaultCodexRunnerConfig = resolveDefaultConfig;
const buildTaskEnv = (task, runId) => {
    const metadata = task.metadata;
    const env = {
        CODEX_AGENT_RUN_ID: runId,
        CODEX_TASK_FILE: task.filePath,
        CODEX_TASK_FILENAME: task.filename,
        CODEX_TASK_TITLE: metadata.title,
        CODEX_TASK_PRIORITY: metadata.priority,
        CODEX_TASK_PRIORITY_LABEL: metadata.priority_label ?? "",
        CODEX_TASK_SUMMARY: metadata.summary ?? "",
        CODEX_TASK_CREATED_AT: metadata.created_at ?? "",
        CODEX_TASK_AUTHOR_ID: metadata.author?.id ?? "",
        CODEX_TASK_AUTHOR_TAG: metadata.author?.tag ?? "",
        CODEX_TASK_CHANNEL_ID: metadata.channel_id ?? "",
        CODEX_TASK_INTERACTION_ID: metadata.interaction_id ?? "",
        CODEX_TASK_BODY_LENGTH: `${task.body.length}`,
        CODEX_TASK_METADATA_JSON: JSON.stringify(metadata),
        CODEX_TASK_INBOX_DIR: paths_1.INBOX_DIR,
        CODEX_TASKS_ROOT: paths_1.TASKS_ROOT,
        CODEX_REPO_ROOT: paths_1.REPO_ROOT,
    };
    return env;
};
const runCodexTask = async (filename, options = {}) => {
    const task = await (0, inbox_1.readTaskFile)(filename);
    const runId = (0, crypto_1.randomUUID)();
    const defaultConfig = resolveDefaultConfig();
    let gitStatusBefore = null;
    const bin = options.bin ?? defaultConfig.bin;
    const rawArgs = options.args ?? defaultConfig.args;
    const baseArgs = rawArgs ? [...rawArgs] : [];
    const allowInteractive = TRUTHY_VALUES.has((process.env.CODEX_CLI_ALLOW_INTERACTIVE ?? "").toLowerCase());
    const needsExecFallback = !allowInteractive &&
        (baseArgs.length === 0 || baseArgs[0]?.startsWith("-"));
    const args = needsExecFallback ? ["exec", ...baseArgs] : baseArgs;
    const cwd = options.cwd ?? defaultConfig.cwd;
    const timeoutMs = options.timeoutMs ?? defaultConfig.timeoutMs;
    const recordHistory = options.recordHistory ?? defaultConfig.recordHistory;
    const signal = options.signal;
    const env = {
        ...process.env,
        ...options.env,
        ...buildTaskEnv(task, runId),
    };
    const command = (0, security_1.enforceCodexCliSafety)({
        bin,
        args,
        cwd,
    });
    if (needsExecFallback) {
        logger_1.logger.debug("Codex CLI を非インタラクティブモードで実行するため exec サブコマンドを付与しました", {
            runId,
            reason: baseArgs.length === 0 ? "no_args" : "leading_option",
            command,
        });
    }
    logger_1.logger.info("Codex CLI を起動します", {
        runId,
        command,
        timeoutMs,
        task: {
            filename: task.filename,
            title: task.metadata.title,
            priority: task.metadata.priority,
        },
    });
    const startAt = Date.now();
    if (signal?.aborted) {
        throw new errors_1.CodexCancellationError("Codex CLI の実行は開始前にキャンセルされました。", { runId });
    }
    try {
        gitStatusBefore = await (0, gitStatus_1.getGitStatusEntries)(paths_1.REPO_ROOT);
    }
    catch (error) {
        logger_1.logger.warn("Codex 実行前の Git ステータス取得に失敗しました", {
            runId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return await new Promise((resolve, reject) => {
        let timedOut = false;
        let killTimer;
        let forceKillTimer;
        let aborted = false;
        let abortReason;
        let stdout = "";
        let stderr = "";
        let child;
        const stdio = allowInteractive
            ? ["inherit", "pipe", "pipe"]
            : ["pipe", "pipe", "pipe"];
        try {
            child = (0, child_process_1.spawn)(command.bin, command.args, {
                cwd: command.cwd,
                env,
                stdio,
            });
        }
        catch (error) {
            reject(new Error(`Codex CLI の起動に失敗しました: ${error instanceof Error ? error.message : String(error)}`));
            return;
        }
        if (!allowInteractive) {
            if (child.stdin) {
                const prompt = (0, exports.buildPromptForTask)(task);
                child.stdin.end(prompt, "utf-8");
            }
            else {
                logger_1.logger.warn("Codex CLI の標準入力ストリームへアクセスできませんでした", {
                    runId,
                });
            }
        }
        const onAbort = () => {
            if (aborted) {
                return;
            }
            aborted = true;
            abortReason = signal?.reason;
            const reasonMessage = abortReason instanceof Error
                ? abortReason.message
                : abortReason === undefined
                    ? null
                    : String(abortReason);
            logger_1.logger.info("Codex CLI の実行にキャンセル要求を受信しました", {
                runId,
                reason: reasonMessage,
            });
            if (!child.killed) {
                child.kill("SIGTERM");
            }
            forceKillTimer = setTimeout(() => {
                if (!child.killed) {
                    child.kill("SIGKILL");
                }
            }, 5000);
        };
        if (signal) {
            signal.addEventListener("abort", onAbort, { once: true });
            if (signal.aborted) {
                onAbort();
            }
        }
        if (child.stdout) {
            child.stdout.setEncoding("utf-8");
            child.stdout.on("data", (chunk) => {
                stdout += chunk;
                options.hooks?.onStdout?.(chunk);
            });
        }
        else {
            logger_1.logger.warn("Codex CLI の標準出力ストリームが利用できません", { runId });
        }
        if (child.stderr) {
            child.stderr.setEncoding("utf-8");
            child.stderr.on("data", (chunk) => {
                stderr += chunk;
                options.hooks?.onStderr?.(chunk);
            });
        }
        else {
            logger_1.logger.warn("Codex CLI の標準エラーストリームが利用できません", { runId });
        }
        const clearTimers = () => {
            if (killTimer) {
                clearTimeout(killTimer);
            }
            if (forceKillTimer) {
                clearTimeout(forceKillTimer);
            }
            if (signal) {
                signal.removeEventListener("abort", onAbort);
            }
        };
        if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
            killTimer = setTimeout(() => {
                timedOut = true;
                logger_1.logger.warn("Codex CLI がタイムアウトしたため停止します", {
                    runId,
                    timeoutMs,
                });
                if (!child.killed) {
                    child.kill("SIGTERM");
                }
                forceKillTimer = setTimeout(() => {
                    if (!child.killed) {
                        child.kill("SIGKILL");
                    }
                }, 5000);
            }, timeoutMs);
        }
        child.once("error", (error) => {
            clearTimers();
            reject(new Error(`Codex CLI の実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`));
        });
        child.once("close", async (code, signal) => {
            clearTimers();
            const durationMs = Date.now() - startAt;
            let gitStatusAfter = [];
            try {
                gitStatusAfter = await (0, gitStatus_1.getGitStatusEntries)(paths_1.REPO_ROOT);
            }
            catch (error) {
                logger_1.logger.warn("Codex 実行後の Git ステータス取得に失敗しました", {
                    runId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            let fileChanges = [];
            if (gitStatusAfter.length > 0) {
                fileChanges =
                    gitStatusBefore && gitStatusBefore.length > 0
                        ? (0, gitStatus_1.diffGitStatusEntries)(gitStatusBefore, gitStatusAfter)
                        : gitStatusAfter;
            }
            const result = {
                task,
                runId,
                command,
                exitCode: code,
                signal,
                stdout,
                stderr,
                durationMs,
                timedOut,
                historyPath: null,
                fileChanges,
            };
            if (aborted) {
                const reasonMessage = abortReason instanceof Error
                    ? abortReason.message
                    : abortReason === undefined
                        ? null
                        : String(abortReason);
                const queueId = abortReason instanceof errors_1.CodexCancellationError
                    ? abortReason.queueId
                    : null;
                const message = reasonMessage
                    ? `Codex CLI の実行はキャンセルされました: ${reasonMessage}`
                    : "Codex CLI の実行はキャンセルされました。";
                reject(new errors_1.CodexCancellationError(message, { runId, queueId }));
                return;
            }
            logger_1.logger.info("Codex CLI の実行が終了しました", {
                runId,
                code,
                signal,
                durationMs,
                timedOut,
            });
            if (recordHistory) {
                try {
                    const historyPath = await (0, history_1.recordCodexRunResult)(result);
                    result.historyPath = historyPath;
                    logger_1.logger.info("Codex 実行結果を履歴に保存しました", {
                        runId,
                        historyPath,
                    });
                }
                catch (error) {
                    logger_1.logger.warn("Codex 実行結果の保存に失敗しました", {
                        runId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            resolve(result);
        });
    });
};
exports.runCodexTask = runCodexTask;
//# sourceMappingURL=runner.js.map