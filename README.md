# Nyaimlab Discord Bot & 管理ツール

## 概要
- ESCL スクリムの試合結果を直接 ESCL 公開 API から収集し、CSV / Excel にまとめる Discord Bot。
- Nyaimlab 向け運用ダッシュボードのバックエンド (FastAPI) とフロントエンド (Vite + React)。
- Node.js 製の Bot ランタイム（ホットリロード対応）に Codex CLI 連携と Slash コマンド群（`/task` `/work` `/status` `/help` など）を収録。

## リポジトリ構成
- `src/esclbot/`: Python 製 Discord Bot 本体と ESCL API 連携ロジック。
- `src/nyaimlab/`: Nyaimlab 管理 API の FastAPI 実装。
- `dashboard/`: Vite + React で実装した管理ダッシュボード。
- `bot-runtime/`: discord.js v14 + TypeScript の Bot ランタイム。
- `docs/`: 設計資料や運用ドキュメント。Codex 連携は `docs/codex_agent_tasks.md` / `docs/codex_agent_plan.md`、全体設計は `docs/NyaimlabBotDesign.md` を参照。
- `scripts/escl/`: ESCL API ダンプ取得・解析用のスタンドアロン Python ツール群。
- `data/escl/`: 収集した ESCL API ダンプ（`raw/`）、スクリーンショット（`screenshots/`）、生成物（`exports/`）の保管場所。
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
> **追記 (2025-10):** Python Bot は Slash コマンドを公開しません。上記スクリプトで起動した場合でも、応募系コマンドは登録されず CSV / Excel 生成用途のみを想定しています。

### Discord Slash コマンド（応募予約 v2 / Node.js 版）
ESCL 応募ワークフローは Node.js ランタイム（`bot-runtime/`）へ移行しました。Python Bot はこれらのコマンドを提供せず、CSV / Excel 生成ツールとして運用します。最新の Slash コマンド実装は次を参照してください。

- `bot-runtime/src/discord/commands/entry.ts` — 応募予約（前日 0:00 JST 実行、最大 3 回リトライ）
- `bot-runtime/src/discord/commands/entryNow.ts` — 即時応募（リトライなし）
- `bot-runtime/src/discord/commands/setTeam.ts` — Discord userId ↔ teamId の永続化
- `bot-runtime/src/discord/commands/listActive.ts` — `ListActiveScrim` の結果をエフェメラル表示

> **注意:** Python Bot と Node.js Bot を同一トークンで併用すると Slash Command が競合するため、運用環境では Node.js 側のみを稼働させてください。

## Nyaimlab 管理 API (FastAPI)
`src/nyaimlab/` には Pages 向けダッシュボードのバックエンドを提供する FastAPI アプリが含まれています。状態はインメモリで管理し、すべてのリクエストに対して監査ログを記録します。

### 起動方法
```bash
export API_AUTH_TOKEN=your-management-token
python -m src.nyaimlab
```
- デフォルトでは `0.0.0.0:8000` で起動します。`API_HOST` / `API_PORT` で変更可能です。
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

### config.yaml との自動同期
- `NYAIMLAB_CONFIG_SYNC=1` を指定すると、FastAPI 起動時に `bot-runtime/config/config.yaml`（もしくは `NYAIMLAB_CONFIG_PATH`／`BOT_CONFIG_PATH` で指定したパス）を読み込み、初期状態をダッシュボードへ反映します。  
- ダッシュボード経由で設定を更新すると、同じ YAML に自動的に書き戻されるため、Bot が参照する設定と乖離しなくなります。  
- 同期時には直前の `config.yaml` を `backups/` ディレクトリにタイムスタンプ付きで退避し、既定で最新 10 件のみ保持します（`NYAIMLAB_CONFIG_BACKUP_LIMIT` で調整可）。  
- 同期を利用しない場合は環境変数を設定しなければ従来通り（インメモリのみ）動作します。`scripts/run_dashboard.sh` / `scripts/run_admin_api.sh` では同期が自動で有効化されます。

## Nyaimlab 管理ダッシュボード (Vite + React)
`dashboard/` には Pages クライアント向けの管理 UI が含まれます。API を呼び出して設定編集・監査ログ参照・YAML/PR 生成まで行えます。

### セットアップと起動
```bash
cd dashboard
npm install
npm run dev
```
- 開発サーバーは `http://localhost:5173` で起動します。
- ログインフォームで API ベース URL（例: `http://localhost:8000/api`）、管理トークン、ギルド ID、クライアント ID、ユーザー ID を入力します。
- フロントエンドからの既定の接続先は `VITE_API_BASE_URL` で上書きできます（未設定時は `http://localhost:8000/api`）。
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

### Slash コマンドガイド

#### Codex 自動化
- `/task create` — Codex 作業依頼を Markdown（`tasks/inbox/`）へ保存します。件名・概要・詳細・優先度を指定可能。
- `/work start [filename] [latest] [notify_channel] [skip_notify] [update_docs]` — タスクファイルを実行キューへ登録し、Codex CLI を起動します。
- `/work status [queue_id]` — 実行キュー全体または指定 ID の詳細を表示します。
- `/work cancel queue_id:<ID>` — 実行中／待機中のジョブをキャンセルします。
- `/status` — Bot 稼働状況と Codex 連携ヘルスをまとめて確認します。

#### ESCL データ取得
- `/escl_from_parent_csv parent_url:<URL> [group]` — ESCL グループ URL から 6 試合分の CSV（ALL_GAMES 相当）を生成します。
- `/escl_from_parent_xlsx parent_url:<URL> [group]` — 同データを Excel（GAME1..6 / ALL_GAMES / TEAM_TOTALS）として出力します。
- `/version` — Python ESCL コレクタと Node ランタイムのバージョンを表示します。

#### オンボーディング／運用支援
- `/verify post [channel]` — ダッシュボード設定を基に認証パネルを投稿／更新します。
- `/roles post [channel]` — ロール配布パネルを投稿／更新します（ManageRoles 権限またはスタッフロールが必要）。
- `/introduce [image:<画像>]` — 自己紹介モーダルを開き、設定済みチャンネルに投稿します。添付画像がある場合は埋め込み画像として使用し、未指定時はユーザーアイコンをサムネイルに設定します。
- `/feedback bug|idea` — 不具合報告や改善アイデアを Markdown として保存し、監査ログへ記録します。

#### ユーティリティ
- `/ping` — 応答遅延を確認します。
- `/help [category:<カテゴリ>] [command:<コマンド>]` — Bot の主要コマンドとサーバー運用ガイドを表示します。カテゴリ別・コマンド別に詳細を切り替え可能です。

### Codex 連携ドキュメント
- `docs/codex_agent_tasks.md` — Slash コマンドと Codex 自動化機能のタスクリスト。利用手順や実装済み機能の概要を確認できます。
- `docs/codex_agent_plan.md` — Codex 連携機能の実装計画と進捗メモ。設計意図や運用判断を参照する際に利用します。
- `docs/codex/operations.md` — Codex CLI 実行時のガードレールや承認フローなど、運用ポリシーをまとめたドキュメント。

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

## ローカル RAG サービス (Ollama + Chroma)
- `scripts/run_rag_service.sh` で RAG サービスを起動し、`scripts/stop_rag_service.sh` で停止します。初回実行時は `.venv-rag` が生成され、`requirements-rag.txt` に基づいて依存パッケージがインストールされます。
- サービスはデフォルトで `127.0.0.1:8100` をリッスンし、`/health` で稼働状況を確認できます。Ollama の接続先は `OLLAMA_BASE_URL`、モデルは `OLLAMA_MODEL` を環境変数で調整してください。
- ナレッジ用 Markdown は `docs/rag/knowledge/` に配置します。起動時に front-matter（`title` / `tags`）付きで読み込まれ、Chroma (`data/chroma/`) に登録されます。
- Bot からは HTTP 経由で `/events/message` へメッセージの観測情報を渡し、`/chat/query` で応答生成を要求します。感情パラメータは `/admin/feeling`、モード切り替えは `/admin/mode` で操作可能です。
- Discord 側では `/rag status` `/rag mode` `/rag feeling` `/rag ingest` `/rag memo add` `/rag memory prune` を用いて、ヘルス確認・応答パラメータ調整・チャンネル取り込み・メモ追加・記憶 pruning を実行できます（接続先は環境変数 `RAG_SERVICE_BASE_URL` を参照）。
- Qwen-3 14B 量子化から Ollama 登録までの手順は `docs/rag/model_setup_qwen3_14b.md` を参照してください。
- 管理ダッシュボードに追加された「RAG」タブから、モード別プロンプトや感情パラメータ、短期記憶の除外チャンネル、ナレッジ登録をまとめて操作できます。

## 参考ドキュメント
- `docs/NyaimlabBotDesign.md`: Nyaimlab Bot の引き継ぎ設計メモ
