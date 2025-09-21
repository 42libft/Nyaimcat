# Nyaimlab Bot と管理ダッシュボード

Discord サーバー「Nyaimlab」の運営を自動化するためのプロジェクトです。Python 製の管理 API と、設定を編集して GitHub Pull Request を発行できる React ダッシュボードを同じリポジトリで管理しています。引き継ぎ設計メモの内容をベースに、Welcome / Verify / ロール配布 / 自己紹介 / スクリム補助 / 監査ログのワークフローを統合しています。

- 設計資料: [`docs/NyaimlabBotDesign.md`](docs/NyaimlabBotDesign.md)
- 管理ダッシュボードは GitHub Pages へ自動デプロイされます（`main` ブランチに push すると Actions が `gh-pages` 環境へ公開）。

---

## ディレクトリ構成

```
├─ src/nyaimlab/        # FastAPI ベースの管理 API
├─ dashboard/           # Vite + React の管理ダッシュボード
├─ docs/                # 設計資料などのドキュメント
├─ tests/               # Python API のテスト
└─ .github/workflows/   # GitHub Pages へのデプロイワークフロー
```

---

## バックエンド (FastAPI) の利用手順

1. Python 3.10 以上を用意します。
2. 依存関係をインストールします。
   ```bash
   pip install -r requirements.txt
   ```
3. `.env` を用意して API トークンなどを設定します。最低限 `API_AUTH_TOKEN` を指定してください。
   ```bash
   export API_AUTH_TOKEN=your-management-token
   python -m src.nyaimlab
   ```
4. デフォルトでは `http://localhost:8080` で起動し、`/api/*` に対して Bearer 認証付き POST リクエストを受け付けます。
5. `tests/` 配下に FastAPI のユニットテストを用意しています。変更時は `pytest` を実行してください。

API が保持する主な設定:

- Welcome メッセージと DM ガイドライン
- Verify ボタン / リアクションの挙動
- ロール配布パネル（ボタン or セレクト）
- 自己紹介モーダルの項目と NG ワード
- スクリム補助機能のテンプレート
- 監査ログ検索 / エクスポート
- `config.yaml` へ書き出すためのスナップショット (`/api/state.get`)

---

## フロントエンド (ダッシュボード) の開発手順

1. Node.js 18 系をインストールします。
2. 依存関係を取得します（ロックファイルはコミットしない方針です）。
   ```bash
   cd dashboard
   npm install
   ```
3. ローカル開発サーバーを起動します。
   ```bash
   npm run dev
   ```
   デフォルトで `http://localhost:5173` が開きます。ログインフォームで API の URL とトークン、Guild ID、オペレーター ID を入力すると各タブを操作できます。
4. `npm run build` を実行すると `dashboard/dist` に本番ビルドが生成されます（GitHub Actions ではこのディレクトリを Pages へアップロードします）。
5. TypeScript 型チェックは `npm run lint` で実行できます。

### 主なタブ

- **概要**: 現在読み込んだ設定を一覧表示。
- **Welcome / ガイドライン**: Embed プレビュー、Notion リンク、DM テンプレート編集。
- **Verify / ロール配布**: Slash コマンド設定と UI プレビュー。
- **自己紹介**: モーダル項目の ON/OFF、文字数制限、NG ワード管理。
- **スクリム**: 初期ロジックを設定し、将来の自動化に備えたプレースホルダーを提供。
- **共通設定**: タイムゾーンなどの共通パラメータ。
- **監査ログ**: `/api/audit.search` の結果を閲覧し、詳細を JSON で表示。
- **YAML & PR**: `config.yaml` の差分を表示し、GitHub API 経由で PR を起票。

GitHub PR 作成ではブラウザ上の `fetch` を利用し、PAT・リポジトリ名・ベースブランチなどをフォームから入力できます。PR は Draft/通常の切り替えに対応し、既存ブランチがあれば更新します。

---

## GitHub Pages へのデプロイ

`.github/workflows/dashboard-pages.yml` が `main` への push / 手動実行を契機に以下を行います。

1. リポジトリをチェックアウトし、Pages の設定を初期化。
2. Node.js 18 をセットアップし `dashboard` ディレクトリで `npm install` → `npm run build` を実行。
3. 生成された `dashboard/dist` を Pages アーティファクトとしてアップロード。
4. `deploy-pages` アクションで GitHub Pages (`gh-pages` 環境) へ公開。

GitHub Pages 側では README の静的レンダリングではなく、ビルド済みダッシュボードが表示されます。リポジトリ設定で Pages のソースを「GitHub Actions」にしておくことを推奨します。

---

## テストと品質管理

- Python API: `pytest`
- ダッシュボード: `npm run lint`（型チェック）
- GitHub Pages デプロイ: Actions のログでビルド結果を確認

変更時は上記コマンドを実行し、CI でエラーが発生しないことを確認してください。

---

## 参考

- [FastAPI ドキュメント](https://fastapi.tiangolo.com/)
- [discord.js ガイド (将来の Bot 実装用)](https://discordjs.guide/)
- [GitHub REST API ドキュメント](https://docs.github.com/rest)
