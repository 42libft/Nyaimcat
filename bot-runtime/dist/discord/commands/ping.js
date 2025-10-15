"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingCommand = void 0;
const discord_js_1 = require("discord.js");
const data = new discord_js_1.SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を確認します");
const execute = async (interaction, _context) => {
    await interaction.reply({
        content: `Pong! (latency ${Date.now() - interaction.createdTimestamp}ms)`,
        ephemeral: true,
    });
};
exports.pingCommand = {
    data,
    execute,
};
//# sourceMappingURL=ping.js.map