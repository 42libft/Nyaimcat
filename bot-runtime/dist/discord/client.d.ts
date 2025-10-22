import { Client } from "discord.js";
import type { BotConfig } from "../config";
export type DiscordClientOptions = {
    token: string;
    clientId: string;
    guildId?: string;
    config: BotConfig;
    syncCommands?: boolean;
};
export declare class DiscordRuntime {
    private readonly token;
    private readonly clientId;
    private readonly guildId;
    private readonly syncCommands;
    private readonly rest;
    private client;
    private commands;
    private config;
    private auditLogger;
    private onboarding;
    private verifyManager;
    private rolesManager;
    private introduceManager;
    private codexFollowUpManager;
    private presenceManager;
    private escl;
    constructor(options: DiscordClientOptions);
    start(): Promise<void>;
    applyConfigUpdate(config: BotConfig, context?: {
        changedSections?: string[];
        hash?: string;
    }): void;
    getClient(): Client<boolean>;
    private registerEventHandlers;
    private registerSlashCommands;
    private buildCommandContext;
    private handleChatCommand;
    private handleAutocomplete;
    private handleEsclAccountModal;
}
//# sourceMappingURL=client.d.ts.map