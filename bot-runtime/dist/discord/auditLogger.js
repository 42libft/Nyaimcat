"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
const logger_1 = require("../utils/logger");
const formatAuditMessage = (payload) => {
    const body = {
        action: payload.action,
        status: payload.status,
        description: payload.description ?? null,
        details: payload.details ?? null,
        timestamp: new Date().toISOString(),
    };
    return `\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;
};
class AuditLogger {
    constructor(client, config) {
        this.channel = null;
        this.client = client;
        this.channelId = config.channels.auditLog ?? null;
    }
    updateConfig(config) {
        const nextChannelId = config.channels.auditLog ?? null;
        if (this.channelId !== nextChannelId) {
            this.channel = null;
        }
        this.channelId = nextChannelId;
    }
    async log(payload) {
        if (!this.channelId) {
            logger_1.logger.warn("監査ログチャンネルが設定されていないため、監査ログを送信できません");
            return;
        }
        try {
            const channel = await this.ensureChannel();
            if (!channel) {
                throw new Error("監査ログチャンネルの取得に失敗しました");
            }
            await channel.send({ content: formatAuditMessage(payload) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("監査ログの送信に失敗しました", {
                message,
                channelId: this.channelId,
            });
        }
    }
    async ensureChannel() {
        if (this.channel) {
            return this.channel;
        }
        if (!this.channelId) {
            return null;
        }
        const fetched = await this.client.channels.fetch(this.channelId);
        if (!fetched || !fetched.isTextBased()) {
            return null;
        }
        const candidate = fetched;
        if (typeof candidate.send !== "function") {
            return null;
        }
        this.channel = candidate;
        return this.channel;
    }
}
exports.AuditLogger = AuditLogger;
//# sourceMappingURL=auditLogger.js.map