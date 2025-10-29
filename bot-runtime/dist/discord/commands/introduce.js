"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.introduceCommand = void 0;
const discord_js_1 = require("discord.js");
const data = new discord_js_1.SlashCommandBuilder()
    .setName("introduce")
    .setDescription("自己紹介を投稿します")
    .setDMPermission(false)
    .addAttachmentOption((option) => option
    .setName("image")
    .setDescription("自己紹介に使用する画像 (任意)")
    .setRequired(false));
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB 制限
const execute = async (interaction, context) => {
    if (!interaction.guild) {
        await interaction.reply({
            content: "ギルド内でのみ使用できます。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const imageAttachment = interaction.options.getAttachment("image") ?? null;
    if (imageAttachment) {
        const contentType = imageAttachment.contentType ?? "";
        if (!contentType.startsWith("image/")) {
            await interaction.reply({
                content: "画像ファイルを指定してください。（PNG / JPEG / GIF / WebP 等）",
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (imageAttachment.size > MAX_IMAGE_SIZE_BYTES) {
            await interaction.reply({
                content: "画像ファイルのサイズが大きすぎます。（最大 8MB まで）",
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            return;
        }
    }
    const modalOptions = imageAttachment ? { imageAttachment } : undefined;
    await context.introduceManager.openModal(interaction, modalOptions);
};
exports.introduceCommand = {
    data,
    execute,
};
//# sourceMappingURL=introduce.js.map