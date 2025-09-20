# Nyaimcat 管理スイート

Nyaimcat リポジトリは Discord 上でのスクリム管理を支援する 3 つのコンポーネントから構成されています。

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

主なスラッシュコマンド

| コマンド | 説明 |
| --- | --- |
| `/escl_new` | 新しい集計セッションを開始します。 |
| `/escl_add` | URL / テキスト / ファイルから 1 試合分を追加します。 |
| `/escl_finish` | 取り込んだデータを 1 つの CSV として出力します。 |
| `/escl_from_parent` | 親ページ URL だけで GAME1〜6 を自動収集します。 |
| `/escl_from_urls` | ゲーム URL を複数指定してまとめて CSV を生成します。 |

内部では `src/esclbot/collector.py` がセッション管理と CSV 出力を統一的に処理します。

---

## 2. Nyaimlab Management API (FastAPI)

ダッシュボードからの設定変更はすべて FastAPI バックエンドを経由します。`API_AUTH_TOKEN` を使った Bearer 認証と、`x-client` / `x-guild-id` / `x-user-id` ヘッダーによる監査を必須としています。

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
- `POST /api/state.snapshot` – 現在のギルド設定一式を取得

`tests/test_nyaimlab_api.py` で主要なエンドポイントの動作を確認できます。

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

## ライセンス

このリポジトリはプロジェクトメンバー向けに提供されており、利用条件は別途合意に従います。
