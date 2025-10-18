"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyRunCancellation = exports.notifyRunFailure = exports.notifyRunResult = exports.resolveNotifyChannelId = exports.buildRunNotification = void 0;
const path_1 = __importDefault(require("path"));
const discord_js_1 = require("discord.js");
const task_1 = require("../discord/commands/task");
const logger_1 = require("../utils/logger");
const discordActions_1 = require("./discordActions");
const checks_1 = require("../health/checks");
const paths_1 = require("../tasks/paths");
const followUp_1 = require("./followUp");
const SUCCESS_COLOR = 0x2ecc71;
const FAILURE_COLOR = 0xe74c3c;
const WARNING_COLOR = 0xf1c40f;
const DEFAULT_STDOUT_LIMIT = 900;
const DEFAULT_STDERR_LIMIT = 900;
const MAX_MESSAGE_CONTENT_LENGTH = 1900;
const MAX_STDOUT_PUBLIC_CHUNKS = 5;
const DISCORD_ATTACHMENT_LIMIT_BYTES = 8 * 1024 * 1024; // 8 MiB
const buildStdoutAttachmentName = (runId) => `codex-${runId}-stdout.txt`;
const buildStderrAttachmentName = (runId) => `codex-${runId}-stderr.txt`;
const truncateToLength = (value, limit) => {
    if (value.length <= limit) {
        return { text: value, truncated: false };
    }
    return {
        text: value.slice(0, limit),
        truncated: true,
    };
};
const formatLogSnippet = (log, limit) => {
    if (!log.trim()) {
        return null;
    }
    const { text, truncated } = truncateToLength(log.trim(), limit);
    const codeBlock = ["```", text, "```"].join("\n");
    return truncated ? `${codeBlock}\n...` : codeBlock;
};
const resolvePriority = (priority) => {
    const label = task_1.PRIORITY_LABELS[priority];
    return label ?? priority;
};
const formatTimestamp = (value) => {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toISOString();
};
const describeRetryReason = (value) => {
    if (value === "timeout") {
        return "タイムアウト検知";
    }
    if (value.startsWith("exit_code_")) {
        const code = value.slice("exit_code_".length);
        return `終了コード ${code}`;
    }
    if (value.startsWith("signal_")) {
        const signal = value.slice("signal_".length);
        return `シグナル ${signal}`;
    }
    return value;
};
const formatRetryDetails = (retry) => {
    const maxRetries = Math.max(0, retry.maxAttempts - 1);
    const lines = [
        `試行回数: ${retry.attempts} / 最大 ${retry.maxAttempts}`,
        `自動リトライ: ${retry.performedRetries}回 / 上限 ${maxRetries}回`,
    ];
    if (retry.performedRetries > 0 && retry.reasons.length > 0) {
        const reasonLines = retry.reasons.map((reason, index) => `${index + 1}. ${describeRetryReason(reason)}`);
        lines.push("理由:");
        lines.push(...reasonLines);
    }
    return lines.join("\n").slice(0, 1024);
};
const determineStatus = (result) => {
    if (result.timedOut) {
        return {
            label: "⏱ タイムアウト",
            color: WARNING_COLOR,
        };
    }
    if (typeof result.exitCode === "number" && result.exitCode === 0) {
        return {
            label: "✅ 成功",
            color: SUCCESS_COLOR,
        };
    }
    if (typeof result.exitCode === "number") {
        return {
            label: `⚠️ 異常終了 (code=${result.exitCode})`,
            color: FAILURE_COLOR,
        };
    }
    return {
        label: `⚠️ 異常終了 (signal=${result.signal ?? "unknown"})`,
        color: FAILURE_COLOR,
    };
};
const describeCancellationStage = (queueItem) => {
    if (!queueItem) {
        return "キャンセル済み";
    }
    switch (queueItem.status) {
        case "cancelled":
            return queueItem.startedAt ? "実行中にキャンセル" : "開始前にキャンセル";
        case "pending":
            return "開始前にキャンセル";
        case "running":
            return "キャンセル要求中";
        case "failed":
            return "失敗扱いで終了";
        case "succeeded":
            return "完了済み";
        default:
            return queueItem.status;
    }
};
const chunkText = (value, size) => {
    if (size <= 0) {
        return [value];
    }
    const chunks = [];
    for (let index = 0; index < value.length; index += size) {
        chunks.push(value.slice(index, index + size));
    }
    return chunks;
};
const buildFollowUpComponents = (runId) => {
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId((0, followUp_1.buildFollowUpButtonId)(runId))
        .setLabel("フォローアップを依頼")
        .setStyle(discord_js_1.ButtonStyle.Primary));
    return [row.toJSON()];
};
const createTextAttachment = (name, content, context) => {
    if (!content || content.length === 0) {
        return null;
    }
    const data = Buffer.from(content, "utf-8");
    if (data.length === 0) {
        return null;
    }
    if (data.length > DISCORD_ATTACHMENT_LIMIT_BYTES) {
        logger_1.logger.warn("Codex ログの添付ファイルが Discord のサイズ制限を超えたためスキップします", {
            runId: context.runId,
            kind: context.kind,
            bytes: data.length,
        });
        return null;
    }
    return {
        name,
        data,
    };
};
const buildLogAttachments = (result) => {
    const attachments = [];
    const stdoutAttachment = createTextAttachment(buildStdoutAttachmentName(result.runId), result.stdout, { runId: result.runId, kind: "stdout" });
    if (stdoutAttachment) {
        attachments.push(stdoutAttachment);
    }
    const stderrAttachment = createTextAttachment(buildStderrAttachmentName(result.runId), result.stderr, { runId: result.runId, kind: "stderr" });
    if (stderrAttachment) {
        attachments.push(stderrAttachment);
    }
    return attachments;
};
const buildRunNotification = (result, options = {}) => {
    const stdoutLimit = typeof options.stdoutLimit === "number"
        ? options.stdoutLimit
        : (() => {
            const parsed = Number.parseInt(process.env.CODEX_DISCORD_NOTIFY_STDOUT_LIMIT ?? "", 10);
            return Number.isFinite(parsed) ? parsed : DEFAULT_STDOUT_LIMIT;
        })();
    const stderrLimit = typeof options.stderrLimit === "number"
        ? options.stderrLimit
        : (() => {
            const parsed = Number.parseInt(process.env.CODEX_DISCORD_NOTIFY_STDERR_LIMIT ?? "", 10);
            return Number.isFinite(parsed) ? parsed : DEFAULT_STDERR_LIMIT;
        })();
    const status = determineStatus(result);
    const priority = resolvePriority(result.task.metadata.priority);
    const historyPath = (() => {
        if (!result.historyPath) {
            return null;
        }
        try {
            const relative = path_1.default.relative(paths_1.REPO_ROOT, result.historyPath);
            if (relative && !relative.startsWith("..") && !path_1.default.isAbsolute(relative)) {
                return relative;
            }
        }
        catch {
            /* noop */
        }
        return result.historyPath;
    })();
    const embed = {
        title: `Codex 実行結果: ${status.label}`,
        color: status.color,
        fields: [
            {
                name: "タスク",
                value: result.task.metadata.title,
            },
            {
                name: "ファイル",
                value: `\`${result.task.filename}\``,
                inline: true,
            },
            {
                name: "優先度",
                value: priority,
                inline: true,
            },
            {
                name: "所要時間",
                value: `${result.durationMs} ms`,
                inline: true,
            },
        ],
        footer: {
            text: `Run ID: ${result.runId}`,
        },
        timestamp: new Date().toISOString(),
    };
    const exitInfo = typeof result.exitCode === "number"
        ? `${result.exitCode} (signal=${result.signal ?? "none"})`
        : `(null) (signal=${result.signal ?? "none"})`;
    embed.fields?.push({
        name: "終了コード",
        value: exitInfo,
        inline: true,
    });
    if (result.retry && result.retry.performedRetries > 0) {
        embed.fields?.push({
            name: "自動リトライ",
            value: formatRetryDetails(result.retry),
        });
    }
    if (historyPath) {
        embed.fields?.push({
            name: "履歴",
            value: `\`${historyPath}\``,
        });
    }
    if (result.fileChanges.length > 0) {
        const changeLines = result.fileChanges.slice(0, 5).map((change) => {
            const status = change.status.trim() || "?";
            if (change.originalPath && change.originalPath !== change.path) {
                return `\`${status}\` \`${change.originalPath}\` → \`${change.path}\``;
            }
            return `\`${status}\` \`${change.path}\``;
        });
        if (result.fileChanges.length > 5) {
            changeLines.push(`…他 ${result.fileChanges.length - 5} 件`);
        }
        embed.fields?.push({
            name: "変更ファイル",
            value: changeLines.join("\n").slice(0, 1024) || "(省略)",
        });
    }
    else {
        embed.fields?.push({
            name: "変更ファイル",
            value: "なし",
            inline: true,
        });
    }
    const stdoutSnippet = formatLogSnippet(result.stdout, stdoutLimit);
    if (stdoutSnippet) {
        embed.fields?.push({
            name: "STDOUT",
            value: stdoutSnippet.slice(0, 1024),
        });
    }
    const stderrSnippet = formatLogSnippet(result.stderr, stderrLimit);
    if (stderrSnippet) {
        embed.fields?.push({
            name: "STDERR",
            value: stderrSnippet.slice(0, 1024),
        });
    }
    const attachments = buildLogAttachments(result);
    const attachmentNames = attachments
        .map((file) => file.name)
        .filter((name) => typeof name === "string" && name.length > 0);
    if (attachmentNames.length > 0) {
        embed.fields?.push({
            name: "添付ログ",
            value: attachmentNames.map((name) => `\`${name}\``).join("\n"),
        });
    }
    const content = status.label.startsWith("✅")
        ? "Codex 実行が完了しました。"
        : "Codex 実行で問題が発生しました。";
    return {
        content,
        embeds: [embed],
        components: buildFollowUpComponents(result.runId),
        files: attachments,
        attachmentsSummary: attachmentNames,
    };
};
exports.buildRunNotification = buildRunNotification;
const formatStdoutMessage = (chunk, index, total) => {
    const header = total > 1
        ? `**Codex 応答 (${index + 1}/${total})**`
        : "**Codex 応答**";
    return [header, "```", chunk, "```"].join("\n");
};
const sendStdoutMessages = async (actions, channelId, result, attachmentNames) => {
    const stdout = result.stdout.trim();
    if (!stdout) {
        return;
    }
    const chunks = chunkText(stdout, MAX_MESSAGE_CONTENT_LENGTH);
    const totalChunks = chunks.length;
    const publicChunks = chunks.slice(0, MAX_STDOUT_PUBLIC_CHUNKS);
    for (const [index, chunk] of publicChunks.entries()) {
        const content = formatStdoutMessage(chunk, index, totalChunks);
        await actions.publishMessage(channelId, { content });
    }
    if (totalChunks > publicChunks.length) {
        const remaining = totalChunks - publicChunks.length;
        const lines = [
            `Codex 応答は全 ${totalChunks} チャンクあります。残り ${remaining} チャンクは添付ファイルからご確認ください。`,
        ];
        if (attachmentNames.length > 0) {
            lines.push("", "添付ファイル一覧:", ...attachmentNames.map((name) => `- \`${name}\``));
        }
        await actions.publishMessage(channelId, {
            content: lines.join("\n"),
        });
    }
};
const resolveNotifyChannelId = (options, envVarName = "CODEX_DISCORD_NOTIFY_CHANNEL") => {
    if (options.channelId !== undefined) {
        if (options.channelId === null) {
            return null;
        }
        const trimmed = options.channelId.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (envVarName) {
        const fromEnv = process.env[envVarName];
        if (fromEnv && fromEnv.length > 0) {
            return fromEnv;
        }
    }
    if (envVarName !== "CODEX_DISCORD_NOTIFY_CHANNEL") {
        const fallback = process.env.CODEX_DISCORD_NOTIFY_CHANNEL;
        if (fallback && fallback.length > 0) {
            return fallback;
        }
    }
    return null;
};
exports.resolveNotifyChannelId = resolveNotifyChannelId;
const notifyRunResult = async (result, options = {}) => {
    const channelId = (0, exports.resolveNotifyChannelId)(options);
    if (!channelId) {
        logger_1.logger.debug("Discord 通知チャンネルが設定されていないため通知をスキップします", {
            runId: result.runId,
        });
        return;
    }
    let actions = options.actions;
    if (!actions) {
        try {
            actions = (0, discordActions_1.createDiscordActionsFromEnv)();
            (0, checks_1.clearDiscordActionsInitIssue)();
        }
        catch (error) {
            logger_1.logger.warn("DiscordActions の初期化に失敗したため通知をスキップします", {
                runId: result.runId,
                error: error instanceof Error ? error.message : String(error),
            });
            (0, checks_1.recordDiscordActionsInitFailure)(error);
            return;
        }
    }
    try {
        const payload = (0, exports.buildRunNotification)(result, options);
        await actions.publishMessage(channelId, {
            content: payload.content,
            embeds: payload.embeds,
            components: payload.components,
            files: payload.files,
        });
        try {
            await sendStdoutMessages(actions, channelId, result, payload.attachmentsSummary);
        }
        catch (detailError) {
            logger_1.logger.warn("Codex 応答全文の送信に失敗しました", {
                runId: result.runId,
                channelId,
                error: detailError instanceof Error
                    ? detailError.message
                    : String(detailError),
            });
        }
    }
    catch (error) {
        logger_1.logger.error("Codex 実行結果の通知に失敗しました", {
            runId: result.runId,
            channelId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.notifyRunResult = notifyRunResult;
const buildFailureTimeline = (queueItem) => {
    if (!queueItem) {
        return null;
    }
    const lines = [];
    if (queueItem.requestedAt) {
        lines.push(`受付: ${formatTimestamp(queueItem.requestedAt)}`);
    }
    if (queueItem.startedAt) {
        lines.push(`開始: ${formatTimestamp(queueItem.startedAt)}`);
    }
    if (queueItem.finishedAt) {
        lines.push(`終了: ${formatTimestamp(queueItem.finishedAt)}`);
    }
    if (lines.length === 0) {
        return null;
    }
    return lines.join("\n").slice(0, 1024);
};
const notifyRunFailure = async (context, options = {}) => {
    const channelId = (0, exports.resolveNotifyChannelId)(options, "CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL");
    if (!channelId) {
        logger_1.logger.debug("Codex 失敗通知チャンネルが設定されていないため通知をスキップします", {
            queueId: context.queueId,
            filename: context.task.filename,
        });
        return;
    }
    let actions = options.actions;
    if (!actions) {
        try {
            actions = (0, discordActions_1.createDiscordActionsFromEnv)();
            (0, checks_1.clearDiscordActionsInitIssue)();
        }
        catch (error) {
            logger_1.logger.warn("DiscordActions の初期化に失敗したため失敗通知をスキップします", {
                queueId: context.queueId,
                filename: context.task.filename,
                error: error instanceof Error ? error.message : String(error),
            });
            (0, checks_1.recordDiscordActionsInitFailure)(error);
            return;
        }
    }
    const priority = resolvePriority(context.task.metadata.priority);
    const statusLabel = context.queueItem?.status ?? "failed";
    const embed = {
        title: "Codex 実行でエラーが発生しました",
        color: FAILURE_COLOR,
        fields: [
            {
                name: "タスク",
                value: context.task.metadata.title,
            },
            {
                name: "ファイル",
                value: `\`${context.task.filename}\``,
                inline: true,
            },
            {
                name: "優先度",
                value: priority,
                inline: true,
            },
            {
                name: "キュー ID",
                value: `\`${context.queueId}\``,
            },
            {
                name: "ステータス",
                value: statusLabel,
                inline: true,
            },
        ],
        timestamp: new Date().toISOString(),
    };
    if (context.queueItem?.cancelRequested) {
        embed.fields?.push({
            name: "キャンセル要求",
            value: "はい",
            inline: true,
        });
    }
    const failureRetry = context.queueItem?.result?.retry;
    if (failureRetry && failureRetry.performedRetries > 0) {
        embed.fields?.push({
            name: "自動リトライ",
            value: formatRetryDetails(failureRetry),
        });
    }
    const timeline = buildFailureTimeline(context.queueItem);
    if (timeline) {
        embed.fields?.push({
            name: "タイムライン",
            value: timeline,
        });
    }
    const errorMessage = context.error.message?.trim() ||
        context.queueItem?.error?.message ||
        "エラーメッセージが取得できませんでした。";
    const errorField = formatLogSnippet(errorMessage, 900) ??
        truncateToLength(errorMessage, 1024).text;
    embed.fields?.push({
        name: "エラー内容",
        value: errorField,
    });
    const stack = context.error.stack ?? context.queueItem?.error?.stack ?? null;
    if (stack) {
        const stackSnippet = formatLogSnippet(stack, 900) ?? truncateToLength(stack, 1024).text;
        embed.fields?.push({
            name: "スタックトレース",
            value: stackSnippet,
        });
    }
    if (context.failureRecordPath) {
        const relative = (() => {
            try {
                const rel = path_1.default.relative(paths_1.REPO_ROOT, context.failureRecordPath);
                if (rel && !rel.startsWith("..") && !path_1.default.isAbsolute(rel)) {
                    return rel;
                }
            }
            catch {
                /* noop */
            }
            return context.failureRecordPath;
        })();
        embed.fields?.push({
            name: "失敗ログ",
            value: `\`${relative}\``,
        });
    }
    const content = "Codex 実行が内部エラーで停止しました。ログを確認し、必要に応じて再実行や調査をお願いします。";
    try {
        await actions.publishMessage(channelId, {
            content,
            embeds: [embed],
        });
    }
    catch (error) {
        logger_1.logger.error("Codex 実行失敗の通知に失敗しました", {
            queueId: context.queueId,
            filename: context.task.filename,
            channelId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.notifyRunFailure = notifyRunFailure;
const notifyRunCancellation = async (context, options = {}) => {
    const channelId = (0, exports.resolveNotifyChannelId)(options);
    if (!channelId) {
        logger_1.logger.debug("Discord 通知チャンネルが設定されていないためキャンセル通知をスキップします", {
            queueId: context.queueId,
            task: context.task.filename,
        });
        return;
    }
    let actions = options.actions;
    if (!actions) {
        try {
            actions = (0, discordActions_1.createDiscordActionsFromEnv)();
            (0, checks_1.clearDiscordActionsInitIssue)();
        }
        catch (error) {
            logger_1.logger.warn("DiscordActions の初期化に失敗したためキャンセル通知をスキップします", {
                queueId: context.queueId,
                task: context.task.filename,
                error: error instanceof Error ? error.message : String(error),
            });
            (0, checks_1.recordDiscordActionsInitFailure)(error);
            return;
        }
    }
    const priority = resolvePriority(context.task.metadata.priority);
    const stageLabel = describeCancellationStage(context.queueItem);
    const embed = {
        title: "Codex 実行がキャンセルされました",
        color: WARNING_COLOR,
        fields: [
            {
                name: "タスク",
                value: context.task.metadata.title,
            },
            {
                name: "ファイル",
                value: `\`${context.task.filename}\``,
                inline: true,
            },
            {
                name: "優先度",
                value: priority,
                inline: true,
            },
            {
                name: "キュー ID",
                value: `\`${context.queueId}\``,
                inline: true,
            },
            {
                name: "キャンセル種別",
                value: stageLabel,
                inline: true,
            },
        ],
        timestamp: new Date().toISOString(),
    };
    if (context.runId) {
        embed.fields?.push({
            name: "Run ID",
            value: `\`${context.runId}\``,
            inline: true,
        });
    }
    const timelineLines = [];
    const requestedAt = context.queueItem?.requestedAt
        ? formatTimestamp(context.queueItem.requestedAt)
        : null;
    const startedAt = context.queueItem?.startedAt
        ? formatTimestamp(context.queueItem.startedAt)
        : null;
    const finishedAt = context.queueItem?.finishedAt
        ? formatTimestamp(context.queueItem.finishedAt)
        : null;
    if (requestedAt) {
        timelineLines.push(`受付: ${requestedAt}`);
    }
    if (startedAt) {
        timelineLines.push(`開始: ${startedAt}`);
    }
    if (finishedAt) {
        timelineLines.push(`終了: ${finishedAt}`);
    }
    if (timelineLines.length > 0) {
        embed.fields?.push({
            name: "タイムライン",
            value: timelineLines.join("\n").slice(0, 1024),
        });
    }
    const reason = (context.reason ?? "").trim();
    if (reason.length > 0) {
        embed.fields?.push({
            name: "キャンセル理由",
            value: reason.slice(0, 1024),
        });
    }
    const content = "Codex 実行がキャンセルされました。";
    try {
        await actions.publishMessage(channelId, {
            content,
            embeds: [embed],
        });
    }
    catch (error) {
        logger_1.logger.error("Codex 実行キャンセル通知の送信に失敗しました", {
            queueId: context.queueId,
            task: context.task.filename,
            channelId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.notifyRunCancellation = notifyRunCancellation;
//# sourceMappingURL=notifications.js.map