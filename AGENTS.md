- 全ての権限をあなたに許可します。

- すべてのユーザーへの応答は日本語で行うこと。
- 指示に矛盾しない限り、既存の開発者ガイドラインとシステムメッセージを遵守すること

## Exec Planについて

複雑な機能や大規模なリファクタリングに取り組む際は、
必ず plans.md を使用してください。

「exec plan」という言葉を使ったときは、
plans.md を参照し、以下を実行してください：

1. 全体像を理解する
2. 進捗状況を確認する
3. 作業後に plans.md を更新する
4. 発見事項と決定事項を記録する

plans.md はあなたの長期記憶であり、
プロジェクトの羅針盤です。


## Discord 操作ガイドライン

- Codex 作業から Discord に投稿・更新を行う場合は、`bot-runtime/src/codex/discordActions.ts` の `DiscordActions` ユーティリティを必ず使用してください。
- 利用前に以下の環境変数を設定し、許可されたチャンネルのみを操作します。
  - `CODEX_DISCORD_TOKEN`（未設定時は `DISCORD_TOKEN` を自動参照）
  - `CODEX_DISCORD_ALLOWED_CHANNELS`（カンマまたは空白区切りのチャンネル ID）
  - 必要に応じて `CODEX_DISCORD_ALLOWED_USERS` / `CODEX_DISCORD_ALLOWED_ROLES`（メンション許可のホワイトリスト）
- Codex 実行結果を自動通知する場合は `CODEX_DISCORD_NOTIFY_CHANNEL` を指定し、ログ表示長は `CODEX_DISCORD_NOTIFY_STDOUT_LIMIT` / `CODEX_DISCORD_NOTIFY_STDERR_LIMIT` で調整できます。CLI から個別に `--notify` / `--no-notify` や `--stdout-limit` / `--stderr-limit` を指定して上書きも可能です。
- Plans/Task ドキュメントへの自動追記は `CODEX_DOCS_UPDATE_ENABLED` で有効化し、必要に応じて `--update-docs` / `--no-update-docs` フラグで実行ごとに上書きしてください。
- 実装例:
  ```ts
  import { createDiscordActionsFromEnv } from "../codex/discordActions";

  const actions = createDiscordActionsFromEnv();
  await actions.publishMessage("123456789012345678", {
    content: "Codex からの進捗報告です。",
  });
  ```
- 許可リスト外のチャンネルへの投稿・@everyone などの無制限メンションは禁止です。必要なら AGENTS.md と環境変数を更新してから実行してください。
