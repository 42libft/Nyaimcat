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

## ESCL Scrim Collector Bot (Python)
ESCL のグループページ URL を入力すると、ESCL 公開 API を直接叩いて 6 試合分の集計データを取得し、Discord 上で CSV / Excel ファイルとして配布します。

### 事前準備（はじめての方向け）
1. サンプル設定をコピーして `.env` を作る。
   ```bash
   cp .env.example .env
   ```
2. `.env` をエディタで開き、`DISCORD_TOKEN` の値を自分の Bot トークンに差し替える。
3. 任意で `GUILD_ID` を書けば、特定ギルドだけにスラッシュコマンドを同期できる。

### 起動の流れ
1. ルートフォルダで下記コマンドを実行。
   ```bash
   ./scripts/run_esclbot.sh
   ```
2. 初回は仮想環境 `.venv` の作成と依存パッケージのインストールを自動で実施。
3. `.env` が未設定だった場合はテンプレートをコピーして終了するので、中身を編集してもう一度実行。
4. Bot が起動するとスラッシュコマンドを同期し、Discord 上で `/version` などが使えるようになる。

### 手動で動かしたい場合
仮想環境を自分で管理したいときは、従来通り次のコマンドで起動してもよい。
```bash
python -m src.esclbot.bot
```
（仮想環境の有効化や依存インストールは事前に済ませておくこと。）

### 提供コマンド
- `/version`  
  現在稼働中の Bot バージョンを表示します。
- `/escl_from_parent_csv parent_url:<url> group:<任意>`  
  指定したグループページから 6 試合分の明細を取得し、Google スプレッドシート対応の CSV を返します。
- `/escl_from_parent_xlsx parent_url:<url> group:<任意>`  
  CSV と同じ生データに加え、Excel ワークブックに `GAME1..6` シート、`ALL_GAMES`（プレイヤー別合計）、`TEAM_TOTALS`（チーム別合計）を含めたファイルを返します。

どちらのコマンドも URL からスクラム名とグループ番号を推定し、ファイル名に反映します。URL が複数記載されているメッセージでも最初の URL を正しく抽出します。

### 出力仕様
- CSV/Excel ともに UTF-8。列見出しは ESCL の公開データと一致し、`scrim_id` / `group` / `game` を付与しています。
- Excel 版では命中率やヘッドショット率を再計算し、並び替え済みの集計シートを含めます。
- 取得に失敗した場合はエラーメッセージを返信します。

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

## テスト
- Python 側: `pytest`
- ダッシュボード: `npm run lint`
必要に応じて個別ディレクトリで実行してください。

## 参考ドキュメント
- `docs/NyaimlabBotDesign.md`: Nyaimlab Bot の引き継ぎ設計メモ
