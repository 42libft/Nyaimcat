import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { SlashCommandModule } from "./types";
import { healthRegistry } from "../../health/registry";

const formatTimestamp = (value: string | undefined) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

const formatDetailValue = (value: unknown) => {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const renderDetails = (details: Record<string, unknown> | undefined) => {
  if (!details) {
    return [];
  }

  const entries = Object.entries(details);
  if (entries.length === 0) {
    return [];
  }

  return entries.slice(0, 5).map(([key, value]) => {
    const rendered = formatDetailValue(value);
    return `    • ${key}: ${rendered}`;
  });
};

const data = new SlashCommandBuilder()
  .setName("health")
  .setDescription("Bot のヘルスチェック状態を表示します。");

const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const issues = healthRegistry.list();

  if (issues.length === 0) {
    await interaction.editReply({
      content: [
        "🟢 現在アクティブなヘルス警告はありません。",
        "必要に応じて `/status` コマンドで稼働状況の概要を確認できます。",
      ].join("\n"),
    });
    return;
  }

  const lines = [`⚠️ 合計 ${issues.length} 件のヘルス警告が存在します。`];

  for (const issue of issues) {
    const icon = issue.level === "error" ? "🛑" : "⚠️";
    lines.push(
      "",
      `${icon} ${issue.message}`,
      `  - レベル: ${issue.level === "error" ? "エラー" : "警告"}`,
      `  - 検知: ${formatTimestamp(issue.detectedAt)}`
    );

    const detailLines = renderDetails(issue.details);
    if (detailLines.length > 0) {
      lines.push("  - 詳細:");
      lines.push(...detailLines);
    }
  }

  lines.push(
    "",
    "🔎 ヘルス警告が解消された際は自動で通知されます。最新状況の履歴は `tasks/runs/health/` を参照してください。"
  );

  await interaction.editReply({ content: lines.join("\n") });
};

export const healthCommand: SlashCommandModule = {
  data,
  execute,
};
