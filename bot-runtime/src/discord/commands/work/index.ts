import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { SlashCommandModule, CommandExecuteContext } from "../types";
import { checkCodexCommandAccess } from "../../../codex/accessControl";
import { handleWorkStart, handleWorkStartSelect } from "./start";
import { handleWorkCancel } from "./cancel";
import { handleWorkStatus } from "./status";

const buildCommand = () =>
  new SlashCommandBuilder()
    .setName("work")
    .setDescription("Codex 実行キューを操作します")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("指定したタスクファイルを Codex 実行キューに登録します")
        .addStringOption((option) =>
          option
            .setName("filename")
            .setDescription("tasks/inbox/ 内のタスクファイル名 (.md)")
            .setRequired(false)
            .setMinLength(5)
            .setMaxLength(200)
        )
        .addBooleanOption((option) =>
          option
            .setName("latest")
            .setDescription("最新のタスクを自動選択して実行します")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("notify_channel")
            .setDescription("Codex 実行結果を通知するチャンネル (未指定時は既定設定)")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement
            )
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("skip_notify")
            .setDescription("通知を完全に無効化する場合に有効にします")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("update_docs")
            .setDescription("docs/plans.md などの自動追記を有効／無効に上書きします")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Codex 実行キューのタスクをキャンセルします")
        .addStringOption((option) =>
          option
            .setName("queue_id")
            .setDescription("キャンセルするキュー ID")
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Codex 実行キューの状態を確認します")
        .addStringOption((option) =>
          option
            .setName("queue_id")
            .setDescription("個別のキュー ID を指定した場合、その詳細を表示します")
            .setRequired(false)
            .setMinLength(5)
            .setMaxLength(100)
        )
    )
    .setDMPermission(false);

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const subcommand = interaction.options.getSubcommand();

  const access = checkCodexCommandAccess(interaction);
  if (!access.ok) {
    await interaction.reply({
      content: access.message,
      flags: MessageFlags.Ephemeral,
    });

    const action =
      subcommand === "start"
        ? "codex.work.start"
        : subcommand === "cancel"
          ? "codex.work.cancel"
          : subcommand === "status"
            ? "codex.work.status"
            : "codex.work";

    await context.auditLogger.log({
      action,
      status: "failure",
      description: "Codex ワークフローコマンドの権限不足により処理を中断しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        subcommand,
        reason: access.reason,
      },
    });
    return;
  }

  switch (subcommand) {
    case "start":
      await handleWorkStart(interaction, context);
      break;
    case "cancel":
      await handleWorkCancel(interaction, context);
      break;
    case "status":
      await handleWorkStatus(interaction, context);
      break;
    default:
      await interaction.reply({
        content: "未対応のサブコマンドです。",
        flags: MessageFlags.Ephemeral,
      });
      break;
  }
};

export const workCommand: SlashCommandModule = {
  data: buildCommand(),
  execute,
};

export { handleWorkStartSelect } from "./start";
