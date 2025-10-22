import {
  ActionRowBuilder,
  ApplicationCommandOptionChoiceData,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  ModalBuilder,
  type ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { AccountManagerError } from "../../escl/accountManager";
import { logger } from "../../utils/logger";
import type { CommandExecuteContext, SlashCommandModule } from "./types";

const SUBCOMMAND_GROUP = "account";
const REGISTER_SUBCOMMAND = "register";
const LIST_SUBCOMMAND = "list";
const REMOVE_SUBCOMMAND = "remove";
const SET_DEFAULT_SUBCOMMAND = "set-default";

const ACCOUNT_OPTION_NAME = "account";

const REGISTER_MODAL_ID = "escl-account-register";
const LABEL_INPUT_ID = "account_label";
const TEAM_ID_INPUT_ID = "team_id";
const JWT_INPUT_ID = "jwt";

const MAX_AUTOCOMPLETE_CHOICES = 25;

const normalizeLabel = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildCommand = () =>
  new SlashCommandBuilder()
    .setName("escl")
    .setDescription("ESCL 関連の管理コマンド")
    .addSubcommandGroup((group) =>
      group
        .setName(SUBCOMMAND_GROUP)
        .setDescription("ESCL アカウント管理")
        .addSubcommand((sub) =>
          sub.setName(REGISTER_SUBCOMMAND).setDescription("ESCL アカウントを登録します。")
        )
        .addSubcommand((sub) =>
          sub.setName(LIST_SUBCOMMAND).setDescription("登録済みアカウントを一覧表示します。")
        )
        .addSubcommand((sub) =>
          sub
            .setName(REMOVE_SUBCOMMAND)
            .setDescription("指定した ESCL アカウントを削除します。")
            .addStringOption((option) =>
              option
                .setName(ACCOUNT_OPTION_NAME)
                .setDescription("削除するアカウント")
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(SET_DEFAULT_SUBCOMMAND)
            .setDescription("デフォルトで利用する ESCL アカウントを設定します。")
            .addStringOption((option) =>
              option
                .setName(ACCOUNT_OPTION_NAME)
                .setDescription("デフォルトに設定するアカウント")
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    )
    .setDMPermission(false);

const ensureAccountManager = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const manager = context.escl.accountManager;
  if (!manager) {
    await interaction.reply({
      content:
        "ESCL アカウント管理は現在無効です。`ESCL_SECRET_KEY` を設定し、Bot を再起動してください。",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return manager;
};

const ensureAccountManagerForModal = async (
  interaction: ModalSubmitInteraction,
  context: CommandExecuteContext
) => {
  const manager = context.escl.accountManager;
  if (!manager) {
    await interaction.reply({
      content:
        "ESCL アカウント管理は現在無効です。`ESCL_SECRET_KEY` を設定し、Bot を再起動してください。",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return manager;
};

const buildRegisterModal = () =>
  new ModalBuilder()
    .setCustomId(REGISTER_MODAL_ID)
    .setTitle("ESCL アカウント登録")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(LABEL_INPUT_ID)
          .setLabel("ラベル (任意)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(64)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(TEAM_ID_INPUT_ID)
          .setLabel("team_id")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(JWT_INPUT_ID)
          .setLabel("ESCL JWT")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

const buildAccountSummary = (
  label: string | null,
  accountId: string,
  teamId: number,
  status: string,
  isDefault: boolean
) => {
  const parts = [] as string[];
  if (isDefault) {
    parts.push("⭐");
  }
  if (label) {
    parts.push(`${label}`);
  }
  parts.push(`ID: ${accountId}`);
  parts.push(`team_id: ${teamId}`);
  parts.push(`status: ${status}`);
  return parts.join(" / ");
};

export const buildAccountChoices = async (
  context: CommandExecuteContext,
  userId: string,
  query: string
): Promise<ApplicationCommandOptionChoiceData<string>[]> => {
  const manager = context.escl.accountManager;
  if (!manager) {
    return [];
  }

  const { accounts } = await manager.listAccounts(userId);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = normalizedQuery
    ? accounts.filter((account) => {
        const label = account.label ?? "";
        return (
          label.toLowerCase().includes(normalizedQuery) ||
          account.accountId.toLowerCase().includes(normalizedQuery)
        );
      })
    : accounts;

  return filtered.slice(0, MAX_AUTOCOMPLETE_CHOICES).map((account) => ({
    name: buildAccountSummary(
      account.label,
      account.accountId,
      account.teamId,
      account.status,
      account.isDefault
    ),
    value: account.accountId,
  }));
};

const handleRegisterCommand = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const manager = await ensureAccountManager(interaction, context);
  if (!manager) {
    return;
  }

  try {
    await interaction.showModal(buildRegisterModal());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("ESCL アカウント登録モーダルの表示に失敗しました", { message });
    await interaction.reply({
      content: "モーダルの表示に失敗しました。後ほど再度お試しください。",
      flags: MessageFlags.Ephemeral,
    });
  }
};

const handleListCommand = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const manager = await ensureAccountManager(interaction, context);
  if (!manager) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { accounts } = await manager.listAccounts(interaction.user.id);

    if (accounts.length === 0) {
      await interaction.editReply({
        content: "登録済みの ESCL アカウントはありません。`/escl account register` を実行してください。",
      });
    } else {
      const lines = accounts.map((account) =>
        buildAccountSummary(
          account.label,
          account.accountId,
          account.teamId,
          account.status,
          account.isDefault
        )
      );

      await interaction.editReply({
        content: `登録済みアカウント (${accounts.length}件)\n` + lines.join("\n"),
      });
    }

    await context.auditLogger.log({
      action: "escl.account.list",
      status: "success",
      details: {
        userId: interaction.user.id,
        count: accounts.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("ESCL アカウント一覧の取得に失敗しました", { message });
    await interaction.editReply({
      content: "アカウント一覧の取得に失敗しました。後ほど再度お試しください。",
    });
    await context.auditLogger.log({
      action: "escl.account.list",
      status: "failure",
      description: message,
      details: {
        userId: interaction.user.id,
      },
    });
  }
};

const handleRemoveCommand = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const manager = await ensureAccountManager(interaction, context);
  if (!manager) {
    return;
  }

  const accountId = interaction.options.getString(ACCOUNT_OPTION_NAME, true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await manager.removeAccount({
      userId: interaction.user.id,
      accountId,
    });

    if (!result.removed) {
      await interaction.editReply({
        content: "指定されたアカウントが見つかりませんでした。",
      });
      await context.auditLogger.log({
        action: "escl.account.remove",
        status: "failure",
        description: "account not found",
        details: {
          userId: interaction.user.id,
          accountId,
        },
      });
      return;
    }

    await interaction.editReply({
      content: `アカウント \`${accountId}\` を削除しました。残り ${result.remainingAccounts} 件。`,
    });

    await context.auditLogger.log({
      action: "escl.account.remove",
      status: "success",
      details: {
        userId: interaction.user.id,
        accountId,
        remaining: result.remainingAccounts,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("ESCL アカウント削除に失敗しました", { message });
    await interaction.editReply({
      content: "アカウントの削除に失敗しました。後ほど再度お試しください。",
    });
    await context.auditLogger.log({
      action: "escl.account.remove",
      status: "failure",
      description: message,
      details: {
        userId: interaction.user.id,
        accountId,
      },
    });
  }
};

const handleSetDefaultCommand = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const manager = await ensureAccountManager(interaction, context);
  if (!manager) {
    return;
  }

  const accountId = interaction.options.getString(ACCOUNT_OPTION_NAME, true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await manager.setDefaultAccount({
      userId: interaction.user.id,
      accountId,
    });

    await interaction.editReply({
      content: `アカウント \`${accountId}\` をデフォルトに設定しました。`,
    });

    await context.auditLogger.log({
      action: "escl.account.set_default",
      status: "success",
      details: {
        userId: interaction.user.id,
        accountId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("ESCL アカウントのデフォルト設定に失敗しました", { message });
    await interaction.editReply({
      content: "デフォルト設定に失敗しました。後ほど再度お試しください。",
    });
    await context.auditLogger.log({
      action: "escl.account.set_default",
      status: "failure",
      description: message,
      details: {
        userId: interaction.user.id,
        accountId,
      },
    });
  }
};

const handleAccountCommand = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const subcommandGroup = interaction.options.getSubcommandGroup();
  if (subcommandGroup !== SUBCOMMAND_GROUP) {
    await interaction.reply({
      content: "不明なサブコマンドです。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case REGISTER_SUBCOMMAND:
      await handleRegisterCommand(interaction, context);
      break;
    case LIST_SUBCOMMAND:
      await handleListCommand(interaction, context);
      break;
    case REMOVE_SUBCOMMAND:
      await handleRemoveCommand(interaction, context);
      break;
    case SET_DEFAULT_SUBCOMMAND:
      await handleSetDefaultCommand(interaction, context);
      break;
    default:
      await interaction.reply({
        content: "不明なサブコマンドです。",
        flags: MessageFlags.Ephemeral,
      });
  }
};

export const esclAccountCommand: SlashCommandModule = {
  data: buildCommand(),
  execute: async (interaction: ChatInputCommandInteraction, context) => {
    await handleAccountCommand(interaction, context);
  },
  autocomplete: async (interaction: AutocompleteInteraction, context) => {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    if (subcommandGroup !== SUBCOMMAND_GROUP) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused(true);
    if (focused.name !== ACCOUNT_OPTION_NAME) {
      await interaction.respond([]);
      return;
    }

    try {
      const choices = await buildAccountChoices(
        context,
        interaction.user.id,
        focused.value
      );
      await interaction.respond(choices);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ESCL アカウントのオートコンプリートに失敗しました", {
        message,
      });
      await interaction.respond([]);
    }
  },
};

export const handleEsclAccountModalSubmit = async (
  interaction: ModalSubmitInteraction,
  context: CommandExecuteContext
): Promise<boolean> => {
  if (interaction.customId !== REGISTER_MODAL_ID) {
    return false;
  }

  const manager = await ensureAccountManagerForModal(interaction, context);
  if (!manager) {
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const labelRaw = interaction.fields.getTextInputValue(LABEL_INPUT_ID);
    const teamIdRaw = interaction.fields.getTextInputValue(TEAM_ID_INPUT_ID);
    const jwtRaw = interaction.fields.getTextInputValue(JWT_INPUT_ID);

    const teamId = Number(teamIdRaw.trim());
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new AccountManagerError("team_id は正の整数で指定してください。");
    }

    const label = normalizeLabel(labelRaw ?? "");
    const jwt = jwtRaw.trim();

    const result = await manager.registerAccount({
      userId: interaction.user.id,
      teamId,
      jwt,
      label,
    });

    await interaction.editReply({
      content:
        `アカウント \`${result.account.accountId}\` を登録しました。` +
        (result.isDefault ? " (デフォルトに設定済み)" : ""),
    });

    await context.auditLogger.log({
      action: "escl.account.register",
      status: "success",
      details: {
        userId: interaction.user.id,
        accountId: result.account.accountId,
        isDefault: result.isDefault,
        teamId,
        label: result.account.label,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("ESCL アカウント登録に失敗しました", { message });
    await interaction.editReply({
      content: `アカウント登録に失敗しました: ${message}`,
    });
    await context.auditLogger.log({
      action: "escl.account.register",
      status: "failure",
      description: message,
      details: {
        userId: interaction.user.id,
      },
    });
  }

  return true;
};
