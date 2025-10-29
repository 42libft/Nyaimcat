"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionCommand = void 0;
const discord_js_1 = require("discord.js");
const esclCli_1 = require("../../utils/esclCli");
const logger_1 = require("../../utils/logger");
const package_json_1 = __importDefault(require("../../../package.json"));
const data = new discord_js_1.SlashCommandBuilder()
    .setName("version")
    .setDescription("稼働中のBotバージョンを表示します");
const runtimeVersion = package_json_1.default.version;
const execute = async (interaction, _context) => {
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    try {
        const pythonVersion = await (0, esclCli_1.runEsclVersion)();
        await interaction.editReply({
            content: [
                `ESCL Bot: ${pythonVersion}`,
                `Management Runtime: v${runtimeVersion}`,
            ].join("\n"),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("versionコマンドでエラーが発生しました", { message });
        await interaction.editReply({
            content: `バージョン情報の取得に失敗しました: ${message}`,
        });
    }
};
exports.versionCommand = {
    data,
    execute,
};
//# sourceMappingURL=version.js.map