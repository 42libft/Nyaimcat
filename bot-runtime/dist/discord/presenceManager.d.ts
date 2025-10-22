import { type Client } from "discord.js";
export declare class PresenceManager {
    private readonly client;
    private unsubscribe;
    private started;
    constructor(client: Client);
    start(): void;
    stop(): void;
    refresh(): Promise<void>;
    private handleHealthChange;
    private buildPresence;
}
//# sourceMappingURL=presenceManager.d.ts.map