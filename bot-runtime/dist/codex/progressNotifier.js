"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexProgressNotifier = void 0;
const discordActions_1 = require("./discordActions");
const notifications_1 = require("./notifications");
const checks_1 = require("../health/checks");
const settings_1 = require("./settings");
const task_1 = require("../discord/commands/task");
const logger_1 = require("../utils/logger");
const summary_1 = require("../health/summary");
const INFO_COLOR = 0x3498db;
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
const buildItemMap = (snapshot) => {
    const map = new Map();
    if (snapshot.active) {
        map.set(snapshot.active.id, snapshot.active);
    }
    snapshot.pending.forEach((item) => {
        map.set(item.id, item);
    });
    snapshot.history.forEach((item) => {
        map.set(item.id, item);
    });
    return map;
};
const resolvePriority = (value) => {
    const label = task_1.PRIORITY_LABELS[value];
    return label ?? value;
};
class CodexProgressNotifier {
    constructor(queue, config = (0, settings_1.getLongRunNotificationConfig)()) {
        this.tracked = new Map();
        this.unsubscribe = null;
        this.queue = queue;
        this.config = config;
        if (this.config.enabled) {
            this.unsubscribe = this.queue.subscribe((snapshot) => {
                this.handleSnapshot(snapshot);
            });
        }
    }
    track(context) {
        if (!this.config.enabled) {
            return;
        }
        const channelId = (0, notifications_1.resolveNotifyChannelId)(context.notifyOptions);
        if (!channelId) {
            logger_1.logger.debug("長時間実行通知: 通知チャンネル未設定のため監視をスキップします", {
                queueId: context.queueId,
                filename: context.task.filename,
            });
            return;
        }
        this.tracked.set(context.queueId, {
            queueId: context.queueId,
            task: context.task,
            notifyOptions: context.notifyOptions,
            channelId,
            notificationsSent: 0,
        });
    }
    dispose() {
        if (this.unsubscribe) {
            try {
                this.unsubscribe();
            }
            catch (error) {
                logger_1.logger.warn("進捗通知の購読解除でエラーが発生しました", {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            this.unsubscribe = null;
        }
        this.tracked.forEach((entry) => {
            if (entry.nextTimer) {
                clearTimeout(entry.nextTimer);
            }
        });
        this.tracked.clear();
    }
    handleSnapshot(snapshot) {
        if (this.tracked.size === 0) {
            return;
        }
        const items = buildItemMap(snapshot);
        for (const [queueId, entry] of this.tracked) {
            const item = items.get(queueId);
            if (!item) {
                this.stopTracking(queueId);
                continue;
            }
            if (item.status === "running") {
                if (!entry.runningSince) {
                    const startedAt = item.startedAt ? Date.parse(item.startedAt) : NaN;
                    entry.runningSince = Number.isFinite(startedAt)
                        ? startedAt
                        : Date.now();
                }
                this.ensureTimer(queueId, entry);
                continue;
            }
            if (item.status === "pending") {
                this.resetEntry(entry);
                continue;
            }
            this.stopTracking(queueId);
        }
    }
    ensureTimer(queueId, entry) {
        if (!this.hasRemainingQuota(entry)) {
            return;
        }
        if (entry.nextTimer) {
            return;
        }
        const delay = this.config.initialDelayMs;
        if (delay <= 0) {
            void this.triggerNotification(queueId);
            return;
        }
        this.scheduleNext(queueId, delay);
    }
    scheduleNext(queueId, delayMs) {
        const entry = this.tracked.get(queueId);
        if (!entry) {
            return;
        }
        if (entry.nextTimer) {
            clearTimeout(entry.nextTimer);
        }
        entry.nextTimer = setTimeout(() => {
            void this.triggerNotification(queueId);
        }, delayMs);
    }
    async triggerNotification(queueId) {
        const entry = this.tracked.get(queueId);
        if (!entry) {
            return;
        }
        delete entry.nextTimer;
        if (!this.hasRemainingQuota(entry)) {
            return;
        }
        const item = this.queue.getItem(queueId);
        if (!item || item.status !== "running") {
            return;
        }
        try {
            await this.publishFollowUp(entry, item);
            entry.notificationsSent += 1;
        }
        catch (error) {
            logger_1.logger.warn("長時間実行フォローアップ通知の送信に失敗しました", {
                queueId,
                filename: entry.task.filename,
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }
        if (!this.config.intervalMs) {
            return;
        }
        if (!this.hasRemainingQuota(entry)) {
            return;
        }
        const latest = this.queue.getItem(queueId);
        if (!latest || latest.status !== "running") {
            return;
        }
        this.scheduleNext(queueId, this.config.intervalMs);
    }
    async publishFollowUp(entry, item) {
        const elapsedMs = (() => {
            const since = entry.runningSince ?? Date.now();
            return Math.max(0, Date.now() - since);
        })();
        const elapsedLabel = formatDuration(elapsedMs);
        const priority = resolvePriority(entry.task.metadata.priority);
        const fields = [
            {
                name: "タスク",
                value: entry.task.metadata.title,
            },
            {
                name: "ファイル",
                value: `\`${entry.task.filename}\``,
                inline: true,
            },
            {
                name: "キュー ID",
                value: `\`${entry.queueId}\``,
                inline: true,
            },
            {
                name: "優先度",
                value: priority,
                inline: true,
            },
            {
                name: "経過時間",
                value: elapsedLabel,
                inline: true,
            },
            {
                name: "開始時刻",
                value: formatTimestamp(item.startedAt),
            },
        ];
        const healthSummary = (0, summary_1.collectHealthIssueSummary)();
        if (healthSummary.total > 0) {
            fields.push({
                name: "ヘルス警告",
                value: healthSummary.lines.join("\n").slice(0, 1024),
            });
        }
        const embed = {
            title: "Codex 実行が継続中です",
            color: INFO_COLOR,
            fields,
            timestamp: new Date().toISOString(),
        };
        const content = `Codex 実行が継続中です（${elapsedLabel}経過）`;
        let actions = entry.notifyOptions.actions ?? entry.actions;
        if (!actions) {
            try {
                actions = (0, discordActions_1.createDiscordActionsFromEnv)();
                (0, checks_1.clearDiscordActionsInitIssue)();
                entry.actions = actions;
            }
            catch (error) {
                logger_1.logger.warn("DiscordActions の初期化に失敗したため長時間実行通知を停止します", {
                    queueId: entry.queueId,
                    filename: entry.task.filename,
                    error: error instanceof Error ? error.message : String(error),
                });
                (0, checks_1.recordDiscordActionsInitFailure)(error);
                this.stopTracking(entry.queueId);
                return;
            }
        }
        await actions.publishMessage(entry.channelId, {
            content,
            embeds: [embed],
        });
    }
    resetEntry(entry) {
        delete entry.runningSince;
        if (entry.nextTimer) {
            clearTimeout(entry.nextTimer);
            delete entry.nextTimer;
        }
    }
    stopTracking(queueId) {
        const entry = this.tracked.get(queueId);
        if (!entry) {
            return;
        }
        if (entry.nextTimer) {
            clearTimeout(entry.nextTimer);
        }
        this.tracked.delete(queueId);
    }
    hasRemainingQuota(entry) {
        if (this.config.maxNotifications === null) {
            return true;
        }
        return entry.notificationsSent < this.config.maxNotifications;
    }
}
exports.CodexProgressNotifier = CodexProgressNotifier;
//# sourceMappingURL=progressNotifier.js.map