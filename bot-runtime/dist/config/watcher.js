"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigWatcher = void 0;
const crypto_1 = require("crypto");
const logger_1 = require("../utils/logger");
const diff_1 = require("../utils/diff");
const loader_1 = require("./loader");
const DEFAULT_INTERVAL = 60000;
const hashConfig = (config) => (0, crypto_1.createHash)("sha256")
    .update(JSON.stringify(config))
    .digest("hex");
class ConfigWatcher {
    constructor(initialConfig, options = {}) {
        this.updateListeners = new Set();
        this.errorListeners = new Set();
        this.path = options.path;
        this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL;
        this.currentConfig = initialConfig;
        this.currentHash = hashConfig(initialConfig);
    }
    start() {
        if (this.timer) {
            return;
        }
        logger_1.logger.info("設定ホットリロード監視を開始します", {
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
        logger_1.logger.info("設定ホットリロード監視を停止しました");
    }
    onUpdate(listener) {
        this.updateListeners.add(listener);
        return () => this.updateListeners.delete(listener);
    }
    onError(listener) {
        this.errorListeners.add(listener);
        return () => this.errorListeners.delete(listener);
    }
    getCurrentConfig() {
        return this.currentConfig;
    }
    async refresh() {
        const result = await (0, loader_1.loadConfig)(this.path, { logSuccess: false });
        if (!result.ok) {
            const error = new Error(result.message);
            logger_1.logger.warn("設定の再読み込みに失敗しました。前回の設定を維持します", {
                path: result.path,
            });
            this.emitError(error);
            return;
        }
        const nextConfig = result.config;
        const nextHash = hashConfig(nextConfig);
        if (nextHash === this.currentHash) {
            logger_1.logger.debug("設定ファイルに変更はありません");
            return;
        }
        const previous = this.currentConfig;
        this.currentConfig = nextConfig;
        this.currentHash = nextHash;
        const changedSections = (0, diff_1.computeChangedSections)(previous, nextConfig);
        logger_1.logger.info("設定ファイルの変更を検知し、反映しました", {
            changedSections,
        });
        this.emitUpdate({
            config: nextConfig,
            previous,
            changedSections,
            hash: nextHash,
        });
    }
    emitUpdate(payload) {
        for (const listener of this.updateListeners) {
            try {
                listener(payload);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error("設定更新リスナーの実行中に例外が発生しました", {
                    message,
                });
            }
        }
    }
    emitError(error) {
        for (const listener of this.errorListeners) {
            try {
                listener(error);
            }
            catch (listenerError) {
                const message = listenerError instanceof Error
                    ? listenerError.message
                    : String(listenerError);
                logger_1.logger.error("設定エラー通知リスナーで例外が発生しました", {
                    message,
                });
            }
        }
    }
}
exports.ConfigWatcher = ConfigWatcher;
//# sourceMappingURL=watcher.js.map