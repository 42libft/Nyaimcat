"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.introduceCommand = void 0;
const discord_js_1 = require("discord.js");
const data = new discord_js_1.SlashCommandBuilder()
    .setName("introduce")
    .setDescription("自己紹介を投稿します")
    .setDMPermission(false);
const execute = async (interaction, context) => {
    if (!interaction.guild) {
        await interaction.reply({
            content: "ギルド内でのみ使用できます。",
            ephemeral: true,
        });
        return;
    }
    await context.introduceManager.openModal(interaction);
};
exports.introduceCommand = {
    data,
    execute,
};
//# sourceMappingURL=introduce.js.map