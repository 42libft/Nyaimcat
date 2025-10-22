import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";

const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Botの応答速度を確認します");

const execute = async (
  interaction: ChatInputCommandInteraction,
  _context: CommandExecuteContext
) => {
  await interaction.reply({
    content: `Pong! (latency ${Date.now() - interaction.createdTimestamp}ms)`,
    flags: MessageFlags.Ephemeral,
  });
};

export const pingCommand: SlashCommandModule = {
  data,
  execute,
};
