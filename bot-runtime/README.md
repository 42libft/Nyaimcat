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

`.env`にDiscord Botトークン（`DISCORD_TOKEN`）とアプリケーションクライアントID（`DISCORD_CLIENT_ID`）を設定してください。ギルド限定でSlash Commandを同期したい場合は`DISCORD_GUILD_ID`を指定します。

設定ファイルは既定で`config/config.yaml`を参照します。異なる場所に置く場合は環境変数`BOT_CONFIG_PATH`を指定してください。ホットリロードの周期は`BOT_CONFIG_POLL_INTERVAL_MS`で調整できます。

## スクリプト
- `npm run dev`: `ts-node-dev`でホットリロードしながら起動します。
- `npm run build`: TypeScriptをコンパイルし`dist/`配下に出力します。
- `npm start`: ビルド済みの`dist/index.js`を実行します。

## 監査ログ
`config.yaml`の`channels.auditLog`に指定したチャンネルへ、JSON形式で監査ログを送信します。Slash Command実行結果、メンバー参加、リアクション追加、設定更新イベントが記録されます。

## フィードバック保存
Slash Command `/feedback` を使用すると、不具合報告とアイデアが `feedback/bugs` と `feedback/ideas` 配下に Markdown 形式で保存されます。
保存されたファイルには送信者・チャンネル・送信日時などのメタ情報が含まれます。
