"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackCommand = void 0;
const discord_js_1 = require("discord.js");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const logger_1 = require("../../utils/logger");
const FEEDBACK_ROOT = path_1.default.resolve(__dirname, "../../..", "feedback");
const BUG_DIR = path_1.default.join(FEEDBACK_ROOT, "bugs");
const IDEA_DIR = path_1.default.join(FEEDBACK_ROOT, "ideas");
const data = new discord_js_1.SlashCommandBuilder()
    .setName("feedback")
    .setDescription("不具合報告やアイデアを送信します")
    .addSubcommand((sub) => sub
    .setName("bug")
    .setDescription("不具合報告を送信します")
    .addStringOption((option) => option.setName("title").setDescription("件名").setRequired(true))
    .addStringOption((option) => option
    .setName("detail")
    .setDescription("詳細な説明")
    .setRequired(true))
    .addStringOption((option) => option
    .setName("steps")
    .setDescription("再現手順や補足情報があれば記入してください")
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("idea")
    .setDescription("改善アイデアを送信します")
    .addStringOption((option) => option.setName("title").setDescription("件名").setRequired(true))
    .addStringOption((option) => option
    .setName("detail")
    .setDescription("アイデアの内容を記入してください")
    .setRequired(true))
    .addStringOption((option) => option
    .setName("impact")
    .setDescription("期待する効果や背景があれば記入してください")
    .setRequired(false)))
    .setDMPermission(false);
const getTargetDirectory = (subcommand) => subcommand === "bug" ? BUG_DIR : IDEA_DIR;
const buildFilename = (title) => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const normalized = title
        .trim()
        .normalize("NFKC")
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}_-]/gu, "")
        .toLowerCase();
    const slug = normalized.length > 0 ? normalized.slice(0, 80) : "entry";
    return `${timestamp}-${slug}.md`;
};
const buildMarkdown = (payload, interaction) => {
    const createdAt = new Date().toISOString();
    const typeLabel = payload.type === "bug" ? "不具合報告" : "アイデア";
    const lines = [
        `# ${payload.title}`,
        "",
        "## メタ情報",
        "",
        `- 種類: ${typeLabel}`,
        `- 投稿日: ${createdAt}`,
        `- 送信者: ${interaction.user.tag} (${interaction.user.id})`,
    ];
    if (interaction.channel) {
        lines.push(`- チャンネル: ${interaction.channel.id}`);
    }
    lines.push("", "## 詳細", "", payload.detail);
    if (payload.extra && payload.extra.length > 0) {
        lines.push("", "## 補足", "", payload.extra);
    }
    lines.push("", "---", "", "_このエントリはDiscord Slash Commandから自動生成されました。_");
    return lines.join("\n");
};
const ensureDirectory = async (dir) => {
    await fs_1.promises.mkdir(dir, { recursive: true });
};
const saveFeedback = async (payload, interaction) => {
    const directory = getTargetDirectory(payload.type);
    await ensureDirectory(directory);
    const filename = buildFilename(payload.title);
    const filePath = path_1.default.join(directory, filename);
    const content = buildMarkdown(payload, interaction);
    await fs_1.promises.writeFile(filePath, content, "utf-8");
    return { filePath, filename };
};
const execute = async (interaction, context) => {
    const subcommand = interaction.options.getSubcommand();
    const title = interaction.options.getString("title", true);
    const detail = interaction.options.getString("detail", true);
    const extraOptionName = subcommand === "bug" ? "steps" : "impact";
    const extra = interaction.options.getString(extraOptionName, false);
    const errorResponse = "申し訳ありません、保存中にエラーが発生しました。時間をおいて再度お試しください。";
    const processingMessage = "フィードバックを受け付けました。保存処理を開始します…";
    let initialReplySent = false;
    try {
        await interaction.reply({
            content: processingMessage,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        initialReplySent = true;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof discord_js_1.DiscordAPIError ? error.code : undefined;
        const conflict = error instanceof discord_js_1.DiscordAPIError &&
            (code === discord_js_1.RESTJSONErrorCodes.UnknownInteraction ||
                code === discord_js_1.RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged);
        const logFn = conflict ? logger_1.logger.debug : logger_1.logger.warn;
        logFn("フィードバック応答の初期化に失敗しました", {
            message,
            code,
            subcommand,
            interactionId: interaction.id,
        });
        if (!conflict) {
            await context.auditLogger.log({
                action: `feedback.${subcommand}`,
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
        return;
    }
    try {
        const result = await saveFeedback({
            type: subcommand,
            title,
            detail,
            extra,
        }, interaction);
        if (initialReplySent) {
            await interaction.editReply({
                content: [
                    "フィードバックありがとうございます！",
                    `ファイル名: \`${result.filename}\``,
                ].join("\n"),
            });
        }
        await context.auditLogger.log({
            action: `feedback.${subcommand}`,
            status: "success",
            description: `${subcommand} を保存しました`,
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                filePath: result.filePath,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("フィードバックの保存に失敗しました", {
            message,
            subcommand,
        });
        try {
            if (initialReplySent) {
                await interaction.editReply({ content: errorResponse });
            }
        }
        catch (responseError) {
            const responseMessage = responseError instanceof Error ? responseError.message : String(responseError);
            logger_1.logger.warn("エラー通知の送信に失敗しました", {
                name: "feedback",
                message: responseMessage,
            });
        }
        await context.auditLogger.log({
            action: `feedback.${subcommand}`,
            status: "failure",
            description: "フィードバックの保存に失敗しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                error: message,
            },
        });
    }
};
exports.feedbackCommand = {
    data,
    execute,
};
//# sourceMappingURL=feedback.js.map