"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskCommand = exports.PRIORITY_LABELS = exports.MAX_FILENAME_LENGTH = void 0;
const discord_js_1 = require("discord.js");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const js_yaml_1 = require("js-yaml");
const logger_1 = require("../../utils/logger");
const inbox_1 = require("../../tasks/inbox");
const paths_1 = require("../../tasks/paths");
const accessControl_1 = require("../../codex/accessControl");
exports.MAX_FILENAME_LENGTH = 80;
const TASK_ERROR_GUIDANCE_LINES = [
    "",
    "⚙️ トラブルシュート:",
    "- `docs/codex/operations.md` の「Slash コマンドのエラーメッセージとトラブルシュート」を参照し、監査ログの記録を確認してください。",
    "- `npm run task-inbox validate` で Inbox の整合性を確認し、必要に応じてタスクを手動で再登録してください。",
];
const DEFAULT_ERROR_MESSAGE = [
    "申し訳ありません、タスクの保存中にエラーが発生しました。時間をおいて再度お試しください。",
    ...TASK_ERROR_GUIDANCE_LINES,
].join("\n");
const INITIAL_REPLY_MESSAGE = "Codex 作業依頼を受け付けました。ファイルへの保存処理を開始します…";
exports.PRIORITY_LABELS = {
    low: "低",
    normal: "通常",
    high: "高",
};
const normalizeMultiline = (value) => {
    if (!value) {
        return null;
    }
    const normalized = value.replace(/\r\n/g, "\n").trim();
    return normalized.length > 0 ? normalized : null;
};
const buildFilename = (title) => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const normalized = title
        .trim()
        .normalize("NFKC")
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}_-]/gu, "")
        .toLowerCase();
    const slug = normalized.length > 0 ? normalized.slice(0, exports.MAX_FILENAME_LENGTH) : "task";
    return `${timestamp}-${slug}.md`;
};
const buildMarkdown = (payload, interaction) => {
    const createdAt = new Date().toISOString();
    const metadata = {
        title: payload.title,
        priority: payload.priority,
        priority_label: exports.PRIORITY_LABELS[payload.priority],
        summary: payload.summary,
        created_at: createdAt,
        author: {
            id: interaction.user.id,
            tag: interaction.user.tag,
        },
        channel_id: interaction.channel?.id ?? null,
        interaction_id: interaction.id,
    };
    const frontMatter = (0, js_yaml_1.dump)(metadata, { lineWidth: 120 }).trimEnd();
    const summaryBlock = payload.summary ?? "(概要未入力)";
    const detailsBlock = payload.details ?? "(詳細未入力)";
    return [
        "---",
        frontMatter,
        "---",
        "",
        "## 概要",
        "",
        summaryBlock,
        "",
        "## 詳細",
        "",
        detailsBlock,
        "",
        "---",
        "",
        "_このタスクはDiscord Slash Commandから自動生成されました。_",
    ].join("\n");
};
const saveTask = async (payload, interaction) => {
    await (0, inbox_1.ensureInboxDirectory)();
    const filename = buildFilename(payload.title);
    const filePath = path_1.default.join(paths_1.INBOX_DIR, filename);
    const content = buildMarkdown(payload, interaction);
    await fs_1.promises.writeFile(filePath, content, "utf-8");
    return { filePath, filename };
};
const data = new discord_js_1.SlashCommandBuilder()
    .setName("task")
    .setDescription("Codex 作業依頼に関するコマンドです")
    .addSubcommand((sub) => sub
    .setName("create")
    .setDescription("新しい Codex 作業依頼を登録します")
    .addStringOption((option) => option
    .setName("title")
    .setDescription("タスクの件名")
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(150))
    .addStringOption((option) => option
    .setName("summary")
    .setDescription("100文字程度の概要を入力してください")
    .setRequired(false)
    .setMinLength(5)
    .setMaxLength(500))
    .addStringOption((option) => option
    .setName("details")
    .setDescription("詳細な依頼内容や背景を入力してください")
    .setRequired(false)
    .setMinLength(10)
    .setMaxLength(1900))
    .addStringOption((option) => option
    .setName("priority")
    .setDescription("このタスクの優先度")
    .setRequired(false)
    .addChoices({ name: "低 (バックログ)", value: "low" }, { name: "通常", value: "normal" }, { name: "高 (緊急)", value: "high" })))
    .setDMPermission(false);
const execute = async (interaction, context) => {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== "create") {
        await interaction.reply({
            content: "未対応のサブコマンドです。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const access = (0, accessControl_1.checkCodexCommandAccess)(interaction);
    if (!access.ok) {
        await interaction.reply({
            content: access.message,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        await context.auditLogger.log({
            action: "task.create",
            status: "failure",
            description: "Codex 作業依頼コマンドの権限不足により処理を中断しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                reason: access.reason,
            },
        });
        return;
    }
    const title = interaction.options.getString("title", true);
    const summary = normalizeMultiline(interaction.options.getString("summary"));
    const details = normalizeMultiline(interaction.options.getString("details"));
    const priority = interaction.options.getString("priority") ?? "normal";
    if (!summary && !details) {
        await interaction.reply({
            content: "概要または詳細のどちらか一方は必ず入力してください。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    let initialReplySent = false;
    try {
        await interaction.reply({
            content: INITIAL_REPLY_MESSAGE,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        initialReplySent = true;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof discord_js_1.DiscordAPIError ? error.code : undefined;
        const alreadyAcknowledged = error instanceof discord_js_1.DiscordAPIError &&
            (code === discord_js_1.RESTJSONErrorCodes.UnknownInteraction ||
                code === discord_js_1.RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged);
        const logFn = alreadyAcknowledged ? logger_1.logger.debug : logger_1.logger.warn;
        logFn("タスク作成コマンドの初期応答に失敗しました", {
            message,
            code,
            interactionId: interaction.id,
        });
        if (!alreadyAcknowledged) {
            await context.auditLogger.log({
                action: "task.create",
                status: "failure",
                description: "初期応答の送信に失敗しました",
                details: {
                    userId: interaction.user.id,
                    channelId: interaction.channel?.id ?? null,
                    error: message,
                    code,
                },
            });
        }
        if (!alreadyAcknowledged) {
            return;
        }
    }
    try {
        const result = await saveTask({
            title,
            summary,
            details,
            priority,
        }, interaction);
        if (initialReplySent) {
            await interaction.editReply({
                content: [
                    "タスクを保存しました！",
                    `ファイル名: \`${result.filename}\``,
                    `優先度: ${exports.PRIORITY_LABELS[priority]}`,
                ].join("\n"),
            });
        }
        await context.auditLogger.log({
            action: "task.create",
            status: "success",
            description: "Codex 作業依頼を保存しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                filePath: result.filePath,
                priority,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("タスクファイルの保存に失敗しました", {
            message,
            interactionId: interaction.id,
        });
        try {
            if (initialReplySent) {
                await interaction.editReply({ content: DEFAULT_ERROR_MESSAGE });
            }
        }
        catch (responseError) {
            const responseMessage = responseError instanceof Error ? responseError.message : String(responseError);
            logger_1.logger.warn("エラー通知の編集に失敗しました", {
                message: responseMessage,
                interactionId: interaction.id,
            });
        }
        await context.auditLogger.log({
            action: "task.create",
            status: "failure",
            description: "タスクファイルの保存に失敗しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                error: message,
            },
        });
    }
};
exports.taskCommand = {
    data,
    execute,
};
//# sourceMappingURL=task.js.map