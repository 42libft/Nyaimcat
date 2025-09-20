# Nyaimcat 管理スイート

Nyaimcat リポジトリは Discord 上でのスクリム運営を支援する 3 つのコンポーネントから構成されています。

- **ESCL Scrim Collector Bot** – `/escl_*` コマンドで ESCL の詳細結果を収集して CSV にまとめます。
- **Nyaimlab Management API** – FastAPI 製の管理バックエンド。GitHub Pages からのダッシュボード呼び出しを受け付けます。
- **Pages フロントエンド** – `docs/` 以下の静的 SPA。すべての管理項目をブラウザから編集できます。

## ディレクトリ構成

```
├─ src/esclbot/        # スクリム集計 Bot のコード
├─ src/nyaimlab/       # FastAPI 管理 API
├─ docs/               # GitHub Pages 用ダッシュボード (ビルド済み)
├─ tests/              # FastAPI 向けテスト
└─ requirements.txt    # 共通 Python 依存関係
```

---

## 1. ESCL Scrim Collector Bot

### セットアップ

1. 依存関係をインストールします。
   ```bash
   pip install -r requirements.txt
   ```
2. `.env` を用意して Discord Bot Token などを設定します。
   ```bash
   cp .env.example .env
   # DISCORD_TOKEN や DEFAULT_SCRIM_GROUP を記入
   ```
3. Bot を起動します。
   ```bash
   python -m src.esclbot.bot
   ```

### 主なスラッシュコマンド

| コマンド | 説明 |
| --- | --- |
| `/escl_new` | 新しい集計セッションを開始します。 |
| `/escl_add` | URL / テキスト / ファイルから 1 試合分を追加します。 |
| `/escl_list` | 取り込み状況を表示します。 |
| `/escl_clear` | セッションを破棄して再開します。 |
| `/escl_finish` | 取り込んだデータを 1 つの CSV として出力します。 |
| `/escl_from_parent` | 親ページ URL だけで GAME1〜6 を自動収集します。 |
| `/escl_from_urls` | ゲーム URL を複数指定してまとめて CSV を生成します。 |

> ⚠️ URL からの抽出はベストエフォートです。失敗した場合は ESCL サイトの「詳細な試合結果をコピー」テキストを貼り付けてください。

### 出力仕様

- ESCL テーブルと互換性のあるヘッダーを持つ 1 つの CSV を生成します。
  - メタ情報として `scrim_group`, `scrim_id`, `game_no` を付与します。
- 文字コードは UTF-8。Google スプレッドシートでそのまま読み込めます。

### デプロイメモ

- ローカル実行: 上記コマンドで起動します。
- Docker 化: シンプルな Dockerfile を追加して利用することもできます（必要に応じて PR を歓迎します）。

内部では `src/esclbot/collector.py` がセッション管理と CSV 出力を統一的に処理します。

---

## 2. Nyaimlab Management API (FastAPI)

GitHub Pages 上のダッシュボードからの設定変更はすべて FastAPI バックエンドを経由します。`API_AUTH_TOKEN` を使った Bearer 認証と、`x-client` / `x-guild-id` / `x-user-id` ヘッダーによる監査を必須としています。

### 起動

```bash
export API_AUTH_TOKEN="your-pages-token"
pip install -r requirements.txt
python -m src.nyaimlab
```

既定では `0.0.0.0:8080` で起動します。`/api` 以下に以下の主なエンドポイントを提供します。

- `POST /api/welcome.post` – Welcome Embed の保存
- `POST /api/guideline.save` / `test` – ガイドライン DM の管理とプレビュー
- `POST /api/verify.post` / `remove` – `/verify` メッセージの設置/削除
- `POST /api/roles.*` – ロール配布設定、絵文字マッピング、プレビュー
- `POST /api/introduce.*` – `/introduce` 投稿先とモーダル項目の管理
- `POST /api/scrims.*` – 週間スクリム設定と手動実行
- `POST /api/audit.*` – 監査ログ検索・エクスポート
- `POST /api/settings.save` – 共通設定（言語・タイムゾーン等）
- `POST /api/state.snapshot` – 現在のギルド設定と監査ログ抜粋を取得

すべての応答は `{"ok": boolean, "error"?, "data"?, "audit_id"?}` 形式で返されます。`tests/test_nyaimlab_api.py` で主要なフローを確認できます。

---

## 3. GitHub Pages ダッシュボード

`docs/` ディレクトリは管理用 SPA の完成ファイルです。GitHub Pages の公開対象を `main` ブランチの `docs/` に設定するだけで稼働します。

### ローカルプレビュー

```bash
python -m http.server --directory docs 4173
# http://localhost:4173 をブラウザで開く
```

ブラウザ上の [接続] タブで API Base URL、セッショントークン、ギルド ID、オペレーター ID を保存すると、以降すべての設定を GUI から編集できます。各ページは保存成功時に監査ログへ記録され、`監査ログ` タブから検索・エクスポートが可能です。

### GitHub Pages への公開手順

1. GitHub リポジトリの **Settings → Pages** で Source に `main` / `docs` を選択。
2. 数分後に公開 URL が発行されます。ダッシュボードはバックエンドの `API_BASE_URL` と `API_AUTH_TOKEN` を参照して動作します。
3. バックエンドは HTTPS で公開し、CORS 設定に Pages のドメイン (例: `https://<user>.github.io`) を追加してください。

---

## テスト

管理 API のテストは `pytest` で実行できます。

```bash
pip install -r requirements.txt
pytest
```

---

## Appendix: English Quick Reference

### Quick Start

1. Python 3.10+ is recommended.
2. Install dependencies
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` (and other options).
4. Run the bot
   ```bash
   python -m src.esclbot.bot
   ```

### Slash Commands

- `/escl_new [scrim_group] [scrim_url]` — start a session scoped by guild/channel/user
- `/escl_add [url|text|file]` — ingest one game from a URL, pasted text or attachment
- `/escl_list`, `/escl_clear`, `/escl_finish`
- `/escl_from_parent`, `/escl_from_urls` — full automation helpers

> The bot prioritises **text paste** reliability. URL extraction is best-effort and may fall back to the copied text.

### Output & Deploy

- One UTF-8 CSV containing the ESCL headers plus `scrim_group`, `scrim_id`, `game_no`.
- Local deploy: run the module as above.
- Docker: feel free to add a Dockerfile in your own environment.

### Management API recap

- Start locally with `python -m src.nyaimlab` after setting `API_AUTH_TOKEN`.
- Every request must provide `Authorization`, `x-client`, `x-guild-id`, `x-user-id` headers.
- Implemented routes include welcome, guideline, verify, roles, introduce, scrims, audit, settings and `state.snapshot`. Responses follow `{"ok", "error"?, "data"?, "audit_id"?}`.

---

## ライセンス

このリポジトリはプロジェクトメンバー向けに提供されており、利用条件は別途合意に従います。
