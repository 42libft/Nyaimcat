# Bot Runtime (discord.js v14)

## 概要
このディレクトリはNyaimlab向けDiscord BotランタイムのNode.js実装です。TypeScriptとdiscord.js v14を利用し、設定ファイルのホットリロードと監査ログの送信に対応しています。

## 前提条件
- Node.js 18 以上
- pnpm / npm のいずれか
- Discord Bot用のトークン・クライアントID

## セットアップ
```bash
npm install
cp .env.example .env
```

`.env`にDiscord Botトークン（`DISCORD_TOKEN`）とアプリケーションクライアントID（`DISCORD_CLIENT_ID`）を設定してください。ギルド限定でSlash Commandを同期したい場合は`DISCORD_GUILD_ID`を指定します。Python製Botとトークンを共有している場合は、`DISABLE_COMMAND_SYNC=1` を指定するとSlash Commandの同期をスキップできます。

設定ファイルは既定で`config/config.yaml`を参照します。異なる場所に置く場合は環境変数`BOT_CONFIG_PATH`を指定してください。ホットリロードの周期は`BOT_CONFIG_POLL_INTERVAL_MS`で調整できます。

## スクリプト
- `npm run dev`: `ts-node-dev`でホットリロードしながら起動します。
- `npm run build`: TypeScriptをコンパイルし`dist/`配下に出力します。
- `npm start`: ビルド済みの`dist/index.js`を実行します。

## Codex 運用ツール
- `npm run task-inbox -- <コマンド>`: Codex タスク Inbox の一覧表示・検査・編集・削除を行います。
- `npm run codex-runner`: 保存されたタスクを選択し Codex CLI を起動します。
- `npm run codex-queue-harness`: Codex 実行キューのリトライやタイムアウト挙動を再現します。
- `npm run health-history -- <summary|detail|timeline>`: `tasks/runs/health/` に保存されたヘルスチェック履歴を集計し、概要やタイムラインを確認できます。
- `npm run escl-rotate-secret -- --new-key <BASE64>`: `data/escl_credentials.enc` を新しい `ESCL_SECRET_KEY` で再暗号化します。`--old-key` を省略すると現在の環境変数 `ESCL_SECRET_KEY` を利用します。

## 監査ログ
`config.yaml`の`channels.auditLog`に指定したチャンネルへ、JSON形式で監査ログを送信します。Slash Command実行結果、メンバー参加、リアクション追加、設定更新イベントが記録されます。

## フィードバック保存
Slash Command `/feedback` を使用すると、不具合報告とアイデアが `feedback/bugs` と `feedback/ideas` 配下に Markdown 形式で保存されます。
保存されたファイルには送信者・チャンネル・送信日時などのメタ情報が含まれます。

## ESCL アカウント管理
- `ESCL_SECRET_KEY` を `.env` に設定すると、ESCL JWT と teamId を暗号化した状態で `data/escl_credentials.enc` に保存できます。
- Slash Command `/escl account register|list|remove|set-default` でアカウントの登録・確認・削除・デフォルト切り替えを行います。登録時は JWT の検証を行い、成功すると暗号化ストアを自動更新します。
- 応募系コマンド `/entry` `/entry-now` `/list-active` では `account` オプションから登録済みアカウントを選択でき、指定が無い場合はデフォルトアカウントまたはレガシー環境変数 `ESCL_JWT` を利用します。
- 暗号化キーをローテーションしたい場合は `npm run escl-rotate-secret -- --new-key <BASE64>` を実行し、`.env` の `ESCL_SECRET_KEY` を新しい値に更新したうえで Bot を再起動してください。
