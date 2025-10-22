import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import type { BotConfig } from "../../config";
import type { EsclEnvironment } from "../../escl/environment";
import type { AuditLogger } from "../auditLogger";
import type { VerifyManager } from "../verify/manager";
import type { RolesPanelManager } from "../roles/manager";
import type { IntroduceManager } from "../introduce/manager";

export type CommandExecuteContext = {
  config: BotConfig;
  client: Client;
  auditLogger: AuditLogger;
  verifyManager: VerifyManager;
  rolesManager: RolesPanelManager;
  introduceManager: IntroduceManager;
  escl: EsclEnvironment;
};

export type SlashCommandModule = {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    context: CommandExecuteContext
  ) => Promise<void>;
  autocomplete?: (
    interaction: AutocompleteInteraction,
    context: CommandExecuteContext
  ) => Promise<void>;
};
