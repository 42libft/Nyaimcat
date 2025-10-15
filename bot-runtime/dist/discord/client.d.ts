import { Client } from "discord.js";
import type { BotConfig } from "../config";
export type DiscordClientOptions = {
    token: string;
    clientId: string;
    guildId?: string;
    config: BotConfig;
};
export declare class DiscordRuntime {
    private readonly token;
    private readonly clientId;
    private readonly guildId;
    private readonly rest;
    private client;
    private commands;
    private config;
    private auditLogger;
    private onboarding;
    constructor(options: DiscordClientOptions);
    start(): Promise<void>;
    applyConfigUpdate(config: BotConfig, context?: {
        changedSections?: string[];
        hash?: string;
    }): void;
    getClient(): Client<boolean>;
    private registerEventHandlers;
    private registerSlashCommands;
    private handleChatCommand;
}
//# sourceMappingURL=client.d.ts.map