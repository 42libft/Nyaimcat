"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDmFallbackMessage = exports.formatDmMessage = exports.createRolesJumpResponse = exports.buildWelcomeMessage = exports.WELCOME_ROLES_BUTTON_ID = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../utils/logger");
const templateHelpers_1 = require("./templateHelpers");
const welcomeCard_1 = require("./welcomeCard");
exports.WELCOME_ROLES_BUTTON_ID = "onboarding:roles_jump";
const DEFAULT_MESSAGE_TEMPLATE = "{{mention}}";
const DEFAULT_EMBED_TITLE = "ようこそ、{{username}} さん！";
const DEFAULT_EMBED_DESCRIPTION = "Nyaimlabへようこそ！\nあなたは **#{{member_index}}** 人目のメンバーです。";
const buildDefaultDescription = (values) => {
    const lines = [
        "Nyaimlabへようこそ！",
        `あなたは **#${values["member_index"] ?? values["memberIndex"]}** 人目のメンバーです。`,
    ];
    if (values["roles_channel_mention"] ?? values.rolesChannelMention) {
        lines.push(`ロールの設定は ${values["roles_channel_mention"] ?? values.rolesChannelMention} から行えます。`);
    }
    if (values["guide_url"] ?? values.guideUrl) {
        lines.push(`サーバーガイドはこちら: ${values["guide_url"] ?? values.guideUrl}`);
    }
    return lines.join("\n");
};
const chunkButtons = (buttons) => {
    const rows = [];
    for (let index = 0; index < buttons.length; index += 5) {
        const slice = buttons.slice(index, index + 5);
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(...slice));
    }
    return rows;
};
const resolveCustomButtons = (welcomeConfig, guildId) => {
    const entries = welcomeConfig?.buttons ?? [];
    return entries
        .map((entry) => {
        const label = entry.label.trim();
        const value = entry.value.trim();
        if (!label || !value) {
            return null;
        }
        const button = new discord_js_1.ButtonBuilder().setLabel(label);
        if (entry.target === "url") {
            try {
                // Throws if URL is invalid
                const url = new URL(value);
                button.setStyle(discord_js_1.ButtonStyle.Link).setURL(url.toString());
                return button;
            }
            catch (error) {
                if (/^\d+$/.test(value)) {
                    const channelUrl = `https://discord.com/channels/${guildId}/${value}`;
                    button.setStyle(discord_js_1.ButtonStyle.Link).setURL(channelUrl);
                    logger_1.logger.warn("URL ボタンにチャンネルと思われる値が指定されたため、チャンネルへのリンクとして扱います", { label, value });
                    return button;
                }
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("無効なURLボタンのためスキップします", {
                    label,
                    value,
                    message,
                });
                return null;
            }
        }
        if (!/^\d+$/.test(value)) {
            logger_1.logger.warn("チャンネルボタンの値が数値ではないためスキップします", {
                label,
                value,
            });
            return null;
        }
        const channelUrl = `https://discord.com/channels/${guildId}/${value}`;
        button.setStyle(discord_js_1.ButtonStyle.Link).setURL(channelUrl);
        return button;
    })
        .filter((button) => Boolean(button));
};
const buildButtons = (config, member) => {
    const buttons = [];
    buttons.push(...resolveCustomButtons(config.welcome, member.guild.id));
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
    return chunkButtons(buttons);
};
const resolveMessageContent = (welcomeConfig, values) => {
    const template = welcomeConfig?.message_template?.trim() || DEFAULT_MESSAGE_TEMPLATE;
    const resolved = (0, templateHelpers_1.fillTemplate)(template, values).trim();
    return resolved.length > 0 ? resolved : undefined;
};
const resolveJoinTimezone = (config, welcomeConfig) => welcomeConfig?.join_timezone ?? config.onboarding.timezone ?? "Asia/Tokyo";
const buildEmbedMessage = (member, config, welcomeConfig, templateValues, content, memberIndex) => {
    const embed = new discord_js_1.EmbedBuilder().setColor(0x5865f2);
    const titleTemplate = welcomeConfig?.title_template?.trim() || DEFAULT_EMBED_TITLE;
    const title = (0, templateHelpers_1.fillTemplate)(titleTemplate, templateValues).trim();
    embed.setTitle(title || `ようこそ、${member.displayName ?? member.user.username} さん！`);
    const descriptionTemplate = welcomeConfig?.description_template?.trim() ||
        config.embeds.welcomeTemplate ||
        DEFAULT_EMBED_DESCRIPTION;
    const description = (0, templateHelpers_1.fillTemplate)(descriptionTemplate, templateValues).trim();
    embed.setDescription(description || buildDefaultDescription(templateValues));
    const timezone = resolveJoinTimezone(config, welcomeConfig);
    const joinFieldLabel = welcomeConfig?.join_field_label?.trim() || "加入日時";
    const formattedJoinDate = new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: timezone,
    }).format(member.joinedAt ?? new Date());
    embed.addFields({
        name: `${joinFieldLabel} (${timezone})`,
        value: formattedJoinDate,
    });
    const footerText = welcomeConfig?.footer_text?.trim() || member.guild.name || "Nyaimlab";
    embed.setFooter({ text: footerText });
    const avatarUrl = member.user.displayAvatarURL({ size: 256 });
    if (avatarUrl) {
        embed.setThumbnail(avatarUrl);
    }
    const message = {
        content,
        embeds: [embed],
    };
    const components = buildButtons(config, member);
    if (components) {
        message.components = components;
    }
    return message;
};
const buildCardMessage = async (member, config, cardConfig, templateValues, content) => {
    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 512 }) ||
        "https://cdn.discordapp.com/embed/avatars/0.png";
    const title = (0, templateHelpers_1.fillTemplate)(cardConfig.title_template, templateValues).trim();
    const subtitle = (0, templateHelpers_1.fillTemplate)(cardConfig.subtitle_template, templateValues).trim();
    const body = cardConfig.body_template
        ? (0, templateHelpers_1.fillTemplate)(cardConfig.body_template, templateValues).trim()
        : undefined;
    const buffer = await (0, welcomeCard_1.renderWelcomeCard)({
        cardConfig,
        avatarUrl,
        text: {
            title: title || (0, templateHelpers_1.fillTemplate)(DEFAULT_EMBED_TITLE, templateValues),
            subtitle: subtitle ||
                `Member #${templateValues["member_index"] ?? templateValues.memberIndex}`,
            body,
        },
    });
    const attachment = new discord_js_1.AttachmentBuilder(buffer, {
        name: `welcome-card-${member.id}.png`,
    });
    const message = {
        content,
        files: [attachment],
    };
    const components = buildButtons(config, member);
    if (components) {
        message.components = components;
    }
    return message;
};
const buildWelcomeMessage = async ({ member, config, memberIndex, }) => {
    const welcomeConfig = config.welcome;
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    const templateValues = (0, templateHelpers_1.createTemplateValues)({
        username: member.user.username ?? member.displayName,
        displayName: member.displayName,
        mention: member.toString(),
        guildName: member.guild.name,
        memberIndex,
        rolesChannelId,
        guideUrl: config.onboarding.guideUrl,
        staffRoleIds: config.roleAssignments?.staffRoleIds,
    });
    const content = resolveMessageContent(welcomeConfig, templateValues);
    const mode = welcomeConfig?.mode ?? "embed";
    if (mode === "card" && welcomeConfig?.card) {
        try {
            return await buildCardMessage(member, config, welcomeConfig.card, templateValues, content);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("歓迎カードの生成に失敗したため、Embed モードへフォールバックします", {
                error: message,
                memberId: member.id,
            });
        }
    }
    return buildEmbedMessage(member, config, welcomeConfig, templateValues, content, memberIndex);
};
exports.buildWelcomeMessage = buildWelcomeMessage;
const createRolesJumpResponse = (config) => {
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    if (!rolesChannelId) {
        return {
            content: "ロールチャンネルが設定されていません。運営にお問い合わせください。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        };
    }
    return {
        content: `ロールの設定はこちらをご確認ください → <#${rolesChannelId}>`,
        flags: discord_js_1.MessageFlags.Ephemeral,
    };
};
exports.createRolesJumpResponse = createRolesJumpResponse;
const formatDmMessage = (member, config, memberIndex) => {
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    const templateValues = (0, templateHelpers_1.createTemplateValues)({
        username: member.user.username ?? member.displayName,
        displayName: member.displayName,
        mention: member.toString(),
        guildName: member.guild.name,
        memberIndex,
        rolesChannelId,
        guideUrl: config.onboarding.guideUrl,
        staffRoleIds: config.roleAssignments?.staffRoleIds,
    });
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
    return (0, templateHelpers_1.fillTemplate)(template, templateValues);
};
exports.formatDmMessage = formatDmMessage;
const buildDmFallbackMessage = (member, config, memberIndex) => {
    const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
    const templateValues = (0, templateHelpers_1.createTemplateValues)({
        username: member.user.username ?? member.displayName,
        displayName: member.displayName,
        mention: member.toString(),
        guildName: member.guild.name,
        memberIndex,
        rolesChannelId,
        guideUrl: config.onboarding.guideUrl,
        staffRoleIds: config.roleAssignments?.staffRoleIds,
    });
    const defaultTemplate = templateValues.staffRoleMentions
        ? `{{username}} さんへのDMが送信できませんでした。{{staffRoleMentions}} の皆さん、代替案内をお願いします。`
        : `{{username}} さんへのDMが送信できませんでした。こちらのスレッドで案内を行ってください。`;
    const template = config.onboarding.dm.fallbackMessage ?? defaultTemplate;
    return (0, templateHelpers_1.fillTemplate)(template, templateValues);
};
exports.buildDmFallbackMessage = buildDmFallbackMessage;
//# sourceMappingURL=welcome.js.map