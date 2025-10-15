import {
  AttachmentBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { runEsclXlsx } from "../../utils/esclCli";
import { logger } from "../../utils/logger";

const data = new SlashCommandBuilder();
data
  .setName("escl_from_parent_xlsx")
  .setDescription(
    "グループURLからExcelを生成します（GAME1..6 / ALL_GAMES / TEAM_TOTALS）"
  );
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

  await interaction.deferReply({ ephemeral: false });

  try {
    const result = await runEsclXlsx(parentUrl, group);
    const file = new AttachmentBuilder(result.buffer, {
      name: result.filename,
    });

    await interaction.editReply({
      content:
        "Excelを生成しました。（ALL_GAMES=生データ / TEAM_TOTALS=チーム合計）",
      files: [file],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("escl_from_parent_xlsx コマンドでエラーが発生しました", {
      message,
    });

    await interaction.editReply({
      content: `取得に失敗しました: ${message}`,
    });
  }
};

export const esclFromParentXlsxCommand: SlashCommandModule = {
  data,
  execute,
};
