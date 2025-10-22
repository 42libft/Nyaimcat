import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import type { CommandExecuteContext } from "../types";
import { codexWorkManager } from "../../../codex/workManager";
import { logger } from "../../../utils/logger";
import { summarizeQueueItem } from "./shared";

export const handleWorkCancel = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const queueId = interaction.options.getString("queue_id", true).trim();

  try {
    const result = codexWorkManager.cancel(queueId);

    if (result.state === "not_found") {
      await interaction.editReply({
        content: [
          `指定されたキュー ID \`${queueId}\` は見つかりませんでした。`,
          "`/work status` で待機中・実行中の一覧を確認してください。",
        ].join("\n"),
      });

      await context.auditLogger.log({
        action: "codex.work.cancel",
        status: "failure",
        description: "指定したキュー ID が見つからずキャンセルできませんでした",
        details: {
          userId: interaction.user.id,
          channelId: interaction.channel?.id ?? null,
          queueId,
          resultState: result.state,
        },
      });
      return;
    }

    if (result.state === "finished") {
      await interaction.editReply({
        content: [
          "指定のキューは既に完了しているため、キャンセル対象がありませんでした。",
          summarizeQueueItem(result.item),
        ].join("\n\n"),
      });

      await context.auditLogger.log({
        action: "codex.work.cancel",
        status: "info",
        description: "キャンセル対象が既に完了していました",
        details: {
          userId: interaction.user.id,
          channelId: interaction.channel?.id ?? null,
          queueId,
          resultState: result.state,
          itemStatus: result.item.status,
        },
      });
      return;
    }

    if (result.state === "running") {
      await interaction.editReply({
        content: [
          "キャンセル要求を受け付けました。実行中タスクの停止処理を開始します。",
          "数秒後に `/work status` で状態を再確認してください。",
          summarizeQueueItem(result.item),
        ].join("\n\n"),
      });

      await context.auditLogger.log({
        action: "codex.work.cancel",
        status: "success",
        description: "実行中タスクにキャンセル要求を送信しました",
        details: {
          userId: interaction.user.id,
          channelId: interaction.channel?.id ?? null,
          queueId,
          resultState: result.state,
        },
      });
      return;
    }

    await interaction.editReply({
      content: [
        "待機中のキューをキャンセルしました。",
        summarizeQueueItem(result.item),
      ].join("\n\n"),
    });

    await context.auditLogger.log({
      action: "codex.work.cancel",
      status: "success",
      description: "待機中タスクのキャンセルに成功しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        queueId,
        resultState: result.state,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Codex 実行キューのキャンセル処理でエラーが発生しました", {
      queueId,
      error: message,
    });

    await interaction.editReply({
      content: "キャンセル処理中にエラーが発生しました。再度お試しください。",
    });

    await context.auditLogger.log({
      action: "codex.work.cancel",
      status: "failure",
      description: "Codex 実行キューのキャンセル処理に失敗しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        queueId,
        error: message,
      },
    });
  }
};
