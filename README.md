# Nyaimlab Discord Bot & 管理ツール

## 概要
- ESCL スクリムの試合結果を直接 ESCL 公開 API から収集し、CSV / Excel にまとめる Discord Bot。
- Nyaimlab 向け運用ダッシュボードのバックエンド (FastAPI) とフロントエンド (Vite + React)。
- Node.js 製の Bot ランタイム（ホットリロード対応）を同梱し、既存の YAML 設定と監査ログ運用を再現。

## リポジトリ構成
- `src/esclbot/`: Python 製 Discord Bot 本体と ESCL API 連携ロジック。
- `src/nyaimlab/`: Nyaimlab 管理 API の FastAPI 実装。
- `dashboard/`: Vite + React で実装した管理ダッシュボード。
- `bot-runtime/`: discord.js v14 + TypeScript の Bot ランタイム。
- `docs/`: 設計資料や参考メモ。`docs/NyaimlabBotDesign.md` 参照。
- `tests/`: Python 側のユニットテスト。

## Python 環境セットアップ
1. Python 3.10 以上を用意します。
2. 依存関係をインストールします。
   ```bash
   pip install -r requirements.txt
   ```

### 共通の仮想環境について
必要に応じて `python -m venv .venv` などで仮想環境を作成し、アクティベートしてから上記コマンドを実行してください。

## ESCL Scrim Collector（Python）
ESCL 公開 API を叩いて 6 試合分のデータを取得し、集計済みの CSV / Excel を生成します。現在は CLI として提供しており、Node.js ランタイムからも内部的に呼び出されます。

### CLI での利用例
```bash
# バージョン表示
python -m src.esclbot.cli version

# CSV 生成（ALL_GAMES相当）
python -m src.esclbot.cli csv "https://fightnt.escl.co.jp/scrims/..." --group G5

# Excel 生成（GAME1..6 / ALL_GAMES / TEAM_TOTALS）
python -m src.esclbot.cli xlsx "https://fightnt.escl.co.jp/scrims/..." --group G5
```

コマンドは JSON を標準出力に返し、`content` フィールドに base64 でエンコードされたファイルを含みます。Node.js ランタイムはこの CLI を利用して Discord へ添付ファイルを返信します。

- CSV / Excel はいずれも UTF-8。列見出しは ESCL の公開データに準拠し、`scrim_id` / `group` / `game` を付与しています。
- Excel 版では命中率・ヘッドショット率を再計算し、`ALL_GAMES` と `TEAM_TOTALS` の集計シートを含みます。

### 参考: 旧来の Discord Bot として起動したい場合
従来同様に Python 製 Discord Bot として動作させたい場合は、`.env` に Bot トークンを設定した上で次のスクリプトを利用してください。
```bash
./scripts/run_esclbot.sh
```
（Node.js ランタイムと同一トークンを共有すると Slash Command が上書きされる点にご注意ください。）

## Nyaimlab 管理 API (FastAPI)
`src/nyaimlab/` には Pages 向けダッシュボードのバックエンドを提供する FastAPI アプリが含まれています。状態はインメモリで管理し、すべてのリクエストに対して監査ログを記録します。

### 起動方法
```bash
export API_AUTH_TOKEN=your-management-token
python -m src.nyaimlab
```
- デフォルトでは `0.0.0.0:8080` で起動します。`API_HOST` / `API_PORT` で変更可能です。
- すべてのリクエストに以下のヘッダーが必須です。
  - `Authorization: Bearer <API_AUTH_TOKEN>`
  - `x-client`: ダッシュボード識別子
  - `x-guild-id`: Discord ギルド ID
  - `x-user-id`: 操作ユーザー ID（監査ログに記録）

### 実装済みエンドポイント
- `/api/welcome.post`: ウェルカムメッセージ設定の保存
- `/api/guideline.save` / `/api/guideline.test`: ガイドライン DM の保存・テスト送信
- `/api/verify.post` / `/api/verify.remove`: `/verify` 自動化設定の登録・削除
- `/api/roles.post` / `/api/roles.mapEmoji` / `/api/roles.remove` / `/api/roles.preview`: ロール配布設定と絵文字マッピング、プレビュー
- `/api/introduce.post` / `/api/introduce.schema.save`: `/introduce` コマンド設定と入力スキーマの保存
- `/api/scrims.config.save` / `/api/scrims.run`: スクリム支援設定の保存と実行（ドライラン対応）
- `/api/settings.save`: 共通設定（言語・タイムゾーン等）の保存
- `/api/audit.search` / `/api/audit.export`: 監査ログ検索と CSV / NDJSON エクスポート
- `/api/state.get`: 現在の状態スナップショットを取得

すべてのレスポンスは `{ "ok": bool, "data": ..., "audit_id": ... }` の形式で返され、エラー時は `error` にメッセージが入ります。

## Nyaimlab 管理ダッシュボード (Vite + React)
`dashboard/` には Pages クライアント向けの管理 UI が含まれます。API を呼び出して設定編集・監査ログ参照・YAML/PR 生成まで行えます。

### セットアップと起動
```bash
cd dashboard
npm install
npm run dev
```
- 開発サーバーは `http://localhost:5173` で起動します。
- ログインフォームで API ベース URL（例: `http://localhost:8080/api`）、管理トークン、ギルド ID、クライアント ID、ユーザー ID を入力します。
- 状態を読み込み、各タブ（Overview / Welcome / Guideline / Verify / Roles / Introduce / Scrims / Settings / Audit Logs / YAML & PR）で編集とプレビューが可能です。
- YAML タブでは GitHub 個人トークンを用いて Pull Request を作成できます。ダッシュボードの設定はブラウザの `localStorage` のみに保存されます。

## Node.js Bot Runtime (discord.js v14)
`bot-runtime/` には TypeScript で記述した Bot ランタイムを同梱しています。ホットリロードと監査ログ送信に対応しており、Pages の設定 YAML をもとに動作します。

### セットアップ
```bash
cd bot-runtime
npm install
cp .env.example .env
```
`.env` に `DISCORD_TOKEN` と `DISCORD_CLIENT_ID` を設定し、必要に応じて `DISCORD_GUILD_ID` や `BOT_CONFIG_PATH` 等を追加してください。

### スクリプト
- `npm run dev`: `ts-node-dev` によるホットリロード起動
- `npm run build`: TypeScript を `dist/` にビルド
- `npm start`: ビルド済み `dist/index.js` を実行

### 提供コマンド
- `/version` — Python ESCL Bot と Node ランタイムのバージョンを表示（エフェメラル）
- `/escl_from_parent_csv parent_url:<URL> group:<任意>` — ESCL グループから 6 試合分の CSV を生成
- `/escl_from_parent_xlsx parent_url:<URL> group:<任意>` — 同データの Excel（GAME1..6 / ALL_GAMES / TEAM_TOTALS）を生成
- `/ping` — 応答遅延を確認（エフェメラル）
- `/verify post [channel:<チャンネル>]` — 認証パネルを投稿／更新
- `/roles post [channel:<チャンネル>]` — ロール配布パネルを投稿／更新
- `/introduce` — 自己紹介モーダルを開き、設定チャンネルへ投稿

### Python / Node 両方の Bot を同時に起動する
ルート直下の `scripts/run_bots.sh` は、Slash Command を統合した Node.js ランタイムを起動しつつ、必要な Python 依存関係（ESCL CLI）を整備します。初回は `.venv` の作成や npm 依存インストール、`.env` テンプレートのコピーを自動で行います。

```bash
./scripts/run_bots.sh
```

停止する際は `Ctrl + C` で Node.js プロセスを終了できます。旧来の Python Bot も併せて起動したい場合は、`RUN_PYTHON_BOT=1 ./scripts/run_bots.sh` のように実行してください。

> **注意:** Python Bot 用の `.env` と Node.js ランタイム用の `bot-runtime/.env` には、それぞれ別の Bot アプリケーション（Discordトークン）を設定してください。  
> 同じトークンを使うと Slash Command が上書きされるため、`run_bots.sh` がエラーで停止します。意図的に同じトークンを使う場合は `ALLOW_SHARED_TOKEN=1 ./scripts/run_bots.sh` のように実行してください。

## テスト
- Python 側: `pytest`
- ダッシュボード: `npm run lint`
必要に応じて個別ディレクトリで実行してください。

## 参考ドキュメント
- `docs/NyaimlabBotDesign.md`: Nyaimlab Bot の引き継ぎ設計メモ
