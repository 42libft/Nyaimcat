import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

import { EntryCommandError, EntryCommandHandler } from "../../escl/entryCommandHandler";
import { logger } from "../../utils/logger";
import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { buildAccountChoices } from "./esclAccount";

const data = new SlashCommandBuilder()
  .setName("entry")
  .setDescription("ESCL 応募を前日0:00(JST)に自動送信します。")
  .addStringOption((option) =>
    option
      .setName("event_date")
      .setDescription("スクリム開催日 (YYYY-MM-DD)")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("scrim_id")
      .setDescription("ESCL の scrimId")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("team_id")
      .setDescription("省略時は登録済み teamId を使用します")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("dispatch_at")
      .setDescription("応募を送信する時刻 (HH:MM, JST)。省略時は前日0:00")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("account")
      .setDescription("使用する ESCL アカウント。省略時はデフォルト/レガシー")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .setDMPermission(false);

const replyWithError = async (
  interaction: ChatInputCommandInteraction,
  message: string,
  options?: { ephemeral?: boolean }
) => {
  const payload =
    options?.ephemeral === false
      ? { content: message }
      : { content: message, flags: MessageFlags.Ephemeral };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const scrimId = interaction.options.getInteger("scrim_id", true);

  if (!Number.isInteger(scrimId) || scrimId <= 0) {
    await replyWithError(interaction, "scrim_id は正の整数で指定してください。");
    return;
  }

  const eventDate = interaction.options.getString("event_date", true);
  const teamId = interaction.options.getInteger("team_id", false);
  const dispatchAt = interaction.options.getString("dispatch_at", false);
  const accountId = interaction.options.getString("account", false);

  const handler = new EntryCommandHandler({
    interaction,
    scheduler: context.escl.entryScheduler,
    environment: context.escl,
    auditLogger: context.auditLogger,
  });

  try {
    await handler.scheduleEntry({
      eventDate,
      scrimId,
      teamId,
      dispatchAt,
      accountId,
    });
  } catch (error) {
    if (error instanceof EntryCommandError) {
      await replyWithError(interaction, error.message, {
        ephemeral: error.ephemeral,
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);

    logger.error("/entry コマンドの実行に失敗しました", {
      message,
      scrimId,
      userId: interaction.user.id,
    });

    await replyWithError(interaction, "コマンド実行中にエラーが発生しました。再度お試しください。");
  }
};

export const entryCommand: SlashCommandModule = {
  data,
  execute,
  autocomplete: async (interaction: AutocompleteInteraction, context) => {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "account") {
      await interaction.respond([]);
      return;
    }

    try {
      const choices = await buildAccountChoices(
        context,
        interaction.user.id,
        focused.value
      );
      await interaction.respond(choices);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("/entry コマンドのアカウント補完に失敗しました", {
        message,
        userId: interaction.user.id,
      });
      await interaction.respond([]);
    }
  },
};
