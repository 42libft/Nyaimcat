import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { TeamStoreError } from "../../escl/teamStore";
import { logger } from "../../utils/logger";
import type { CommandExecuteContext, SlashCommandModule } from "./types";

const data = new SlashCommandBuilder()
  .setName("set-team")
  .setDescription("ESCL の teamId を登録します。")
  .addIntegerOption((option) =>
    option
      .setName("team_id")
      .setDescription("ESCL の teamId を入力してください。")
      .setRequired(true)
  )
  .setDMPermission(false);

const saveTeamId = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const teamId = interaction.options.getInteger("team_id", true);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    await interaction.reply({
      content: "team_id は正の整数で指定してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await context.escl.teamStore.setTeamId(interaction.user.id, teamId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("teamId の保存に失敗しました", {
      message,
      userId: interaction.user.id,
    });

    const isKnownError = error instanceof TeamStoreError;

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content:
          "teamId の保存に失敗しました。ファイル権限を確認して後ほど再試行してください。",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content:
          "teamId の保存に失敗しました。ファイル権限を確認して後ほど再試行してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    await context.auditLogger.log({
      action: "escl.set_team",
      status: "failure",
      description: message,
      details: {
        userId: interaction.user.id,
        isKnownError,
      },
    });

    return;
  }

  await interaction.reply({
    content: `teamId=${teamId} を登録しました。`,
    flags: MessageFlags.Ephemeral,
  });

  await context.auditLogger.log({
    action: "escl.set_team",
    status: "success",
    details: {
      userId: interaction.user.id,
      teamId,
    },
  });
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  await saveTeamId(interaction, context);
};

export const setTeamCommand: SlashCommandModule = {
  data,
  execute,
};
