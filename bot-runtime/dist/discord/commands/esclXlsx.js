"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.esclFromParentXlsxCommand = void 0;
const discord_js_1 = require("discord.js");
const esclCli_1 = require("../../utils/esclCli");
const logger_1 = require("../../utils/logger");
const data = new discord_js_1.SlashCommandBuilder();
data
    .setName("escl_from_parent_xlsx")
    .setDescription("グループURLからExcelを生成します（GAME1..6 / ALL_GAMES / TEAM_TOTALS）");
data.addStringOption((option) => option
    .setName("parent_url")
    .setDescription("ESCLグループページのURL（/scrims/<scrim>/<group>）")
    .setRequired(true));
data.addStringOption((option) => option
    .setName("group")
    .setDescription("任意のグループ名（例: G5, G8）")
    .setRequired(false));
const execute = async (interaction, _context) => {
    const parentUrl = interaction.options.getString("parent_url", true);
    const group = interaction.options.getString("group");
    await interaction.deferReply();
    try {
        const result = await (0, esclCli_1.runEsclXlsx)(parentUrl, group);
        const file = new discord_js_1.AttachmentBuilder(result.buffer, {
            name: result.filename,
        });
        await interaction.editReply({
            content: "Excelを生成しました。（ALL_GAMES=生データ / TEAM_TOTALS=チーム合計）",
            files: [file],
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("escl_from_parent_xlsx コマンドでエラーが発生しました", {
            message,
        });
        await interaction.editReply({
            content: `取得に失敗しました: ${message}`,
        });
    }
};
exports.esclFromParentXlsxCommand = {
    data,
    execute,
};
//# sourceMappingURL=esclXlsx.js.map