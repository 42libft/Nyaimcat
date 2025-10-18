"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexFollowUpManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const discord_js_1 = require("discord.js");
const js_yaml_1 = require("js-yaml");
const logger_1 = require("../../utils/logger");
const workManager_1 = require("../../codex/workManager");
const runner_1 = require("../../codex/runner");
const inbox_1 = require("../../tasks/inbox");
const paths_1 = require("../../tasks/paths");
const followUp_1 = require("../../codex/followUp");
const task_1 = require("../commands/task");
const history_1 = require("../../codex/history");
const FOLLOW_UP_MODAL_TITLE = "Codex フォローアップ依頼";
const PROMPT_PREVIEW_LIMIT = 1200;
const wrapCodeBlock = (value) => {
    const content = value.trim().length > 0 ? value.trim() : "(内容なし)";
    return ["```markdown", content, "```"].join("\n");
};
const buildFilename = (title) => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const normalized = title
        .trim()
        .normalize("NFKC")
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}_-]/gu, "")
        .toLowerCase();
    const slug = normalized.length > 0 ? normalized.slice(0, task_1.MAX_FILENAME_LENGTH) : "task";
    return `${timestamp}-${slug}.md`;
};
const summarizeInstructions = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
};
const normalizeOptional = (value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const normalizePriorityLabel = (priority, label) => {
    if (label && label.trim().length > 0) {
        return label;
    }
    return task_1.PRIORITY_LABELS[priority] ?? priority;
};
const buildFallbackTask = (runId, recorded) => {
    const defaultPriority = (recorded?.run.task.priority ?? "normal");
    const metadata = {
        title: recorded?.run.task.title ?? `フォローアップ (${runId})`,
        priority: defaultPriority,
        priority_label: null,
        summary: recorded?.run.task.title ?? null,
        created_at: recorded?.run.executed_at ?? null,
        author: null,
        channel_id: null,
        interaction_id: null,
    };
    return {
        filename: recorded?.run.task.filename ?? `${runId}.md`,
        filePath: recorded?.filePath ?? "",
        metadata,
        body: "",
    };
};
const resolveTaskPriority = (task) => {
    const value = task.metadata.priority;
    return value === "low" || value === "normal" || value === "high"
        ? value
        : "normal";
};
class CodexFollowUpManager {
    constructor(auditLogger) {
        this.auditLogger = auditLogger;
    }
    async handleButton(interaction) {
        const payload = (0, followUp_1.parseFollowUpButtonId)(interaction.customId);
        if (!payload) {
            return false;
        }
        const { runId } = payload;
        const context = await this.resolveRunContext(runId);
        if (!context) {
            await interaction.reply({
                content: "フォローアップ対象の実行結果を取得できませんでした。しばらくしてから再度お試しください。",
                ephemeral: true,
            });
            return true;
        }
        const defaultTitle = `フォローアップ: ${context.task.metadata.title}`.slice(0, 150);
        const titleInput = new discord_js_1.TextInputBuilder()
            .setCustomId(followUp_1.FOLLOW_UP_MODAL_TITLE_INPUT_ID)
            .setLabel("件名 (任意)")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(150)
            .setValue(defaultTitle);
        const summaryInput = new discord_js_1.TextInputBuilder()
            .setCustomId(followUp_1.FOLLOW_UP_MODAL_SUMMARY_INPUT_ID)
            .setLabel("概要 (任意)")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("追加依頼の概要を 150 文字以内で入力してください。")
            .setMaxLength(150);
        const detailsInput = new discord_js_1.TextInputBuilder()
            .setCustomId(followUp_1.FOLLOW_UP_MODAL_DETAILS_INPUT_ID)
            .setLabel("追加で対応してほしい内容")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder("例: さきほどの出力を踏まえて、更に〇〇の対応をお願いします。")
            .setMaxLength(1900);
        const modal = new discord_js_1.ModalBuilder()
            .setCustomId((0, followUp_1.buildFollowUpModalId)(runId, interaction.user.id))
            .setTitle(FOLLOW_UP_MODAL_TITLE)
            .addComponents(new discord_js_1.ActionRowBuilder().addComponents(titleInput), new discord_js_1.ActionRowBuilder().addComponents(summaryInput), new discord_js_1.ActionRowBuilder().addComponents(detailsInput));
        await interaction.showModal(modal);
        await this.auditLogger.log({
            action: "codex.followup.open_modal",
            status: "success",
            details: {
                runId,
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
            },
        });
        return true;
    }
    async handleModalSubmit(interaction) {
        const payload = (0, followUp_1.parseFollowUpModalId)(interaction.customId);
        if (!payload) {
            return false;
        }
        const { runId, requesterId } = payload;
        if (interaction.user.id !== requesterId) {
            await interaction.reply({
                content: "このモーダルはリクエストしたユーザーのみが送信できます。",
                ephemeral: true,
            });
            return true;
        }
        const titleValue = interaction.fields.getTextInputValue(followUp_1.FOLLOW_UP_MODAL_TITLE_INPUT_ID) ?? "";
        const summaryValue = interaction.fields.getTextInputValue(followUp_1.FOLLOW_UP_MODAL_SUMMARY_INPUT_ID) ?? "";
        const detailsValue = interaction.fields.getTextInputValue(followUp_1.FOLLOW_UP_MODAL_DETAILS_INPUT_ID) ?? "";
        const instructions = detailsValue.trim();
        if (!instructions) {
            await interaction.reply({
                content: "追加依頼内容が入力されていません。内容を入力して再度送信してください。",
                ephemeral: true,
            });
            return true;
        }
        await interaction.deferReply();
        try {
            const context = await this.resolveRunContext(runId);
            if (!context) {
                await interaction.editReply({
                    content: "フォローアップ対象の実行結果を取得できませんでした。再度お試しください。",
                });
                return true;
            }
            const now = new Date().toISOString();
            const title = normalizeOptional(titleValue) ??
                `フォローアップ: ${context.task.metadata.title}`;
            const summary = normalizeOptional(summaryValue) ??
                summarizeInstructions(instructions) ??
                `フォローアップ依頼 (${interaction.user.tag})`;
            const file = await this.createFollowUpTaskFile({
                runId,
                interaction,
                context,
                title,
                summary,
                instructions,
                createdAt: now,
            });
            const startResult = await workManager_1.codexWorkManager.startWork({
                filename: file.filename,
                notifyChannelId: interaction.channelId,
            });
            const prompt = (0, runner_1.buildPromptForTask)(startResult.task).trim();
            const preview = prompt.length > PROMPT_PREVIEW_LIMIT
                ? `${prompt.slice(0, PROMPT_PREVIEW_LIMIT)}\n…(以降は省略されました)`
                : prompt || "(生成されたプロンプトは空でした)";
            const lines = [
                "Codex フォローアップをキューに登録しました。",
                `元 Run ID: \`${runId}\``,
                `新タスク: \`${file.filename}\``,
                `キュー ID: \`${startResult.queueId}\``,
                `通知: <#${interaction.channelId}>`,
                "",
                "送信するプロンプト:",
                "```markdown",
                preview,
                "```",
            ];
            await interaction.editReply({ content: lines.join("\n") });
            await this.auditLogger.log({
                action: "codex.followup.enqueue",
                status: "success",
                details: {
                    runId,
                    queueId: startResult.queueId,
                    newTask: file.filename,
                    userId: interaction.user.id,
                    channelId: interaction.channelId,
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Codex フォローアップ処理でエラーが発生しました", {
                runId,
                userId: interaction.user.id,
                error: message,
            });
            await interaction.editReply({
                content: [
                    "フォローアップの登録中にエラーが発生しました。",
                    `理由: ${message}`,
                ].join("\n"),
            });
            await this.auditLogger.log({
                action: "codex.followup.enqueue",
                status: "failure",
                description: message,
                details: {
                    runId,
                    userId: interaction.user.id,
                    channelId: interaction.channelId,
                },
            });
        }
        return true;
    }
    async resolveRunContext(runId) {
        const stored = workManager_1.codexWorkManager.getRecentRunResult(runId);
        if (stored) {
            return {
                queueId: stored.queueId,
                task: stored.result.task,
                stdout: stored.result.stdout,
                stdoutTruncated: false,
                historyPath: stored.result.historyPath ?? null,
            };
        }
        const queueItem = workManager_1.codexWorkManager.getQueueItemByRunId(runId);
        const historyPath = queueItem?.result?.historyPath ?? null;
        let recorded = null;
        if (historyPath) {
            recorded = await (0, history_1.loadRecordedRunFromPath)(historyPath);
        }
        if (!recorded) {
            recorded = await (0, history_1.findRecordedRunById)(runId);
        }
        const stdout = recorded?.run.stdout.content ?? "";
        const stdoutTruncated = recorded?.run.stdout.truncated ?? false;
        if (!queueItem && !recorded) {
            return null;
        }
        let task = null;
        const filename = queueItem?.filename ?? recorded?.run.task.filename ?? `${runId}.md`;
        try {
            task = await (0, inbox_1.readTaskFile)(filename);
        }
        catch {
            /* noop */
        }
        if (!task && recorded) {
            task = buildFallbackTask(runId, recorded);
        }
        if (!task) {
            return null;
        }
        return {
            queueId: queueItem?.id ?? null,
            task,
            stdout,
            stdoutTruncated,
            historyPath,
            recorded,
        };
    }
    async createFollowUpTaskFile(args) {
        const { runId, interaction, context, title, summary, instructions, createdAt, } = args;
        await (0, inbox_1.ensureInboxDirectory)();
        const priority = resolveTaskPriority(context.task);
        const priorityLabel = normalizePriorityLabel(priority, context.task.metadata.priority_label);
        const frontMatter = {
            title,
            priority,
            priority_label: priorityLabel,
            summary,
            created_at: createdAt,
            author: {
                id: interaction.user.id,
                tag: interaction.user.tag,
            },
            channel_id: interaction.channelId,
            interaction_id: interaction.id,
            parent: {
                run_id: runId,
                queue_id: context.queueId,
                task_filename: context.task.filename,
                history_path: context.historyPath ?? null,
            },
        };
        const lines = [
            "---",
            (0, js_yaml_1.dump)(frontMatter, { lineWidth: 120 }).trimEnd(),
            "---",
            "",
            "## 概要",
            "",
            summary,
            "",
            "## 詳細",
            "",
            "### 元タスク情報",
            "",
            `- タイトル: ${context.task.metadata.title}`,
            `- ファイル名: \`${context.task.filename}\``,
            `- 優先度: ${priorityLabel}`,
            context.task.metadata.summary
                ? `- 概要: ${context.task.metadata.summary}`
                : null,
            context.historyPath ? `- 履歴ファイル: \`${context.historyPath}\`` : null,
            "",
            "### 前回の Codex 応答",
            wrapCodeBlock(context.stdoutTruncated
                ? `${context.stdout}\n\n...(一部省略されています)`
                : context.stdout),
            "",
            "### 追加依頼内容",
            "",
            instructions,
            "",
            context.task.body
                ? [
                    "### 参考: 元タスク本文",
                    "",
                    context.task.body,
                    "",
                ].join("\n")
                : null,
            "---",
            "",
            `_このタスクは Codex フォローアップ機能から自動生成されました (Run ID: ${runId})。_`,
        ].filter((line) => line !== null);
        const content = lines.join("\n");
        const filename = buildFilename(title);
        const filePath = path_1.default.join(paths_1.INBOX_DIR, filename);
        await fs_1.promises.writeFile(filePath, content, "utf-8");
        return { filename, filePath };
    }
}
exports.CodexFollowUpManager = CodexFollowUpManager;
//# sourceMappingURL=followUpManager.js.map