import {
  AttachmentBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { runEsclCsv } from "../../utils/esclCli";
import { logger } from "../../utils/logger";

const data = new SlashCommandBuilder();
data
  .setName("escl_from_parent_csv")
  .setDescription("グループURLから6試合分のCSV（ALL_GAMES相当）を生成します");
data.addStringOption((option) =>
  option
    .setName("parent_url")
    .setDescription("ESCLグループページのURL（/scrims/<scrim>/<group>）")
    .setRequired(true)
);
data.addStringOption((option) =>
  option
    .setName("group")
    .setDescription("任意のグループ名（例: G5, G8）")
    .setRequired(false)
);

const execute = async (
  interaction: ChatInputCommandInteraction,
  _context: CommandExecuteContext
) => {
  const parentUrl = interaction.options.getString("parent_url", true);
  const group = interaction.options.getString("group");

  await interaction.deferReply();

  try {
    const result = await runEsclCsv(parentUrl, group);
    const file = new AttachmentBuilder(result.buffer, {
      name: result.filename,
    });

    await interaction.editReply({
      content: "API直叩きでCSVを生成しました。（生データALL_GAMES相当）",
      files: [file],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("escl_from_parent_csv コマンドでエラーが発生しました", {
      message,
    });

    await interaction.editReply({
      content: `取得に失敗しました: ${message}`,
    });
  }
};

export const esclFromParentCsvCommand: SlashCommandModule = {
  data,
  execute,
};
