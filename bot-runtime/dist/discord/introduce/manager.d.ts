import { ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import type { BotConfig } from "../../config";
import type { AuditLogger } from "../auditLogger";
declare const INTRODUCE_MODAL_ID = "introduce:submit";
export declare class IntroduceManager {
    private readonly auditLogger;
    private config;
    constructor(auditLogger: AuditLogger, config: BotConfig);
    updateConfig(config: BotConfig): void;
    openModal(interaction: ChatInputCommandInteraction): Promise<void>;
    handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void>;
    private getIntroduceConfig;
    private getSchema;
    private buildModal;
    private collectSubmissionValues;
    private buildEmbed;
    private safeErrorReply;
    private buildMessageContent;
}
export { INTRODUCE_MODAL_ID };
//# sourceMappingURL=manager.d.ts.map