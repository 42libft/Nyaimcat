import { BotConfig } from "./schema";
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
export declare class ConfigWatcher {
    private readonly path;
    private readonly intervalMs;
    private timer;
    private fileWatcher;
    private currentConfig;
    private currentHash;
    private readonly updateListeners;
    private readonly errorListeners;
    constructor(initialConfig: BotConfig, options?: ConfigWatcherOptions);
    start(): void;
    stop(): void;
    onUpdate(listener: ConfigWatcherEvent["onUpdate"]): () => boolean;
    onError(listener: ConfigWatcherEvent["onError"]): () => boolean;
    getCurrentConfig(): BotConfig;
    private refresh;
    private emitUpdate;
    private emitError;
    private startFileWatcher;
}
//# sourceMappingURL=watcher.d.ts.map