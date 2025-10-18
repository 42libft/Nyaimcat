"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workCommand = exports.handleWorkStartSelect = void 0;
const discord_js_1 = require("discord.js");
const crypto_1 = require("crypto");
const workManager_1 = require("../../codex/workManager");
const logger_1 = require("../../utils/logger");
const settings_1 = require("../../codex/settings");
const accessControl_1 = require("../../codex/accessControl");
const runner_1 = require("../../codex/runner");
const inbox_1 = require("../../tasks/inbox");
const PROMPT_PREVIEW_LIMIT = 1200;
const WORK_SELECT_MENU_PREFIX = "codex:work:start:select:";
const SELECTION_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SELECT_OPTIONS = 25;
const WORK_START_ERROR_HEADER = "申し訳ありません、Codex 実行キューへの登録に失敗しました。";
const WORK_ERROR_GUIDANCE_LINES = [
    "",
    "⚙️ トラブルシュート:",
    "- `docs/codex/operations.md` の「Slash コマンドのエラーメッセージとトラブルシュート」を確認してください。",
    "- 監査ログと `tasks/runs/failures/` の記録を参照し、必要に応じて `/work status` で現在のキュー状況を確認してから再実行してください。",
];
const buildWorkStartErrorMessage = (reason) => [WORK_START_ERROR_HEADER, `理由: ${reason}`, ...WORK_ERROR_GUIDANCE_LINES].join("\n");
const workSelectionSessions = new Map();
const pruneSelectionSessions = () => {
    const now = Date.now();
    for (const [id, session] of workSelectionSessions) {
        if (now - session.createdAt > SELECTION_SESSION_TTL_MS) {
            workSelectionSessions.delete(id);
        }
    }
};
const STATUS_LABELS = {
    pending: "保留中",
    running: "実行中",
    succeeded: "完了",
    failed: "失敗",
    cancelled: "キャンセル済み",
};
const formatTimestamp = (value) => {
    if (!value) {
        return "-";
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
        return `終了コード ${value.slice("exit_code_".length)}`;
    }
    if (value.startsWith("signal_")) {
        return `シグナル ${value.slice("signal_".length)}`;
    }
    return value;
};
const formatRetrySummary = (item) => {
    const retry = item.retry;
    if (!retry) {
        return null;
    }
    const lines = [];
    if (retry.attempts > 0 || retry.maxAttempts > 0) {
        lines.push(`試行回数: ${retry.attempts} / 最大 ${retry.maxAttempts}`);
    }
    if (retry.performedRetries > 0) {
        const maxRetries = Math.max(0, retry.maxAttempts - 1);
        const reasons = retry.reasons.map(describeRetryReason).join(", ");
        const reasonLabel = reasons.length > 0 ? ` (理由: ${reasons})` : "";
        lines.push(`自動リトライ: ${retry.performedRetries}回 / 上限 ${maxRetries}回${reasonLabel}`);
    }
    if (lines.length === 0) {
        return null;
    }
    return lines.join("\n");
};
const summarizeQueueItem = (item) => {
    const status = STATUS_LABELS[item.status] ?? item.status;
    const lines = [
        `状態: ${status}`,
        `キューID: \`${item.id}\``,
        `ファイル: \`${item.filename}\``,
        `受付: ${formatTimestamp(item.requestedAt)}`,
    ];
    if (item.startedAt) {
        lines.push(`開始: ${formatTimestamp(item.startedAt)}`);
    }
    if (item.finishedAt) {
        lines.push(`終了: ${formatTimestamp(item.finishedAt)}`);
    }
    if (item.result) {
        const exitCode = item.result.exitCode !== null ? String(item.result.exitCode) : "(null)";
        lines.push(`Run ID: \`${item.result.runId}\``);
        lines.push(`終了コード: ${exitCode}`);
        lines.push(`タイムアウト: ${item.result.timedOut ? "はい" : "いいえ"}`);
        lines.push(`変更ファイル: ${item.result.fileChanges.length}件`);
    }
    const retrySummary = formatRetrySummary(item);
    if (retrySummary) {
        lines.push(retrySummary);
    }
    if (item.error) {
        lines.push(`エラー: ${item.error.message}`);
    }
    if (item.cancelRequested) {
        lines.push("キャンセル要求: 済み");
    }
    return lines.join("\n");
};
const summarizeQueueSnapshot = (snapshot) => {
    const lines = [];
    if (snapshot.active) {
        lines.push("**実行中**");
        lines.push(summarizeQueueItem(snapshot.active));
    }
    else {
        lines.push("**実行中**\nなし");
    }
    if (snapshot.pending.length > 0) {
        lines.push("");
        lines.push(`**待機中 (${snapshot.pending.length}件)**`);
        snapshot.pending.slice(0, 5).forEach((item, index) => {
            const status = STATUS_LABELS[item.status] ?? item.status;
            lines.push(`${index + 1}. [${status}] \`${item.filename}\` (ID: \`${item.id}\`)`);
        });
        if (snapshot.pending.length > 5) {
            lines.push(`…他 ${snapshot.pending.length - 5} 件`);
        }
    }
    else {
        lines.push("");
        lines.push("**待機中**\nなし");
    }
    if (snapshot.history.length > 0) {
        lines.push("");
        lines.push("**直近履歴**");
        snapshot.history.slice(0, 5).forEach((item) => {
            const status = STATUS_LABELS[item.status] ?? item.status;
            const finished = item.finishedAt ? formatTimestamp(item.finishedAt) : "-";
            lines.push(`[${status}] \`${item.filename}\` (終了: ${finished}) / ID: \`${item.id}\``);
        });
    }
    else {
        lines.push("");
        lines.push("**直近履歴**\nなし");
    }
    return lines.join("\n");
};
const buildCommand = () => new discord_js_1.SlashCommandBuilder()
    .setName("work")
    .setDescription("Codex 実行キューを操作します")
    .addSubcommand((sub) => sub
    .setName("start")
    .setDescription("指定したタスクファイルを Codex 実行キューに登録します")
    .addStringOption((option) => option
    .setName("filename")
    .setDescription("tasks/inbox/ 内のタスクファイル名 (.md)")
    .setRequired(false)
    .setMinLength(5)
    .setMaxLength(200))
    .addBooleanOption((option) => option
    .setName("latest")
    .setDescription("最新のタスクを自動選択して実行します")
    .setRequired(false))
    .addChannelOption((option) => option
    .setName("notify_channel")
    .setDescription("Codex 実行結果を通知するチャンネル (未指定時は既定設定)")
    .addChannelTypes(discord_js_1.ChannelType.GuildText, discord_js_1.ChannelType.GuildAnnouncement)
    .setRequired(false))
    .addBooleanOption((option) => option
    .setName("skip_notify")
    .setDescription("通知を完全に無効化する場合に有効にします")
    .setRequired(false))
    .addBooleanOption((option) => option
    .setName("update_docs")
    .setDescription("docs/plans.md などの自動追記を有効／無効に上書きします")
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName("cancel")
    .setDescription("Codex 実行キューのタスクをキャンセルします")
    .addStringOption((option) => option
    .setName("queue_id")
    .setDescription("キャンセルするキュー ID")
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(100)))
    .addSubcommand((sub) => sub
    .setName("status")
    .setDescription("Codex 実行キューの状態を確認します")
    .addStringOption((option) => option
    .setName("queue_id")
    .setDescription("個別のキュー ID を指定した場合、その詳細を表示します")
    .setRequired(false)
    .setMinLength(5)
    .setMaxLength(100)))
    .setDMPermission(false);
const handleStart = async (interaction, context) => {
    await interaction.deferReply();
    const filenameInput = interaction.options.getString("filename");
    const latest = interaction.options.getBoolean("latest") ?? false;
    const notifyChannel = interaction.options.getChannel("notify_channel");
    const skipNotify = interaction.options.getBoolean("skip_notify") ?? false;
    const updateDocsOption = interaction.options.getBoolean("update_docs");
    const selectedNotifyChannelId = notifyChannel?.id ?? undefined;
    const commandChannel = interaction.channel;
    const commandChannelId = commandChannel &&
        "isTextBased" in commandChannel &&
        typeof commandChannel.isTextBased === "function" &&
        commandChannel.isTextBased()
        ? commandChannel.id
        : undefined;
    const effectiveUpdateDocs = typeof updateDocsOption === "boolean"
        ? updateDocsOption
        : (0, settings_1.isDocsUpdateEnabledByDefault)();
    let resolvedFilename = filenameInput && filenameInput.trim().length > 0
        ? filenameInput.trim()
        : null;
    try {
        const buildExecutionArgs = (filename) => {
            const args = {
                interaction,
                context,
                filename,
                skipNotify,
                effectiveUpdateDocs,
            };
            if (typeof updateDocsOption === "boolean") {
                args.updateDocsOption = updateDocsOption;
            }
            if (selectedNotifyChannelId) {
                args.selectedNotifyChannelId = selectedNotifyChannelId;
            }
            else if (commandChannelId) {
                args.commandChannelId = commandChannelId;
            }
            return args;
        };
        if (filenameInput && filenameInput.trim().length > 0) {
            const targetFilename = filenameInput.trim();
            resolvedFilename = targetFilename;
            const content = await runWorkStartExecution(buildExecutionArgs(targetFilename));
            await interaction.editReply({ content, components: [] });
            return;
        }
        if (latest) {
            const tasks = await (0, inbox_1.listTaskFiles)();
            if (tasks.length === 0) {
                await interaction.editReply({
                    content: [
                        "Inbox にタスクが見つかりませんでした。",
                        "`/task create` でタスクを作成してから再度お試しください。",
                    ].join("\n"),
                });
                return;
            }
            const latestTask = tasks[0];
            if (!latestTask) {
                await interaction.editReply({
                    content: "タスクの取得に失敗しました。もう一度お試しください。",
                });
                return;
            }
            const targetFilename = latestTask.filename;
            resolvedFilename = targetFilename;
            const content = await runWorkStartExecution(buildExecutionArgs(targetFilename));
            await interaction.editReply({ content, components: [] });
            return;
        }
        const selectionOptions = {
            skipNotify,
            effectiveUpdateDocs,
        };
        if (typeof updateDocsOption === "boolean") {
            selectionOptions.updateDocsOption = updateDocsOption;
        }
        if (selectedNotifyChannelId) {
            selectionOptions.selectedNotifyChannelId = selectedNotifyChannelId;
        }
        else if (commandChannelId) {
            selectionOptions.commandChannelId = commandChannelId;
        }
        await presentWorkSelection(interaction, selectionOptions);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Codex 実行キューへの登録に失敗しました", {
            filename: filenameInput ?? "(未指定)",
            error: message,
        });
        await interaction.editReply({
            content: buildWorkStartErrorMessage(message),
            components: [],
        });
        await context.auditLogger.log({
            action: "codex.work.start",
            status: "failure",
            description: "Codex 実行キューへの登録に失敗しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                filename: resolvedFilename ?? filenameInput ?? "(未指定)",
                error: message,
            },
        });
    }
};
const runWorkStartExecution = async (args) => {
    const { interaction, context, filename, skipNotify, selectedNotifyChannelId, commandChannelId, updateDocsOption, effectiveUpdateDocs, } = args;
    const startOptions = {
        filename,
    };
    if (skipNotify) {
        startOptions.notifyChannelId = null;
    }
    else if (selectedNotifyChannelId) {
        startOptions.notifyChannelId = selectedNotifyChannelId;
    }
    else if (commandChannelId) {
        startOptions.notifyChannelId = commandChannelId;
    }
    if (typeof updateDocsOption === "boolean") {
        startOptions.updateDocs = updateDocsOption;
    }
    const result = await workManager_1.codexWorkManager.startWork(startOptions);
    const snapshot = workManager_1.codexWorkManager.getQueueSnapshot();
    const queueItem = result.queueItem ?? workManager_1.codexWorkManager.getQueueItem(result.queueId);
    let positionMessage = "現在のステータスを取得できませんでした。";
    if (queueItem) {
        const statusLabel = STATUS_LABELS[queueItem.status] ?? queueItem.status;
        if (queueItem.status === "pending") {
            const index = snapshot.pending.findIndex((item) => item.id === queueItem.id);
            if (index >= 0) {
                positionMessage = `キュー位置: 待機列の ${index + 1} 番目 (${statusLabel})`;
            }
            else {
                positionMessage = `キュー状態: ${statusLabel}`;
            }
        }
        else if (queueItem.status === "running") {
            positionMessage = "キュー状態: 実行中";
        }
        else {
            positionMessage = `キュー状態: ${statusLabel}`;
        }
    }
    const notifySummary = skipNotify
        ? "通知: サイレント"
        : selectedNotifyChannelId
            ? `通知: <#${selectedNotifyChannelId}>`
            : commandChannelId
                ? `通知: <#${commandChannelId}> (自動)`
                : "通知: 既定設定";
    const docSummary = effectiveUpdateDocs
        ? "ドキュメント更新: 有効"
        : "ドキュメント更新: 無効";
    const lines = [
        "Codex 実行をキューに登録しました。",
        `キュー ID: \`${result.queueId}\``,
        `ファイル: \`${result.task.filename}\``,
        `タイトル: ${result.task.metadata.title}`,
        positionMessage,
        notifySummary,
        docSummary,
        "",
        "`/work status` で進捗を確認できます。",
    ];
    const prompt = (0, runner_1.buildPromptForTask)(result.task).trim();
    const preview = prompt.length > PROMPT_PREVIEW_LIMIT
        ? `${prompt.slice(0, PROMPT_PREVIEW_LIMIT)}\n…(以降は省略されました)`
        : prompt || "(生成されたプロンプトは空でした)";
    const content = [
        ...lines,
        "",
        "送信するプロンプト:",
        "```markdown",
        preview,
        "```",
    ].join("\n");
    await context.auditLogger.log({
        action: "codex.work.start",
        status: "success",
        description: "Codex 実行をキューに登録しました",
        details: {
            userId: interaction.user.id,
            channelId: interaction.channel?.id ?? null,
            filename,
            queueId: result.queueId,
            notifyChannelId: skipNotify
                ? null
                : selectedNotifyChannelId ?? commandChannelId ?? "(default)",
            updateDocs: effectiveUpdateDocs,
        },
    });
    return content;
};
const presentWorkSelection = async (interaction, options) => {
    pruneSelectionSessions();
    const tasks = await (0, inbox_1.listTaskFiles)();
    if (tasks.length === 0) {
        await interaction.editReply({
            content: [
                "Inbox にタスクが見つかりませんでした。",
                "`/task create` でタスクを作成してから再度お試しください。",
            ].join("\n"),
            components: [],
        });
        return;
    }
    const limitedTasks = tasks.slice(0, MAX_SELECT_OPTIONS);
    const notifySummary = options.skipNotify
        ? "通知: サイレント"
        : options.selectedNotifyChannelId
            ? `通知: <#${options.selectedNotifyChannelId}>`
            : options.commandChannelId
                ? `通知: <#${options.commandChannelId}> (自動)`
                : "通知: 既定設定";
    const docSummary = options.effectiveUpdateDocs
        ? "ドキュメント更新: 有効"
        : "ドキュメント更新: 無効";
    const sessionId = (0, crypto_1.randomUUID)();
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId(`${WORK_SELECT_MENU_PREFIX}${sessionId}`)
        .setPlaceholder("実行するタスクを選択してください")
        .setMinValues(1)
        .setMaxValues(1);
    const allowedFilenames = [];
    for (const task of limitedTasks) {
        const rawTitle = task.metadata.title ?? task.filename;
        const label = rawTitle.slice(0, 100) || task.filename.slice(0, 100);
        const option = new discord_js_1.StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setValue(task.filename);
        const summary = task.metadata.summary?.replace(/\s+/g, " ") ?? "(概要未入力)";
        option.setDescription(summary.slice(0, 100));
        menu.addOptions(option);
        allowedFilenames.push(task.filename);
    }
    const session = {
        userId: interaction.user.id,
        skipNotify: options.skipNotify,
        effectiveUpdateDocs: options.effectiveUpdateDocs,
        allowedFilenames,
        createdAt: Date.now(),
    };
    if (typeof options.updateDocsOption === "boolean") {
        session.updateDocsOption = options.updateDocsOption;
    }
    if (options.selectedNotifyChannelId) {
        session.selectedNotifyChannelId = options.selectedNotifyChannelId;
    }
    if (options.commandChannelId) {
        session.commandChannelId = options.commandChannelId;
    }
    workSelectionSessions.set(sessionId, session);
    const lines = [
        "実行するタスクを選択してください。",
        notifySummary,
        docSummary,
    ];
    if (tasks.length > limitedTasks.length) {
        lines.push(`先頭 ${limitedTasks.length} 件のみ表示しています。`);
    }
    lines.push("", "選択すると Codex 実行が開始され、プロンプト内容がこのメッセージに表示されます。", "最新のタスクを自動で選ぶ場合は `latest:true` を指定してください。");
    await interaction.editReply({
        content: lines.join("\n"),
        components: [
            new discord_js_1.ActionRowBuilder().addComponents(menu),
        ],
    });
};
const handleWorkStartSelect = async (interaction, context) => {
    if (!interaction.customId.startsWith(WORK_SELECT_MENU_PREFIX)) {
        return false;
    }
    const sessionId = interaction.customId.substring(WORK_SELECT_MENU_PREFIX.length);
    const session = workSelectionSessions.get(sessionId);
    if (!session) {
        await interaction.reply({
            content: "この選択は有効期限が切れています。もう一度 `/work start` を実行してください。",
            ephemeral: true,
        });
        return true;
    }
    if (interaction.user.id !== session.userId) {
        await interaction.reply({
            content: "この選択メニューはコマンドを実行したユーザーのみが利用できます。",
            ephemeral: true,
        });
        return true;
    }
    const filename = interaction.values[0];
    if (!filename || !session.allowedFilenames.includes(filename)) {
        await interaction.reply({
            content: "選択内容が無効です。再度 `/work start` を実行してください。",
            ephemeral: true,
        });
        return true;
    }
    workSelectionSessions.delete(sessionId);
    await interaction.deferUpdate();
    try {
        const execArgs = {
            interaction,
            context,
            filename,
            skipNotify: session.skipNotify,
            effectiveUpdateDocs: session.effectiveUpdateDocs,
        };
        if (typeof session.updateDocsOption === "boolean") {
            execArgs.updateDocsOption = session.updateDocsOption;
        }
        if (session.selectedNotifyChannelId) {
            execArgs.selectedNotifyChannelId = session.selectedNotifyChannelId;
        }
        else if (session.commandChannelId) {
            execArgs.commandChannelId = session.commandChannelId;
        }
        const content = await runWorkStartExecution(execArgs);
        await interaction.editReply({ content, components: [] });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Codex 実行キューへの登録に失敗しました", {
            filename,
            error: message,
        });
        await interaction.editReply({
            content: buildWorkStartErrorMessage(message),
            components: [],
        });
        await context.auditLogger.log({
            action: "codex.work.start",
            status: "failure",
            description: "Codex 実行キューへの登録に失敗しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                filename,
                error: message,
            },
        });
    }
    return true;
};
exports.handleWorkStartSelect = handleWorkStartSelect;
const handleCancel = async (interaction, context) => {
    await interaction.deferReply({ ephemeral: true });
    const queueId = interaction.options.getString("queue_id", true).trim();
    try {
        const result = workManager_1.codexWorkManager.cancel(queueId);
        if (result.state === "not_found") {
            await interaction.editReply({
                content: [
                    `指定されたキュー ID \`${queueId}\` は見つかりませんでした。`,
                    "`/work status` で待機中・実行中の一覧を確認してください。",
                ].join("\n"),
            });
            await context.auditLogger.log({
                action: "codex.work.cancel",
                status: "failure",
                description: "指定したキュー ID が見つからずキャンセルできませんでした",
                details: {
                    userId: interaction.user.id,
                    channelId: interaction.channel?.id ?? null,
                    queueId,
                    resultState: result.state,
                },
            });
            return;
        }
        if (result.state === "finished") {
            await interaction.editReply({
                content: [
                    "指定のキューは既に完了しているため、キャンセル対象がありませんでした。",
                    summarizeQueueItem(result.item),
                ].join("\n\n"),
            });
            await context.auditLogger.log({
                action: "codex.work.cancel",
                status: "info",
                description: "キャンセル対象が既に完了していました",
                details: {
                    userId: interaction.user.id,
                    channelId: interaction.channel?.id ?? null,
                    queueId,
                    resultState: result.state,
                    itemStatus: result.item.status,
                },
            });
            return;
        }
        if (result.state === "running") {
            await interaction.editReply({
                content: [
                    "キャンセル要求を受け付けました。実行中タスクの停止処理を開始します。",
                    "数秒後に `/work status` で状態を再確認してください。",
                    summarizeQueueItem(result.item),
                ].join("\n\n"),
            });
            await context.auditLogger.log({
                action: "codex.work.cancel",
                status: "success",
                description: "実行中タスクにキャンセル要求を送信しました",
                details: {
                    userId: interaction.user.id,
                    channelId: interaction.channel?.id ?? null,
                    queueId,
                    resultState: result.state,
                },
            });
            return;
        }
        // state === "cancelled"
        await interaction.editReply({
            content: [
                "待機中のキューをキャンセルしました。",
                summarizeQueueItem(result.item),
            ].join("\n\n"),
        });
        await context.auditLogger.log({
            action: "codex.work.cancel",
            status: "success",
            description: "待機中タスクのキャンセルに成功しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                queueId,
                resultState: result.state,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Codex 実行キューのキャンセル処理でエラーが発生しました", {
            queueId,
            error: message,
        });
        await interaction.editReply({
            content: "キャンセル処理中にエラーが発生しました。再度お試しください。",
        });
        await context.auditLogger.log({
            action: "codex.work.cancel",
            status: "failure",
            description: "Codex 実行キューのキャンセル処理に失敗しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                queueId,
                error: message,
            },
        });
    }
};
const handleStatus = async (interaction, context) => {
    await interaction.deferReply({ ephemeral: true });
    const queueId = interaction.options.getString("queue_id")?.trim() ?? null;
    try {
        let content;
        if (queueId) {
            const item = workManager_1.codexWorkManager.getQueueItem(queueId);
            if (!item) {
                content = [
                    `指定されたキュー ID \`${queueId}\` の情報が見つかりませんでした。`,
                    "`/work status` を引数なしで実行し、全体の状況を確認してください。",
                ].join("\n");
            }
            else {
                content = [
                    "指定されたキューのステータスです。",
                    summarizeQueueItem(item),
                ].join("\n\n");
            }
        }
        else {
            const snapshot = workManager_1.codexWorkManager.getQueueSnapshot();
            content = summarizeQueueSnapshot(snapshot);
        }
        await interaction.editReply({ content });
        await context.auditLogger.log({
            action: "codex.work.status",
            status: "success",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                queueId: queueId ?? "(all)",
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Codex 実行キューの取得中にエラーが発生しました", {
            queueId,
            error: message,
        });
        await interaction.editReply({
            content: "キューの状態取得中にエラーが発生しました。時間をおいて再度お試しください。",
        });
        await context.auditLogger.log({
            action: "codex.work.status",
            status: "failure",
            description: "キューの状態取得に失敗しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                queueId: queueId ?? "(all)",
                error: message,
            },
        });
    }
};
const execute = async (interaction, context) => {
    const subcommand = interaction.options.getSubcommand();
    const access = (0, accessControl_1.checkCodexCommandAccess)(interaction);
    if (!access.ok) {
        await interaction.reply({
            content: access.message,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        const action = subcommand === "start"
            ? "codex.work.start"
            : subcommand === "cancel"
                ? "codex.work.cancel"
                : subcommand === "status"
                    ? "codex.work.status"
                    : "codex.work";
        await context.auditLogger.log({
            action,
            status: "failure",
            description: "Codex ワークフローコマンドの権限不足により処理を中断しました",
            details: {
                userId: interaction.user.id,
                channelId: interaction.channel?.id ?? null,
                subcommand,
                reason: access.reason,
            },
        });
        return;
    }
    switch (subcommand) {
        case "start":
            await handleStart(interaction, context);
            break;
        case "cancel":
            await handleCancel(interaction, context);
            break;
        case "status":
            await handleStatus(interaction, context);
            break;
        default:
            await interaction.reply({
                content: "未対応のサブコマンドです。",
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            break;
    }
};
exports.workCommand = {
    data: buildCommand(),
    execute,
};
//# sourceMappingURL=work.js.map