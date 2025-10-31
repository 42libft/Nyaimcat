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
- [ ] Commit & Push: `03_review.md` でレビュー観点を整理し、コミット・プッシュ完了と残課題を記録する

### フォローアップ候補
- [ ] Commit & Review プロンプトを更新し、Reflection / Meta フェーズ後にコミットする手順でも破綻しないよう明示する
- [ ] Orchestrator / Reflection Logger プロンプトへ `meta_generator.md` 更新手順と期待内容を追記する
- [ ] `session_status.json` のステート一覧と説明をテンプレートもしくは AGENTS.md に記載する
