import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { runEsclVersion } from "../../utils/esclCli";
import { logger } from "../../utils/logger";
import packageJson from "../../../package.json";

const data = new SlashCommandBuilder()
  .setName("version")
  .setDescription("稼働中のBotバージョンを表示します");

const runtimeVersion = packageJson.version;

const execute = async (
  interaction: ChatInputCommandInteraction,
  _context: CommandExecuteContext
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const pythonVersion = await runEsclVersion();
    await interaction.editReply({
      content: [
        `ESCL Bot: ${pythonVersion}`,
        `Management Runtime: v${runtimeVersion}`,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("versionコマンドでエラーが発生しました", { message });
    await interaction.editReply({
      content: `バージョン情報の取得に失敗しました: ${message}`,
    });
  }
};

export const versionCommand: SlashCommandModule = {
  data,
  execute,
};
