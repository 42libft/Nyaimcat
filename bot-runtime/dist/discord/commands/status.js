"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusCommand = void 0;
const discord_js_1 = require("discord.js");
const workManager_1 = require("../../codex/workManager");
const package_json_1 = __importDefault(require("../../../package.json"));
const summary_1 = require("../../health/summary");
const STATUS_LABELS = {
    pending: "保留中",
    running: "実行中",
    succeeded: "完了",
    failed: "失敗",
    cancelled: "キャンセル",
};
const formatDuration = (durationMs) => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours > 0) {
        parts.push(`${hours}時間`);
    }
    if (minutes > 0) {
        parts.push(`${minutes}分`);
    }
    if (parts.length === 0 && seconds === 0) {
        parts.push("0秒");
    }
    else if (hours === 0 && minutes === 0) {
        parts.push(`${seconds}秒`);
    }
    else if (seconds > 0) {
        parts.push(`${seconds}秒`);
    }
    return parts.join("");
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
const formatBytesToMb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const buildQueueSummary = () => {
    const snapshot = workManager_1.codexWorkManager.getQueueSnapshot();
    const lines = [];
    if (snapshot.active) {
        lines.push(`- 実行中: [${STATUS_LABELS[snapshot.active.status] ?? snapshot.active.status}] \`${snapshot.active.filename}\` (ID: \`${snapshot.active.id}\`)`);
    }
    else {
        lines.push("- 実行中: なし");
    }
    const pendingCount = snapshot.pending.length;
    lines.push(`- 待機列: ${pendingCount}件`);
    if (pendingCount > 0) {
        const preview = snapshot.pending.slice(0, 3).map((item, index) => {
            const status = STATUS_LABELS[item.status] ?? item.status;
            return `  ${index + 1}. [${status}] \`${item.filename}\` (ID: \`${item.id}\`)`;
        });
        lines.push(...preview);
        if (pendingCount > 3) {
            lines.push(`  …他 ${pendingCount - 3} 件`);
        }
    }
    const recent = snapshot.history[0];
    if (recent) {
        const status = STATUS_LABELS[recent.status] ?? recent.status;
        const finished = recent.finishedAt
            ? formatTimestamp(recent.finishedAt)
            : "-";
        const exitCode = recent.result && recent.result.exitCode !== null
            ? String(recent.result.exitCode)
            : recent.result
                ? "(null)"
                : "-";
        const timedOut = recent.result?.timedOut ? "はい" : "いいえ";
        lines.push(`- 直近履歴: [${status}] \`${recent.filename}\` (終了: ${finished})`);
        if (recent.result) {
            lines.push(`  Run ID: \`${recent.result.runId}\` / 終了コード: ${exitCode} / タイムアウト: ${timedOut}`);
        }
        else if (recent.error?.message) {
            lines.push(`  エラー: ${recent.error.message}`);
        }
    }
    else {
        lines.push("- 直近履歴: なし");
    }
    return lines;
};
const data = new discord_js_1.SlashCommandBuilder()
    .setName("status")
    .setDescription("Bot と Codex 連携の稼働状況を表示します");
const execute = async (interaction, context) => {
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const uptimeMs = typeof context.client.uptime === "number"
        ? context.client.uptime
        : process.uptime() * 1000;
    const uptime = formatDuration(uptimeMs);
    const ping = Math.max(0, Math.round(context.client.ws.ping));
    const memory = process.memoryUsage();
    const botReady = context.client.isReady();
    const botSection = [
        "**Bot 稼働状況**",
        `- ステータス: ${botReady ? "オンライン" : "初期化中"}`,
        `- 稼働時間: ${uptime}`,
        `- WebSocket Ping: ${ping} ms`,
        `- メモリ使用量: RSS ${formatBytesToMb(memory.rss)} / Heap ${formatBytesToMb(memory.heapUsed)}`,
        `- Node.js: ${process.version}`,
        `- Bot Runtime: v${package_json_1.default.version}`,
    ];
    const queueSection = ["**Codex 実行キュー**", ...buildQueueSummary()];
    const auditChannelConfigured = context.config.channels.auditLog
        ? `設定済 (\`${context.config.channels.auditLog}\`)`
        : "未設定";
    const notifyChannel = process.env.CODEX_DISCORD_NOTIFY_CHANNEL
        ? `設定済 (\`${process.env.CODEX_DISCORD_NOTIFY_CHANNEL}\`)`
        : "未設定";
    const docsUpdateDefault = process.env.CODEX_DOCS_UPDATE_ENABLED ??
        "(env未設定: 設定ファイルの既定値を使用)";
    const healthSection = ["**ヘルスチェック**"];
    const healthSummary = (0, summary_1.collectHealthIssueSummary)(5);
    if (healthSummary.total === 0) {
        healthSection.push("- 問題なし");
    }
    else {
        healthSection.push(`- 合計 ${healthSummary.total} 件のヘルス警告があります。`);
        for (const line of healthSummary.lines) {
            healthSection.push(`  - ${line}`);
        }
    }
    const configSection = [
        "**設定チェック**",
        `- 監査ログチャンネル: ${auditChannelConfigured}`,
        `- Codex 通知チャンネル: ${notifyChannel}`,
        `- Docs 自動更新既定: ${docsUpdateDefault}`,
        `- ギルドID: \`${context.config.guild.id}\``,
    ];
    const lines = [
        ...botSection,
        "",
        ...queueSection,
        "",
        ...configSection,
        "",
        ...healthSection,
    ];
    await interaction.editReply({
        content: lines.join("\n"),
    });
};
exports.statusCommand = {
    data,
    execute,
};
//# sourceMappingURL=status.js.map