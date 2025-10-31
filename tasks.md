# CodeX 自己駆動プロンプト整備タスク

## 実行ステップ
- [x] `.codex/prompts/` ディレクトリを作成し、既存構成と整合させる
- [x] 7 つのプロンプトファイルを共通フォーマットで記述する
- [x] `plan.md` / `tasks.md` / `docs/codex_agent_plan.md` を更新し、成果とフォローアップを整理する
- [x] `meta_generator.md` に改善候補メモを記載する
- [x] `.workflow-sessions` のセッション生成を自動化するスクリプトを追加し、ガイドを更新する
- [x] プロンプト間の依存関係図と入出力マップを作成し、重複整理を反映する

## メモ
- プロンプト間の依存関係を明示し、Orchestrator から再帰的に呼び出せるようにする。
- 既存の `.codex/agents/` や `.codex/skills/` のポリシーと重複しない構成にする。
- `.codex/prompts/relationships.md` を更新基準として管理し、各エージェントの入出力がズレた場合は真っ先に修正する。
- 2025-10-31: Orchestrator が `.workflow-sessions/20251031_codex-autonomous-workflow/` を開始し、各エージェント実行順序を `session_status.json` に記録。

## 2025-10-31 Orchestrator 実行タスクリスト
- [x] Plan Reader: `01_requirements.md` と `session_status.json` を最新化し、参照ファイルと成功条件を明示する
- [x] Task Executor: `tasks.md` と `04_implementation.md` にセッション用チェックリストと実装ログを記録する
- [x] Repo Rebuilder: `02_design.md` を更新し、必要なリポジトリ変更とテンプレート整備を完了させる
- [x] Reflection / Meta: `docs/codex_agent_plan.md`・`05_documentation.md`・`meta_generator.md` に学びと改善案を追記する
- [x] Commit & Push: `03_review.md` でレビュー観点を整理し、コミット・プッシュ完了と残課題を記録する

## 2025-10-31 Orchestrator 再実行（20251031_codex-autonomous-workflow-1）
- [x] Plan / Tasks / Workflow ドキュメントを本セッションの進捗で更新する（`plan.md`、`docs/codex_agent_plan.md`、`.workflow-sessions/` 各ファイルなど）
  - [x] Plan Reader の要約を `01_requirements.md` と `session_status.json` に反映済みであることを確認
  - [x] Task Executor / Repo Rebuilder / Reflection / Meta の成果を `02_design.md`〜`05_documentation.md` に順次追記
- [x] `commit_and_review.md` を改訂し、Reflection / Meta フェーズ後でもコミット手順が成立するよう手順とチェックを追記する
  - [x] Reflection 後に再確認する差分チェック手順を追記
  - [x] コミット前チェックリストに Meta 反映有無・通知要否を含める
- [x] `orchestrator.md` / `reflection_logger.md` に `meta_generator.md` の更新手順・期待出力を明文化する
  - [x] Orchestrator の Meta Generator セクションで入力・出力ファイルと通知連携を具体化
  - [x] Reflection Logger の出力に `meta_generator.md` 更新責務を明記し、`tasks.md` へのフィードバック手順を整理
- [x] `.workflow-sessions/.template/session_status.json` にステート一覧と説明を追加し、`session_status` 運用を標準化する
  - [x] 既存ステート（`planning` / `in_progress` / `review` / `blocked` / `completed` / `cancelled` など）の定義をテンプレート `notes` に追記
  - [x] ステートガイドラインを `meta_generator.md` のフォローアップ要求と整合させる

### フォローアップ候補
- [x] Commit & Review プロンプトを更新し、Reflection / Meta フェーズ後にコミットする手順でも破綻しないよう明示する
- [x] Orchestrator / Reflection Logger プロンプトへ `meta_generator.md` 更新手順と期待内容を追記する
- [x] `session_status.json` のステート一覧と説明をテンプレートもしくは AGENTS.md に記載する
- [x] Task Executor プロンプトの参照先（`docs/task.md`）が未整備のため、ドキュメント追加または参照先修正を次サイクルで検討する

## 2025-11-01 Orchestrator セッション
- [x] `scripts/create_workflow_session.py` の `slugify` で空白をハイフンへ正規化し、`--dry-run` で挙動確認する
- [x] Codex 自動運用タスクの俯瞰セクションを `docs/task.md` に追加し、Task Executor の参照先を補強する
- [x] サイクル成果を `plan.md` / `docs/codex_agent_plan.md` / `meta_generator.md` へ反映し、フォローアップタスクとメタ学習を整理する
