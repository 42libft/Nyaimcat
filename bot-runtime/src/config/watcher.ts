import { createHash } from "crypto";

import { logger } from "../utils/logger";
import { computeChangedSections } from "../utils/diff";
import { BotConfig } from "./schema";
import { loadConfig } from "./loader";

export type ConfigUpdatePayload = {
  config: BotConfig;
  previous: BotConfig;
  changedSections: string[];
  hash: string;
};

export type ConfigWatcherOptions = {
  path?: string;
  intervalMs?: number;
};

export type ConfigWatcherEvent = {
  onUpdate: (payload: ConfigUpdatePayload) => void;
  onError: (error: Error) => void;
};

const DEFAULT_INTERVAL = 60_000;

const hashConfig = (config: BotConfig) =>
  createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex");

export class ConfigWatcher {
  private readonly path: string | undefined;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private currentConfig: BotConfig;
  private currentHash: string;
  private readonly updateListeners = new Set<ConfigWatcherEvent["onUpdate"]>();
  private readonly errorListeners = new Set<ConfigWatcherEvent["onError"]>();

  constructor(initialConfig: BotConfig, options: ConfigWatcherOptions = {}) {
    this.path = options.path;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL;
    this.currentConfig = initialConfig;
    this.currentHash = hashConfig(initialConfig);
  }

  start() {
    if (this.timer) {
      return;
    }

    logger.info("設定ホットリロード監視を開始します", {
      intervalMs: this.intervalMs,
      path: this.path,
    });

    this.timer = setInterval(() => {
      void this.refresh();
    }, this.intervalMs);
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
    logger.info("設定ホットリロード監視を停止しました");
  }

  onUpdate(listener: ConfigWatcherEvent["onUpdate"]) {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onError(listener: ConfigWatcherEvent["onError"]) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  getCurrentConfig(): BotConfig {
    return this.currentConfig;
  }

  private async refresh() {
    const result = await loadConfig(this.path);

    if (!result.ok) {
      const error = new Error(result.message);
      logger.warn("設定の再読み込みに失敗しました。前回の設定を維持します", {
        path: result.path,
      });
      this.emitError(error);
      return;
    }

    const nextConfig = result.config;
    const nextHash = hashConfig(nextConfig);

    if (nextHash === this.currentHash) {
      logger.debug("設定ファイルに変更はありません");
      return;
    }

    const previous = this.currentConfig;
    this.currentConfig = nextConfig;
    this.currentHash = nextHash;

    const changedSections = computeChangedSections(previous, nextConfig);

    logger.info("設定ファイルの変更を検知し、反映しました", {
      changedSections,
    });

    this.emitUpdate({
      config: nextConfig,
      previous,
      changedSections,
      hash: nextHash,
    });
  }

  private emitUpdate(payload: ConfigUpdatePayload) {
    for (const listener of this.updateListeners) {
      try {
        listener(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("設定更新リスナーの実行中に例外が発生しました", {
          message,
        });
      }
    }
  }

  private emitError(error: Error) {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        const message =
          listenerError instanceof Error
            ? listenerError.message
            : String(listenerError);
        logger.error("設定エラー通知リスナーで例外が発生しました", {
          message,
        });
      }
    }
  }
}
