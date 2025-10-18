"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.codexFailureMonitor = exports.CodexFailureMonitor = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../tasks/paths");
const logger_1 = require("../utils/logger");
const discordActions_1 = require("./discordActions");
const checks_1 = require("../health/checks");
const ALERT_COLOR = 0xe74c3c;
const parseInteger = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const parseFloatOrFallback = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const resolveConfigFromEnv = () => {
    const threshold = Math.max(0, Math.min(1, parseFloatOrFallback(process.env.CODEX_FAILURE_ALERT_THRESHOLD, 0.5)));
    const windowMinutes = Math.max(1, parseInteger(process.env.CODEX_FAILURE_ALERT_WINDOW_MINUTES, 60));
    const minRuns = Math.max(1, parseInteger(process.env.CODEX_FAILURE_ALERT_MIN_RUNS, 5));
    const minFailures = Math.max(1, parseInteger(process.env.CODEX_FAILURE_ALERT_MIN_FAILURES, 3));
    const cooldownMinutes = Math.max(1, parseInteger(process.env.CODEX_FAILURE_ALERT_COOLDOWN_MINUTES, 30));
    return {
        threshold,
        windowMs: windowMinutes * 60 * 1000,
        minRuns,
        minFailures,
        cooldownMs: cooldownMinutes * 60 * 1000,
    };
};
const truncate = (value, limit) => {
    if (value.length <= limit) {
        return value;
    }
    return `${value.slice(0, limit - 1)}…`;
};
const resolveAlertChannelId = () => process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL ??
    process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL ??
    process.env.CODEX_DISCORD_NOTIFY_CHANNEL ??
    null;
class CodexFailureMonitor {
    constructor(config = resolveConfigFromEnv()) {
        this.lastAlertAt = null;
        this.lastAlertKey = null;
        this.config = config;
    }
    async evaluate() {
        try {
            const stats = await this.collectStats();
            if (!stats) {
                return;
            }
            const totalRuns = stats.totalRuns;
            const failureCount = stats.failures.length;
            const successCount = stats.successes.length;
            if (totalRuns < this.config.minRuns) {
                return;
            }
            if (failureCount < this.config.minFailures) {
                return;
            }
            if (stats.failureRate < this.config.threshold) {
                return;
            }
            const now = Date.now();
            if (this.lastAlertAt &&
                now - this.lastAlertAt < this.config.cooldownMs) {
                logger_1.logger.debug("Codex 失敗率アラートをクールダウン中のためスキップします", {
                    windowMinutes: Math.round(this.config.windowMs / 60000),
                    failureRate: stats.failureRate,
                });
                return;
            }
            const latestFailurePath = stats.failures[0]?.filePath ?? "(unknown-failure-path)";
            const alertKey = `${failureCount}:${successCount}:${latestFailurePath}`;
            if (this.lastAlertKey === alertKey) {
                logger_1.logger.debug("Codex 失敗率アラートは直近と同一条件のためスキップします", {
                    alertKey,
                });
                return;
            }
            const sent = await this.dispatchAlert(stats);
            if (sent) {
                this.lastAlertAt = now;
                this.lastAlertKey = alertKey;
            }
        }
        catch (error) {
            logger_1.logger.warn("Codex 失敗率モニタリング処理でエラーが発生しました", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async collectStats() {
        const windowEnd = Date.now();
        const windowStart = windowEnd - this.config.windowMs;
        const [successes, failures] = await Promise.all([
            this.loadSuccessRecords(windowStart),
            this.loadFailureRecords(windowStart),
        ]);
        if (successes.length === 0 && failures.length === 0) {
            return null;
        }
        const totalRuns = successes.length + failures.length;
        const failureRate = failureCountToRate(failures.length, totalRuns);
        const orderedFailures = [...failures].sort((a, b) => b.timestamp - a.timestamp);
        return {
            totalRuns,
            failures: orderedFailures,
            successes,
            failureRate,
            windowStart,
            windowEnd,
        };
    }
    async loadSuccessRecords(windowStart) {
        const records = [];
        const entries = await this.readDirSafe(paths_1.RUN_HISTORY_DIR);
        for (const entry of entries) {
            if (entry.isDirectory()) {
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (!entry.name.endsWith(".json")) {
                continue;
            }
            const filePath = path_1.default.join(paths_1.RUN_HISTORY_DIR, entry.name);
            const parsed = await this.parseSuccess(filePath);
            if (!parsed) {
                continue;
            }
            const timestamp = Date.parse(parsed.executed_at);
            if (!Number.isFinite(timestamp)) {
                continue;
            }
            if (timestamp < windowStart) {
                continue;
            }
            records.push({
                timestamp,
                filePath,
            });
        }
        return records;
    }
    async loadFailureRecords(windowStart) {
        const records = [];
        const entries = await this.readDirSafe(paths_1.RUN_FAILURE_DIR);
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".json")) {
                continue;
            }
            const filePath = path_1.default.join(paths_1.RUN_FAILURE_DIR, entry.name);
            const parsed = await this.parseFailure(filePath);
            if (!parsed) {
                continue;
            }
            const timestamp = Date.parse(parsed.recorded_at);
            if (!Number.isFinite(timestamp) || timestamp < windowStart) {
                continue;
            }
            records.push({
                timestamp,
                filePath,
                queueId: parsed.queue_id ?? null,
                errorMessage: parsed.error?.message ?? null,
            });
        }
        return records;
    }
    async readDirSafe(dir) {
        try {
            const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
            return entries;
        }
        catch (error) {
            if (error?.code === "ENOENT") {
                return [];
            }
            throw error;
        }
    }
    async parseSuccess(filePath) {
        try {
            const content = await fs_1.promises.readFile(filePath, "utf-8");
            return JSON.parse(content);
        }
        catch (error) {
            logger_1.logger.warn("Codex 成功履歴の解析に失敗しました", {
                filePath,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
    async parseFailure(filePath) {
        try {
            const content = await fs_1.promises.readFile(filePath, "utf-8");
            return JSON.parse(content);
        }
        catch (error) {
            logger_1.logger.warn("Codex 失敗履歴の解析に失敗しました", {
                filePath,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
    async dispatchAlert(stats) {
        const channelId = resolveAlertChannelId();
        if (!channelId) {
            logger_1.logger.warn("Codex 失敗率アラートの送信先チャンネルが未設定のため通知をスキップします");
            return false;
        }
        let actions;
        try {
            actions = (0, discordActions_1.createDiscordActionsFromEnv)();
            (0, checks_1.clearDiscordActionsInitIssue)();
        }
        catch (error) {
            logger_1.logger.warn("DiscordActions の初期化に失敗したため Codex 失敗率アラートを送信できません", {
                error: error instanceof Error ? error.message : String(error),
            });
            (0, checks_1.recordDiscordActionsInitFailure)(error);
            return false;
        }
        const windowMinutes = Math.round(this.config.windowMs / 60000);
        const failureRatePercent = (stats.failureRate * 100).toFixed(1);
        const failuresPreview = stats.failures.slice(0, 3).map((failure) => {
            const queue = failure.queueId ? `\`${failure.queueId}\`` : "(不明)";
            const when = new Date(failure.timestamp).toISOString();
            const reason = failure.errorMessage
                ? truncate(failure.errorMessage, 140)
                : "(理由未取得)";
            const relative = this.toRelativePath(failure.filePath);
            return `• ${queue} @ ${when}\n  理由: ${reason}\n  ログ: \`${relative}\``;
        });
        const embedFields = [
            {
                name: "監視ウィンドウ",
                value: `過去 ${windowMinutes} 分`,
                inline: true,
            },
            {
                name: "失敗率",
                value: `${failureRatePercent}% (${stats.failures.length}/${stats.totalRuns})`,
                inline: true,
            },
            {
                name: "閾値",
                value: `${(this.config.threshold * 100).toFixed(1)}% / 最低失敗数 ${this.config.minFailures}`,
                inline: true,
            },
        ];
        if (failuresPreview.length > 0) {
            embedFields.push({
                name: "最新の失敗",
                value: failuresPreview.join("\n").slice(0, 1024),
                inline: false,
            });
        }
        const embed = {
            title: "Codex 実行の失敗率が閾値を超えています",
            color: ALERT_COLOR,
            description: [
                "過去の Codex 実行で失敗が集中しています。",
                "`/work status` や `tasks/runs/failures/` を確認し、原因の調査と対応をお願いします。",
            ].join("\n"),
            fields: embedFields,
            timestamp: new Date().toISOString(),
        };
        try {
            await actions.publishMessage(channelId, {
                content: "⚠️ Codex 実行失敗率がしきい値を超えました。",
                embeds: [embed],
            });
            logger_1.logger.warn("Codex 失敗率アラートを送信しました", {
                channelId,
                failureRate: stats.failureRate,
                failures: stats.failures.length,
                totalRuns: stats.totalRuns,
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error("Codex 失敗率アラートの送信に失敗しました", {
                channelId,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }
    toRelativePath(filePath) {
        try {
            const relative = path_1.default.relative(paths_1.REPO_ROOT, filePath);
            if (relative && !relative.startsWith("..") && !path_1.default.isAbsolute(relative)) {
                return relative;
            }
        }
        catch {
            /* noop */
        }
        return filePath;
    }
}
exports.CodexFailureMonitor = CodexFailureMonitor;
const failureCountToRate = (failures, total) => {
    if (total <= 0) {
        return 0;
    }
    return failures / total;
};
exports.codexFailureMonitor = new CodexFailureMonitor();
//# sourceMappingURL=failureMonitor.js.map