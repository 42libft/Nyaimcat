import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotConfig } from "../../config";
export type CommandExecuteContext = {
    config: BotConfig;
};
export type SlashCommandModule = {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction, context: CommandExecuteContext) => Promise<void>;
};
//# sourceMappingURL=types.d.ts.map