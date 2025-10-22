import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

import {
  ESCLApiError,
  ESCLAuthError,
  ESCLConfigError,
  ESCLNetworkError,
} from "../../escl/apiClient";
import { renderActiveScrims } from "../../escl/renderActiveScrims";
import { logger } from "../../utils/logger";
import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { buildAccountChoices } from "./esclAccount";

const data = new SlashCommandBuilder()
  .setName("list-active")
  .setDescription("受付中または近日の ESCL スクリム一覧を表示します。")
  .addStringOption((option) =>
    option
      .setName("account")
      .setDescription("使用する ESCL アカウント。省略時はデフォルト/レガシー")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .setDMPermission(false);

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  await interaction.deferReply({ ephemeral: true });

  const accountOption = interaction.options.getString("account", false);
  let apiClient = context.escl.apiClient;

  try {
    if (accountOption) {
      const manager = context.escl.accountManager;
      if (!manager) {
        await interaction.followUp({
          content:
            "アカウント機能が無効なため、特定のアカウントを指定できません。`ESCL_SECRET_KEY` を設定してください。",
          ephemeral: true,
        });
        return;
      }

      const account = await manager.getAccount(interaction.user.id, accountOption);
      if (!account) {
        await interaction.followUp({
          content: "指定されたアカウントが見つかりませんでした。",
          ephemeral: true,
        });
        return;
      }

      apiClient = context.escl.createApiClient(account.jwt);
    } else if (context.escl.accountManager) {
      const defaultAccount = await context.escl.accountManager.getDefaultAccount(
        interaction.user.id
      );
      if (defaultAccount) {
        apiClient = context.escl.createApiClient(defaultAccount.jwt);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("list-active コマンドでアカウントを解決できませんでした", {
      message,
      userId: interaction.user.id,
    });
    await interaction.followUp({
      content: "アカウント情報の取得に失敗しました。後ほど再度お試しください。",
      ephemeral: true,
    });
    return;
  }

  try {
    const response = await apiClient.listActiveScrims();

    if (response.statusCode !== 200) {
      await interaction.followUp({
        content: `ListActiveScrim が status=${response.statusCode} で失敗しました。\n${response.text}`,
        ephemeral: true,
      });
      return;
    }

    const message = renderActiveScrims(response.payload);
    await interaction.followUp({
      content: message,
      ephemeral: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof ESCLConfigError) {
      await interaction.followUp({
        content: "ESCL_JWT が設定されていません。.env を確認してください。",
        ephemeral: true,
      });
      return;
    }

    if (error instanceof ESCLAuthError) {
      await interaction.followUp({
        content: "ESCL API の認証に失敗しました。JWT を再設定してください。",
        ephemeral: true,
      });
      return;
    }

    if (error instanceof ESCLNetworkError) {
      await interaction.followUp({
        content: `ESCL API への接続に失敗しました: ${message}`,
        ephemeral: true,
      });
      return;
    }

    if (error instanceof ESCLApiError) {
      await interaction.followUp({
        content: `ESCL API 呼び出しで想定外のエラーが発生しました: ${message}`,
        ephemeral: true,
      });
      return;
    }

    logger.error("list-active コマンドで想定外のエラーが発生しました", {
      message,
    });

    await interaction.followUp({
      content: `想定外のエラーが発生しました: ${message}`,
      ephemeral: true,
    });
  }
};

export const listActiveCommand: SlashCommandModule = {
  data,
  execute,
  autocomplete: async (interaction: AutocompleteInteraction, context) => {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "account") {
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
      logger.error("list-active コマンドのアカウント補完に失敗しました", {
        message,
        userId: interaction.user.id,
      });
      await interaction.respond([]);
    }
  },
};
