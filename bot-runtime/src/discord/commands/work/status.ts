import type { ChatInputCommandInteraction } from "discord.js";

import type { CommandExecuteContext } from "../types";
import { codexWorkManager } from "../../../codex/workManager";
import { logger } from "../../../utils/logger";
import { summarizeQueueItem, summarizeQueueSnapshot } from "./shared";

export const handleWorkStatus = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  await interaction.deferReply({ ephemeral: true });

  const queueId = interaction.options.getString("queue_id")?.trim() ?? null;

  try {
    let content: string;

    if (queueId) {
      const item = codexWorkManager.getQueueItem(queueId);
      if (!item) {
        content = [
          `指定されたキュー ID \`${queueId}\` の情報が見つかりませんでした。`,
          "`/work status` を引数なしで実行し、全体の状況を確認してください。",
        ].join("\n");
      } else {
        content = [
          "指定されたキューのステータスです。",
          summarizeQueueItem(item),
        ].join("\n\n");
      }
    } else {
      const snapshot = codexWorkManager.getQueueSnapshot();
      content = summarizeQueueSnapshot(snapshot);
    }

    await interaction.editReply({ content });

    await context.auditLogger.log({
      action: "codex.work.status",
      status: "success",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        queueId: queueId ?? "(all)",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Codex 実行キューの取得中にエラーが発生しました", {
      queueId,
      error: message,
    });

    await interaction.editReply({
      content: "キューの状態取得中にエラーが発生しました。時間をおいて再度お試しください。",
    });

    await context.auditLogger.log({
      action: "codex.work.status",
      status: "failure",
      description: "キューの状態取得に失敗しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        queueId: queueId ?? "(all)",
        error: message,
      },
    });
  }
};
