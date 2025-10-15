import { ButtonInteraction, Client, GuildMember } from "discord.js";
import type { BotConfig } from "../../config";
import { AuditLogger } from "../auditLogger";
export declare class OnboardingManager {
    private readonly client;
    private readonly auditLogger;
    private config;
    constructor(client: Client, auditLogger: AuditLogger, config: BotConfig);
    updateConfig(config: BotConfig): void;
    handleMemberJoin(member: GuildMember): Promise<void>;
    handleInteraction(interaction: ButtonInteraction): Promise<void>;
    private computeMemberIndex;
    private sendDirectMessage;
    private createFallbackThread;
    private buildThreadName;
    private isGuildTextChannel;
}
//# sourceMappingURL=manager.d.ts.map