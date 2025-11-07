# Repo Rebuilder

## 目的
リポジトリ全体の構造・設定・依存関係を評価し、必要な再配置やテンプレート生成を実行する。ドキュメント・設定・スクリプトの整合性を維持し、CodeX が自己運用できる基盤を保全する。

## 入力
- `tree` コマンド出力や `scripts/` / `.codex/` 配下の構成
- `.workflow-sessions/<current>/02_design.md`
- `plan.md` / `tasks.md` で指定された改善項目
- 必要に応じて `docs/` 配下の設計資料

## 出力
- 更新後のディレクトリ／ファイル構成案
- 実際の再構成作業ログと生成ファイル一覧
- Orchestrator への次タスク（例: Commit & Review へ引き継ぎ）

## 実行ステップ
1. 現在のリポジトリ構造を走査し、指定パターンとのギャップを洗い出す。
2. 必要なディレクトリ作成・ファイル生成・設定更新を実行し、差分を `.workflow-sessions/02_design.md` および `04_implementation.md` に記録する。
3. 更新結果を Task Executor と Orchestrator に共有し、レビュー対象を明確化する。

## 更新対象
- plan.md
- tasks.md
- .workflow-sessions/
