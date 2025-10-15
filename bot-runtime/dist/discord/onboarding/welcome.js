"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDmFallbackMessage = exports.formatDmMessage = exports.createRolesJumpResponse = exports.buildWelcomeMessage = exports.WELCOME_ROLES_BUTTON_ID = void 0;
const discord_js_1 = require("discord.js");
exports.WELCOME_ROLES_BUTTON_ID = "onboarding:roles_jump";
const fillTemplate = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const replacement = values[key];
    return typeof replacement === "string" ? replacement : match;
});
const buildStaffRoleMentions = (config) => {
    const staffRoles = config.roleAssignments?.staffRoleIds ?? [];
    if (!staffRoles.length) {
        return "";
    }
    return staffRoles.map((roleId) => `<@&${roleId}>`).join(" ");
};
const buildDefaultDescription = (values) => {
    const lines = [
        `Nyaimlabへようこそ！`,
        `あなたは **#${values.memberIndex}** 人目のメンバーです。`,
    ];
    if (values.rolesChannelMention) {
        lines.push(`ロールの設定は ${values.rolesChannelMention} から行えます。`);
    }
    if (values.guideUrl) {
        lines.push(`サーバーガイドはこちら: ${values.guideUrl}`);
    }
    return lines.join("\n");
};
const buildButtons = (config) => {
    const buttons = [];
    if (config.onboarding.guideUrl) {
        buttons.push(new discord_js_1.ButtonBuilder()
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setLabel(config.onboarding.guideLabel)
            .setURL(config.onboarding.guideUrl));
    }
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    if (rolesChannelId) {
        buttons.push(new discord_js_1.ButtonBuilder()
            .setStyle(discord_js_1.ButtonStyle.Primary)
            .setLabel(config.onboarding.rolesButtonLabel)
            .setCustomId(exports.WELCOME_ROLES_BUTTON_ID));
    }
    if (buttons.length === 0) {
        return undefined;
    }
    return [
        new discord_js_1.ActionRowBuilder().addComponents(...buttons),
    ];
};
const buildWelcomeMessage = ({ member, config, memberIndex, }) => {
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    const timezone = config.onboarding.timezone ?? "Asia/Tokyo";
    const templateValues = {
        username: member.displayName,
        mention: member.toString(),
        guildName: member.guild.name,
        memberIndex: memberIndex.toString(),
        rolesChannelMention: rolesChannelId ? `<#${rolesChannelId}>` : "",
        guideUrl: config.onboarding.guideUrl ?? "",
        staffRoleMentions: buildStaffRoleMentions(config),
    };
    const descriptionTemplate = config.embeds.welcomeTemplate;
    const description = descriptionTemplate
        ? fillTemplate(descriptionTemplate, templateValues)
        : buildDefaultDescription(templateValues);
    const formattedJoinDate = new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: timezone,
    }).format(member.joinedAt ?? new Date());
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`ようこそ、${member.displayName} さん！`)
        .setDescription(description)
        .addFields({
        name: `加入日時 (${timezone})`,
        value: formattedJoinDate,
    })
        .setFooter({ text: member.guild.name });
    const avatarUrl = member.user.displayAvatarURL({ size: 256 });
    if (avatarUrl) {
        embed.setThumbnail(avatarUrl);
    }
    const components = buildButtons(config);
    const message = {
        content: member.toString(),
        embeds: [embed],
    };
    if (components) {
        message.components = components;
    }
    return message;
};
exports.buildWelcomeMessage = buildWelcomeMessage;
const createRolesJumpResponse = (config) => {
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    if (!rolesChannelId) {
        return {
            content: "ロールチャンネルが設定されていません。運営にお問い合わせください。",
            ephemeral: true,
        };
    }
    return {
        content: `ロールの設定はこちらをご確認ください → <#${rolesChannelId}>`,
        ephemeral: true,
    };
};
exports.createRolesJumpResponse = createRolesJumpResponse;
const formatDmMessage = (member, config, memberIndex) => {
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    const templateValues = {
        username: member.displayName,
        mention: member.toString(),
        guildName: member.guild.name,
        memberIndex: memberIndex.toString(),
        rolesChannelMention: rolesChannelId ? `<#${rolesChannelId}>` : "",
        guideUrl: config.onboarding.guideUrl ?? "",
        staffRoleMentions: buildStaffRoleMentions(config),
    };
    const template = config.onboarding.dm.template ??
        `ようこそ、{{username}} さん！\n\n` +
            `参加ありがとうございます。まずはサーバーガイドを確認し、必要なロールを取得してください。\n` +
            (templateValues.guideUrl
                ? `ガイド: {{guideUrl}}\n`
                : "") +
            (templateValues.rolesChannelMention
                ? `ロール: {{rolesChannelMention}}\n`
                : "") +
            (templateValues.staffRoleMentions
                ? `困ったときは {{staffRoleMentions}} までご相談ください。\n`
                : "") +
            `分からないことがあれば運営までお気軽にどうぞ！`;
    return fillTemplate(template, templateValues);
};
exports.formatDmMessage = formatDmMessage;
const buildDmFallbackMessage = (member, config, memberIndex) => {
    const placeholders = {
        username: member.displayName,
        mention: member.toString(),
        guildName: member.guild.name,
        memberIndex: memberIndex.toString(),
        rolesChannelMention: config.onboarding.rolesChannelId
            ? `<#${config.onboarding.rolesChannelId}>`
            : "",
        guideUrl: config.onboarding.guideUrl ?? "",
        staffRoleMentions: buildStaffRoleMentions(config),
    };
    const defaultTemplate = placeholders.staffRoleMentions
        ? `{{username}} さんへのDMが送信できませんでした。{{staffRoleMentions}} の皆さん、代替案内をお願いします。`
        : `{{username}} さんへのDMが送信できませんでした。こちらのスレッドで案内を行ってください。`;
    const template = config.onboarding.dm.fallbackMessage ?? defaultTemplate;
    return fillTemplate(template, placeholders);
};
exports.buildDmFallbackMessage = buildDmFallbackMessage;
//# sourceMappingURL=welcome.js.map