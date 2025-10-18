import { type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import type { AuditLogger } from "../auditLogger";
export declare class CodexFollowUpManager {
    private readonly auditLogger;
    constructor(auditLogger: AuditLogger);
    handleButton(interaction: ButtonInteraction): Promise<boolean>;
    handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean>;
    private resolveRunContext;
    private createFollowUpTaskFile;
}
//# sourceMappingURL=followUpManager.d.ts.map