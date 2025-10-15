import dotenv from "dotenv";

import { ConfigWatcher, loadConfig } from "./config";
import { logger } from "./utils/logger";
import { DiscordRuntime, type DiscordClientOptions } from "./discord/client";

dotenv.config();

const bootstrap = async () => {
  logger.info("Bot ランタイムの起動を開始します");

  const configPath = process.env.BOT_CONFIG_PATH;
  const configResult = await loadConfig(configPath);

  if (!configResult.ok) {
    logger.error("初期設定の読み込みに失敗したため、プロセスを終了します", {
      path: configResult.path,
      error: configResult.message,
    });
    process.exitCode = 1;
    return;
  }

  let activeConfig = configResult.config;

  logger.info("初期設定の読み込みが完了しました", {
    guild: activeConfig.guild,
    channels: activeConfig.channels,
    features: activeConfig.features,
  });

  const intervalMs = Number(process.env.BOT_CONFIG_POLL_INTERVAL_MS ?? "60000");

  const watcher = new ConfigWatcher(activeConfig, {
    path: configResult.path,
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : 60_000,
  });

  watcher.onUpdate(({ config, changedSections, hash }) => {
    activeConfig = config;
    logger.info("設定ホットリロードを適用しました", {
      changedSections,
      hash,
    });
  });

  watcher.onError((error) => {
    logger.warn("設定ホットリロード処理でエラーが発生しました", {
      error: error.message,
    });
  });

  watcher.start();

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    logger.error("DISCORD_TOKEN と DISCORD_CLIENT_ID は必須です。設定を確認してください。");
    process.exitCode = 1;
    return;
  }

  const runtimeOptions: Omit<DiscordClientOptions, "guildId"> = {
    token,
    clientId,
    config: activeConfig,
  };

  const discordRuntime = new DiscordRuntime(
    guildId && guildId.length > 0
      ? { ...runtimeOptions, guildId }
      : runtimeOptions
  );

  watcher.onUpdate(({ config, changedSections, hash }) => {
    discordRuntime.applyConfigUpdate(config, { changedSections, hash });
  });

  try {
    await discordRuntime.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Discord クライアントの起動に失敗しました", { message });
    process.exitCode = 1;
    return;
  }
};

void bootstrap();
