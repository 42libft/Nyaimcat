import type { ChatInputCommandInteraction, Client, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import type { BotConfig } from "../../config";
import type { AuditLogger } from "../auditLogger";
import type { VerifyManager } from "../verify/manager";
import type { RolesPanelManager } from "../roles/manager";
import type { IntroduceManager } from "../introduce/manager";
export type CommandExecuteContext = {
    config: BotConfig;
    client: Client;
    auditLogger: AuditLogger;
    verifyManager: VerifyManager;
    rolesManager: RolesPanelManager;
    introduceManager: IntroduceManager;
};
export type SlashCommandModule = {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute: (interaction: ChatInputCommandInteraction, context: CommandExecuteContext) => Promise<void>;
};
//# sourceMappingURL=types.d.ts.map