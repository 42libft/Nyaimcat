"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceManager = void 0;
const discord_js_1 = require("discord.js");
const summary_1 = require("../health/summary");
const registry_1 = require("../health/registry");
const logger_1 = require("../utils/logger");
const MAX_STATE_LENGTH = 80;
const truncate = (value, limit) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const stripPrefix = (line) => line.replace(/^[🛑⚠️]\s+/, "").trim();
const stripDetectedAt = (line) => line.replace(/\s*\(検知:[^)]+\)\s*$/, "").trim();
class PresenceManager {
    constructor(client) {
        this.client = client;
        this.started = false;
    }
    start() {
        if (this.started) {
            return;
        }
        this.unsubscribe = registry_1.healthRegistry.subscribe({
            onReport: () => this.handleHealthChange(),
            onResolve: () => this.handleHealthChange(),
        });
        this.started = true;
        void this.refresh();
    }
    stop() {
        if (!this.started) {
            return;
        }
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.started = false;
    }
    async refresh() {
        if (!this.started || !this.client.isReady() || !this.client.user) {
            return;
        }
        const presence = this.buildPresence();
        try {
            await this.client.user.setPresence(presence);
            logger_1.logger.debug("Discord プレゼンスを更新しました", {
                status: presence.status,
                activity: presence.activities?.[0]?.state ??
                    presence.activities?.[0]?.name ??
                    null,
            });
        }
        catch (error) {
            logger_1.logger.warn("Discord プレゼンス更新に失敗しました", {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    handleHealthChange() {
        void this.refresh();
    }
    buildPresence() {
        const issues = registry_1.healthRegistry.list();
        if (issues.length === 0) {
            return {
                status: "online",
                activities: [
                    {
                        type: discord_js_1.ActivityType.Custom,
                        name: "Custom Status",
                        state: "🟢 利用可能",
                    },
                ],
            };
        }
        const hasError = issues.some((issue) => issue.level === "error");
        const prefix = hasError ? "🛑 障害対応中" : "⚠️ 警告中";
        const summary = (0, summary_1.collectHealthIssueSummary)(1);
        const topLine = summary.lines[0]
            ? stripDetectedAt(stripPrefix(summary.lines[0]))
            : "";
        const countSuffix = summary.total > 1 ? ` (+${summary.total - 1})` : "";
        const stateBase = topLine.length > 0
            ? `${prefix} | ${topLine}${countSuffix}`
            : `${prefix}${countSuffix}`;
        const state = truncate(stateBase, MAX_STATE_LENGTH);
        return {
            status: hasError ? "dnd" : "idle",
            activities: [
                {
                    type: discord_js_1.ActivityType.Custom,
                    name: "Custom Status",
                    state,
                },
            ],
        };
    }
}
exports.PresenceManager = PresenceManager;
//# sourceMappingURL=presenceManager.js.map