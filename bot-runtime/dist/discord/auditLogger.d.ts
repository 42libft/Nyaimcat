import type { Client } from "discord.js";
import type { BotConfig } from "../config";
export type AuditLogStatus = "success" | "failure" | "info";
export type AuditLogPayload = {
    action: string;
    status: AuditLogStatus;
    description?: string;
    details?: Record<string, unknown>;
};
export declare class AuditLogger {
    private readonly client;
    private channelId;
    private channel;
    constructor(client: Client, config: BotConfig);
    updateConfig(config: BotConfig): void;
    log(payload: AuditLogPayload): Promise<void>;
    private ensureChannel;
}
//# sourceMappingURL=auditLogger.d.ts.map