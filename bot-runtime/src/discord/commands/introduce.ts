import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";

const data = new SlashCommandBuilder()
  .setName("introduce")
  .setDescription("自己紹介を投稿します")
  .setDMPermission(false);

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  if (!interaction.guild) {
    await interaction.reply({
      content: "ギルド内でのみ使用できます。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await context.introduceManager.openModal(interaction);
};

export const introduceCommand: SlashCommandModule = {
  data,
  execute,
};
