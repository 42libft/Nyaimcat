"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordRuntime = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../utils/logger");
const index_1 = require("./commands/index");
const auditLogger_1 = require("./auditLogger");
const manager_1 = require("./onboarding/manager");
const manager_2 = require("./verify/manager");
const manager_3 = require("./roles/manager");
const manager_4 = require("./introduce/manager");
const buildIntentList = () => [
    discord_js_1.GatewayIntentBits.Guilds,
    discord_js_1.GatewayIntentBits.GuildMembers,
    discord_js_1.GatewayIntentBits.GuildMessages,
    discord_js_1.GatewayIntentBits.GuildMessageReactions,
];
const PARTIALS = [
    discord_js_1.Partials.Message,
    discord_js_1.Partials.Channel,
    discord_js_1.Partials.Reaction,
    discord_js_1.Partials.GuildMember,
];
class DiscordRuntime {
    constructor(options) {
        this.token = options.token;
        this.clientId = options.clientId;
        this.guildId = options.guildId;
        this.config = options.config;
        this.client = new discord_js_1.Client({
            intents: buildIntentList(),
            partials: PARTIALS,
        });
        this.rest = new discord_js_1.REST({ version: "10" }).setToken(this.token);
        this.commands = (0, index_1.buildCommandCollection)();
        this.auditLogger = new auditLogger_1.AuditLogger(this.client, this.config);
        this.onboarding = new manager_1.OnboardingManager(this.client, this.auditLogger, this.config);
        this.verifyManager = new manager_2.VerifyManager(this.client, this.auditLogger, this.config);
        this.rolesManager = new manager_3.RolesPanelManager(this.client, this.auditLogger, this.config);
        this.introduceManager = new manager_4.IntroduceManager(this.auditLogger, this.config);
    }
    async start() {
        await this.registerSlashCommands();
        this.registerEventHandlers();
        await this.client.login(this.token);
        await this.auditLogger.log({
            action: "bot.startup",
            status: "success",
            description: "Botプロセスが正常に起動しました",
            details: {
                clientId: this.clientId,
                guildId: this.guildId ?? null,
            },
        });
    }
    applyConfigUpdate(config, context) {
        this.config = config;
        this.auditLogger.updateConfig(config);
        this.onboarding.updateConfig(config);
        this.verifyManager.updateConfig(config);
        this.rolesManager.updateConfig(config);
        this.introduceManager.updateConfig(config);
        logger_1.logger.debug("DiscordRuntime 設定を更新しました", {
            changedSections: context?.changedSections ?? [],
            hash: context?.hash,
        });
        void this.auditLogger.log({
            action: "config.update",
            status: "info",
            details: {
                changedSections: context?.changedSections ?? [],
                hash: context?.hash ?? null,
            },
        });
    }
    getClient() {
        return this.client;
    }
    registerEventHandlers() {
        this.client.on("ready", () => {
            if (!this.client.user) {
                return;
            }
            logger_1.logger.info("Discord クライアントが起動しました", {
                user: this.client.user.tag,
                id: this.client.user.id,
            });
            void this.auditLogger.log({
                action: "client.ready",
                status: "success",
                details: {
                    userTag: this.client.user.tag,
                    userId: this.client.user.id,
                },
            });
        });
        this.client.on("guildMemberAdd", (member) => {
            logger_1.logger.info("新規メンバーを検知しました", {
                memberId: member.id,
                guildId: member.guild.id,
            });
            void this.auditLogger.log({
                action: "member.join",
                status: "info",
                details: {
                    memberId: member.id,
                    guildId: member.guild.id,
                },
            });
            void this.onboarding.handleMemberJoin(member).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error("オンボーディング処理中に予期しないエラーが発生しました", {
                    memberId: member.id,
                    message,
                });
            });
        });
        this.client.on("guildMemberRemove", async (member) => {
            const guildId = "guild" in member && member.guild
                ? member.guild.id
                : this.config.guild.id;
            logger_1.logger.info("メンバー退会を検知しました", {
                memberId: member.id,
                guildId,
            });
            let hadVerifyRole = false;
            try {
                hadVerifyRole = await this.verifyManager.handleMemberRemove(member);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("Verify退会処理でエラーが発生しました", {
                    memberId: member.id,
                    message,
                });
            }
            void this.auditLogger.log({
                action: "member.leave",
                status: "info",
                details: {
                    memberId: member.id,
                    guildId,
                    hadVerifyRole,
                },
            });
        });
        this.client.on("guildMemberUpdate", async (oldMember, newMember) => {
            try {
                const revoked = await this.verifyManager.handleMemberUpdate(oldMember, newMember);
                if (revoked) {
                    logger_1.logger.info("Verifyロールが剥奪されました", {
                        memberId: newMember.id,
                        guildId: newMember.guild.id,
                    });
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("Verifyロール剥奪監査でエラーが発生しました", {
                    memberId: newMember.id,
                    message,
                });
            }
        });
        this.client.on("messageReactionAdd", async (reaction, user) => {
            try {
                await this.verifyManager.handleReactionAdd(reaction, user);
                await this.rolesManager.handleReactionAdd(reaction, user);
                const fullReaction = reaction.partial
                    ? await reaction.fetch()
                    : reaction;
                const fullUser = user.partial ? await user.fetch() : user;
                logger_1.logger.debug("リアクション追加イベント", {
                    emoji: fullReaction.emoji.toString(),
                    messageId: fullReaction.message.id,
                    userId: fullUser.id,
                });
                void this.auditLogger.log({
                    action: "reaction.add",
                    status: "info",
                    details: {
                        emoji: fullReaction.emoji.toString(),
                        messageId: fullReaction.message.id,
                        userId: fullUser.id,
                    },
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("リアクション情報の取得に失敗しました", { message });
            }
        });
        this.client.on("messageReactionRemove", async (reaction, user) => {
            try {
                await this.rolesManager.handleReactionRemove(reaction, user);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.warn("リアクション削除処理でエラーが発生しました", { message });
            }
        });
        this.client.on("interactionCreate", async (interaction) => {
            if (interaction.isButton()) {
                await this.onboarding.handleInteraction(interaction);
                await this.verifyManager.handleButton(interaction);
                await this.rolesManager.handleButton(interaction);
                return;
            }
            if (interaction.isStringSelectMenu()) {
                await this.rolesManager.handleSelect(interaction);
                return;
            }
            if (interaction.isModalSubmit()) {
                await this.introduceManager.handleModalSubmit(interaction);
                return;
            }
            if (!interaction.isChatInputCommand()) {
                return;
            }
            await this.handleChatCommand(interaction);
        });
    }
    async registerSlashCommands() {
        const commandsPayload = index_1.commandModules.map((command) => command.data.toJSON());
        try {
            if (this.guildId) {
                await this.rest.put(discord_js_1.Routes.applicationGuildCommands(this.clientId, this.guildId), { body: commandsPayload });
                logger_1.logger.info("ギルド向けSlash Commandを同期しました", {
                    commandCount: commandsPayload.length,
                    guildId: this.guildId,
                });
            }
            else {
                await this.rest.put(discord_js_1.Routes.applicationCommands(this.clientId), {
                    body: commandsPayload,
                });
                logger_1.logger.info("グローバルSlash Commandを同期しました", {
                    commandCount: commandsPayload.length,
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Slash Command登録に失敗しました", { message });
            throw error;
        }
    }
    async handleChatCommand(interaction) {
        const command = this.commands.get(interaction.commandName);
        if (!command) {
            logger_1.logger.warn("未登録のSlash Commandが呼び出されました", {
                name: interaction.commandName,
            });
            await interaction.reply({
                content: "このコマンドは現在利用できません。",
                ephemeral: true,
            });
            return;
        }
        try {
            await command.execute(interaction, {
                config: this.config,
                client: this.client,
                auditLogger: this.auditLogger,
                verifyManager: this.verifyManager,
                rolesManager: this.rolesManager,
                introduceManager: this.introduceManager,
            });
            await this.auditLogger.log({
                action: "command.execute",
                status: "success",
                details: {
                    command: command.data.name,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Slash Command実行中にエラーが発生しました", {
                name: command.data.name,
                message,
            });
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({
                        content: "コマンド実行中にエラーが発生しました。",
                        ephemeral: true,
                    });
                }
                else if (interaction.isRepliable()) {
                    await interaction.reply({
                        content: "コマンド実行中にエラーが発生しました。",
                        ephemeral: true,
                    });
                }
            }
            catch (responseError) {
                const responseMessage = responseError instanceof Error ? responseError.message : String(responseError);
                logger_1.logger.warn("エラー通知の送信に失敗しました", {
                    name: command.data.name,
                    message: responseMessage,
                });
            }
            await this.auditLogger.log({
                action: "command.execute",
                status: "failure",
                description: message,
                details: {
                    command: command.data.name,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                },
            });
        }
    }
}
exports.DiscordRuntime = DiscordRuntime;
//# sourceMappingURL=client.js.map