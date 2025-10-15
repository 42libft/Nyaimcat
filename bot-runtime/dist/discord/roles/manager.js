"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesPanelManager = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../utils/logger");
const ROLE_BUTTON_PREFIX = "roles:toggle:";
const ROLE_SELECT_ID = "roles:select";
const isTextChannel = (channel) => {
    if (!channel) {
        return false;
    }
    return (typeof channel === "object" &&
        channel !== null &&
        "isTextBased" in channel &&
        typeof channel.isTextBased === "function" &&
        channel.isTextBased());
};
const parseEmoji = (value) => {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const match = /^<a?:(\w+):(\d+)>$/.exec(trimmed);
    if (match) {
        const name = match[1];
        const id = match[2];
        return { raw: trimmed, name, id };
    }
    if (/^\d+$/.test(trimmed)) {
        return { raw: trimmed, id: trimmed };
    }
    return { raw: trimmed, name: trimmed };
};
const buildReactionIdentifier = (emoji) => {
    if (emoji.id && emoji.name) {
        return `${emoji.name}:${emoji.id}`;
    }
    if (emoji.id) {
        return emoji.id;
    }
    return emoji.raw;
};
const reactionMatches = (reaction, emoji) => {
    if (emoji.id) {
        return reaction.emoji.id === emoji.id;
    }
    return reaction.emoji.name === emoji.raw || reaction.emoji.toString() === emoji.raw;
};
class RolesPanelManager {
    constructor(client, auditLogger, config) {
        this.client = client;
        this.auditLogger = auditLogger;
        this.lastPublishedMessageId = null;
        this.config = config;
    }
    updateConfig(config) {
        this.config = config;
    }
    async publish(options) {
        const rolesConfig = this.getRolesConfig();
        if (!rolesConfig) {
            throw new Error("roles設定が存在しません");
        }
        const channelId = options.channelId ??
            rolesConfig.channel_id ??
            this.config.channels.rolesPanel ??
            null;
        if (!channelId) {
            throw new Error("ロールパネルの投稿先チャンネルが設定されていません");
        }
        const channel = await this.client.channels.fetch(channelId);
        if (!isTextChannel(channel)) {
            throw new Error("指定されたチャンネルにメッセージを投稿できません");
        }
        const payload = this.buildMessagePayload(rolesConfig);
        let created = true;
        let message = null;
        if (rolesConfig.message_id) {
            try {
                const existing = await channel.messages.fetch(rolesConfig.message_id);
                await existing.edit(payload);
                message = existing;
                created = false;
            }
            catch (error) {
                const messageText = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("ロールパネルの既存メッセージ更新に失敗しました", {
                    message: messageText,
                    messageId: rolesConfig.message_id,
                    channelId,
                });
            }
        }
        if (!message) {
            message = await channel.send(payload);
            created = true;
        }
        if (!message) {
            throw new Error("ロールパネルの投稿に失敗しました");
        }
        await this.syncReactionsIfNeeded(message, rolesConfig);
        this.lastPublishedMessageId = message.id;
        await this.auditLogger.log({
            action: "roles.post",
            status: "success",
            details: {
                channelId,
                messageId: message.id,
                style: rolesConfig.style,
                created,
                executorId: options.executorId,
            },
        });
        return { message, created };
    }
    async handleButton(interaction) {
        if (!interaction.customId.startsWith(ROLE_BUTTON_PREFIX)) {
            return;
        }
        const rolesConfig = this.getRolesConfig();
        if (!rolesConfig || rolesConfig.style !== "buttons") {
            await interaction.reply({
                content: "現在ボタン形式のロールパネルは有効化されていません。",
                ephemeral: true,
            });
            return;
        }
        if (!interaction.guild) {
            await interaction.reply({
                content: "ギルド内でのみ利用できます。",
                ephemeral: true,
            });
            return;
        }
        const roleId = interaction.customId.substring(ROLE_BUTTON_PREFIX.length);
        const role = this.getVisibleRoles(rolesConfig).find((entry) => entry.role_id === roleId);
        if (!role) {
            await interaction.reply({
                content: "指定されたロールは現在選択できません。",
                ephemeral: true,
            });
            return;
        }
        const member = interaction.member instanceof discord_js_1.GuildMember
            ? interaction.member
            : await interaction.guild.members.fetch(interaction.user.id);
        const hasRole = member.roles.cache.has(roleId);
        try {
            if (hasRole) {
                await this.updateMemberRole(member, roleId, false, {
                    trigger: "button",
                    executorId: interaction.user.id,
                });
                await interaction.reply({
                    content: `ロール <@&${roleId}> を外しました。`,
                    ephemeral: true,
                });
            }
            else {
                await this.updateMemberRole(member, roleId, true, {
                    trigger: "button",
                    executorId: interaction.user.id,
                });
                await interaction.reply({
                    content: `ロール <@&${roleId}> を付与しました。`,
                    ephemeral: true,
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await interaction.reply({
                content: `ロールの更新に失敗しました: ${message}`,
                ephemeral: true,
            });
        }
    }
    async handleSelect(interaction) {
        if (interaction.customId !== ROLE_SELECT_ID) {
            return;
        }
        const rolesConfig = this.getRolesConfig();
        if (!rolesConfig || rolesConfig.style !== "select") {
            await interaction.reply({
                content: "現在セレクト形式のロールパネルは有効化されていません。",
                ephemeral: true,
            });
            return;
        }
        if (!interaction.guild) {
            await interaction.reply({
                content: "ギルド内でのみ利用できます。",
                ephemeral: true,
            });
            return;
        }
        const member = interaction.member instanceof discord_js_1.GuildMember
            ? interaction.member
            : await interaction.guild.members.fetch(interaction.user.id);
        const desired = new Set(interaction.values);
        const visibleRoles = this.getVisibleRoles(rolesConfig);
        const add = [];
        const remove = [];
        for (const entry of visibleRoles) {
            const hasRole = member.roles.cache.has(entry.role_id);
            const shouldHave = desired.has(entry.role_id);
            if (shouldHave && !hasRole) {
                add.push(entry.role_id);
            }
            else if (!shouldHave && hasRole) {
                remove.push(entry.role_id);
            }
        }
        await interaction.deferReply({ ephemeral: true });
        const results = [];
        for (const roleId of add) {
            try {
                await this.updateMemberRole(member, roleId, true, {
                    trigger: "select",
                    executorId: interaction.user.id,
                });
                results.push(`付与: <@&${roleId}>`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                results.push(`付与失敗: <@&${roleId}> (${message})`);
            }
        }
        for (const roleId of remove) {
            try {
                await this.updateMemberRole(member, roleId, false, {
                    trigger: "select",
                    executorId: interaction.user.id,
                });
                results.push(`解除: <@&${roleId}>`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                results.push(`解除失敗: <@&${roleId}> (${message})`);
            }
        }
        if (results.length === 0) {
            results.push("ロールの変更はありませんでした。");
        }
        await interaction.editReply({
            content: results.join("\n"),
        });
    }
    async handleReactionAdd(reaction, user) {
        const rolesConfig = this.getRolesConfig();
        if (!rolesConfig || rolesConfig.style !== "reactions") {
            return;
        }
        if (user.id === this.client.user?.id) {
            return;
        }
        try {
            const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
            const fullUser = user.partial ? await user.fetch() : user;
            if (!this.matchesTargetMessage(fullReaction.message.id, rolesConfig)) {
                return;
            }
            const roleId = this.resolveRoleIdForReaction(fullReaction, rolesConfig);
            if (!roleId || !fullReaction.message.guild) {
                return;
            }
            const member = await fullReaction.message.guild.members.fetch(fullUser.id);
            await this.updateMemberRole(member, roleId, true, {
                trigger: "reaction",
                executorId: fullUser.id,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn("ロールリアクション処理でエラーが発生しました", { message });
        }
    }
    async handleReactionRemove(reaction, user) {
        const rolesConfig = this.getRolesConfig();
        if (!rolesConfig || rolesConfig.style !== "reactions") {
            return;
        }
        if (user.id === this.client.user?.id) {
            return;
        }
        try {
            const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
            const fullUser = user.partial ? await user.fetch() : user;
            if (!this.matchesTargetMessage(fullReaction.message.id, rolesConfig)) {
                return;
            }
            const roleId = this.resolveRoleIdForReaction(fullReaction, rolesConfig);
            if (!roleId || !fullReaction.message.guild) {
                return;
            }
            const member = await fullReaction.message.guild.members.fetch(fullUser.id);
            await this.updateMemberRole(member, roleId, false, {
                trigger: "reaction_remove",
                executorId: fullUser.id,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn("ロールリアクション解除処理でエラーが発生しました", { message });
        }
    }
    getRolesConfig() {
        return this.config.roles ?? null;
    }
    getVisibleRoles(config) {
        return config.roles
            .filter((role) => !role.hidden)
            .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    }
    buildMessagePayload(config) {
        const roles = this.getVisibleRoles(config);
        const header = config.message_content ??
            (config.style === "reactions"
                ? "リアクションで取得したいロールを選んでください。"
                : "希望するロールを選択してください。");
        const lines = [header];
        for (const entry of roles) {
            const emoji = parseEmoji(this.config.role_emoji_map?.[entry.role_id] ?? entry.emoji ?? undefined);
            const emojiText = emoji ? `${emoji.raw} ` : "";
            const description = entry.description ? ` — ${entry.description}` : "";
            lines.push(`${emojiText}<@&${entry.role_id}>${description}`);
        }
        const content = lines.join("\n");
        if (config.style === "buttons") {
            const rows = [];
            let currentRow = new discord_js_1.ActionRowBuilder();
            for (const entry of roles) {
                const button = new discord_js_1.ButtonBuilder()
                    .setCustomId(`${ROLE_BUTTON_PREFIX}${entry.role_id}`)
                    .setLabel(entry.label)
                    .setStyle(discord_js_1.ButtonStyle.Secondary);
                const emoji = parseEmoji(this.config.role_emoji_map?.[entry.role_id] ?? entry.emoji ?? undefined);
                if (emoji && emoji.raw) {
                    button.setEmoji(emoji.raw);
                }
                if (currentRow.components.length >= 5) {
                    rows.push(currentRow);
                    currentRow = new discord_js_1.ActionRowBuilder();
                }
                currentRow.addComponents(button);
            }
            if (currentRow.components.length > 0) {
                rows.push(currentRow);
            }
            return {
                content,
                components: rows,
            };
        }
        if (config.style === "select") {
            const menu = new discord_js_1.StringSelectMenuBuilder()
                .setCustomId(ROLE_SELECT_ID)
                .setPlaceholder("ロールを選択")
                .setMinValues(0)
                .setMaxValues(Math.min(roles.length, 25));
            for (const entry of roles) {
                const option = new discord_js_1.StringSelectMenuOptionBuilder()
                    .setLabel(entry.label)
                    .setValue(entry.role_id);
                if (entry.description) {
                    option.setDescription(entry.description.slice(0, 100));
                }
                const emoji = parseEmoji(this.config.role_emoji_map?.[entry.role_id] ?? entry.emoji ?? undefined);
                if (emoji) {
                    if (emoji.id) {
                        option.setEmoji(emoji.name
                            ? { id: emoji.id, name: emoji.name }
                            : { id: emoji.id });
                    }
                    else {
                        option.setEmoji({ name: emoji.raw });
                    }
                }
                menu.addOptions(option);
            }
            return {
                content,
                components: [
                    new discord_js_1.ActionRowBuilder().addComponents(menu),
                ],
            };
        }
        return {
            content,
            components: [],
        };
    }
    async syncReactionsIfNeeded(message, config) {
        if (config.style !== "reactions") {
            return;
        }
        const mapping = this.buildReactionMap(config);
        if (!mapping.size) {
            return;
        }
        for (const { emoji } of mapping.values()) {
            try {
                await message.react(buildReactionIdentifier(emoji));
            }
            catch (error) {
                const messageText = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("ロールパネルへのリアクション追加に失敗しました", {
                    message: messageText,
                    emoji: emoji.raw,
                    messageId: message.id,
                });
            }
        }
    }
    buildReactionMap(config) {
        const map = new Map();
        for (const entry of this.getVisibleRoles(config)) {
            const emoji = parseEmoji(this.config.role_emoji_map?.[entry.role_id] ?? entry.emoji ?? undefined);
            if (!emoji) {
                logger_1.logger.warn("リアクション用の絵文字が設定されていません", {
                    roleId: entry.role_id,
                    label: entry.label,
                });
                continue;
            }
            const key = emoji.id ?? emoji.raw;
            if (map.has(key)) {
                logger_1.logger.warn("重複するリアクション絵文字が検出されました", {
                    emoji: emoji.raw,
                    roleId: entry.role_id,
                });
                continue;
            }
            map.set(key, { roleId: entry.role_id, emoji });
        }
        return map;
    }
    matchesTargetMessage(messageId, config) {
        return ((config.message_id && config.message_id === messageId) ||
            (!!this.lastPublishedMessageId && this.lastPublishedMessageId === messageId));
    }
    resolveRoleIdForReaction(reaction, config) {
        const mapping = this.buildReactionMap(config);
        const match = Array.from(mapping.values()).find(({ emoji }) => reactionMatches(reaction, emoji));
        return match?.roleId ?? null;
    }
    async updateMemberRole(member, roleId, assign, context) {
        const alreadyHas = member.roles.cache.has(roleId);
        if (assign && alreadyHas) {
            return;
        }
        if (!assign && !alreadyHas) {
            return;
        }
        try {
            if (assign) {
                await member.roles.add(roleId, "Roles panel assignment");
            }
            else {
                await member.roles.remove(roleId, "Roles panel removal");
            }
            await this.auditLogger.log({
                action: "roles.update",
                status: "success",
                details: {
                    userId: member.id,
                    roleId,
                    action: assign ? "add" : "remove",
                    trigger: context.trigger,
                    executorId: context.executorId ?? null,
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.auditLogger.log({
                action: "roles.update",
                status: "failure",
                description: message,
                details: {
                    userId: member.id,
                    roleId,
                    action: assign ? "add" : "remove",
                    trigger: context.trigger,
                    executorId: context.executorId ?? null,
                },
            });
            throw error;
        }
    }
}
exports.RolesPanelManager = RolesPanelManager;
//# sourceMappingURL=manager.js.map