"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const client_1 = require("./discord/client");
const checks_1 = require("./health/checks");
const alerts_1 = require("./health/alerts");
const rehydrate_1 = require("./health/rehydrate");
const loadEnvFiles = () => {
    const candidates = [
        path_1.default.resolve(process.cwd(), ".env"),
        path_1.default.resolve(__dirname, "..", ".env"),
        path_1.default.resolve(__dirname, "..", "..", ".env"),
    ];
    const loaded = [];
    for (const candidate of candidates) {
        if (!(0, fs_1.existsSync)(candidate)) {
            continue;
        }
        const result = dotenv_1.default.config({ path: candidate, override: false });
        if (!result.error) {
            loaded.push(candidate);
        }
    }
    if (loaded.length === 0) {
        const fallback = dotenv_1.default.config();
        if (!fallback.error) {
            loaded.push(path_1.default.resolve(process.cwd(), ".env"));
        }
    }
    return loaded;
};
const loadedEnvPaths = loadEnvFiles();
if (loadedEnvPaths.length > 0) {
    logger_1.logger.debug("環境変数ファイルを読み込みました", {
        paths: loadedEnvPaths,
    });
}
logger_1.logger.info("Codex CLI 実行設定を読み込みました", {
    sandboxArgs: process.env.CODEX_CLI_ARGS ?? "(未設定)",
    blockedFlags: process.env.CODEX_CLI_BLOCKED_FLAGS ?? "(未設定)",
});
const bootstrap = async () => {
    logger_1.logger.info("Bot ランタイムの起動を開始します");
    const configPath = process.env.BOT_CONFIG_PATH;
    const configResult = await (0, config_1.loadConfig)(configPath);
    if (!configResult.ok) {
        logger_1.logger.error("初期設定の読み込みに失敗したため、プロセスを終了します", {
            path: configResult.path,
            error: configResult.message,
        });
        process.exitCode = 1;
        return;
    }
    let activeConfig = configResult.config;
    logger_1.logger.info("初期設定の読み込みが完了しました", {
        guild: activeConfig.guild,
        channels: activeConfig.channels,
        features: activeConfig.features,
    });
    await (0, rehydrate_1.rehydrateHealthRegistryFromHistory)();
    (0, alerts_1.initializeHealthAlerts)();
    (0, checks_1.evaluateAuditLogChannel)(activeConfig);
    (0, checks_1.evaluateCodexNotificationSettings)();
    (0, checks_1.evaluateDiscordActionsHealth)();
    const intervalMs = Number(process.env.BOT_CONFIG_POLL_INTERVAL_MS ?? "60000");
    const watcher = new config_1.ConfigWatcher(activeConfig, {
        path: configResult.path,
        intervalMs: Number.isFinite(intervalMs) ? intervalMs : 60000,
    });
    watcher.onUpdate(({ config, changedSections, hash }) => {
        activeConfig = config;
        (0, checks_1.evaluateAuditLogChannel)(config);
        (0, checks_1.evaluateCodexNotificationSettings)();
        (0, checks_1.evaluateDiscordActionsHealth)();
        logger_1.logger.info("設定ホットリロードを適用しました", {
            changedSections,
            hash,
        });
    });
    watcher.onError((error) => {
        logger_1.logger.warn("設定ホットリロード処理でエラーが発生しました", {
            error: error.message,
        });
    });
    watcher.start();
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;
    const disableCommandSync = process.env.DISABLE_COMMAND_SYNC;
    if (!token || !clientId) {
        logger_1.logger.error("DISCORD_TOKEN と DISCORD_CLIENT_ID は必須です。設定を確認してください。");
        process.exitCode = 1;
        return;
    }
    const syncCommands = !(disableCommandSync &&
        ["1", "true", "yes", "on"].includes(disableCommandSync.toLowerCase()));
    const runtimeOptions = {
        token,
        clientId,
        config: activeConfig,
        syncCommands,
    };
    const discordRuntime = new client_1.DiscordRuntime(guildId && guildId.length > 0
        ? { ...runtimeOptions, guildId }
        : runtimeOptions);
    watcher.onUpdate(({ config, changedSections, hash }) => {
        discordRuntime.applyConfigUpdate(config, { changedSections, hash });
    });
    try {
        await discordRuntime.start();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Discord クライアントの起動に失敗しました", { message });
        process.exitCode = 1;
        return;
    }
};
void bootstrap();
//# sourceMappingURL=index.js.map