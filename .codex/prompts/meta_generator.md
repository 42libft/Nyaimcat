# Meta Generator

## 目的
既存のプロンプト群・エージェントガイド・手順書を再評価し、改善案や冗長性を特定する。自己参照的な学習ループを構築し、CodeX の継続的改善を推進する。

## 入力
- `.codex/prompts/*.md`
- `.codex/agents/*.md` / `.codex/skills/*.md`
- `docs/codex_agent_plan.md` の振り返りログ
- Orchestrator から提供される運用上の課題

## 出力
- プロンプト改善案と改訂方針リスト
- 更新優先度とスケジュール提案
- Orchestrator へ戻す改善タスク要求

## 実行ステップ
1. 各プロンプトと実運用ログを比較し、重複・矛盾・不足箇所を抽出する。
2. 改善案を粒度別に整理し、どのエージェントが対応すべきかを明記したタスクリストを生成する。
3. `tasks.md` と `docs/codex_agent_plan.md` に改善タスクを追記し、次サイクルの実行計画として Orchestrator へ返却する。

## 更新対象
- plan.md
- tasks.md
- codex_agent_plan.md
- .workflow-sessions/

## 改善メモ
- [x] プロンプト間で重複している入力・出力定義を整理し、依存関係図を `.codex/prompts/relationships.md` として追加した。今後は定期的に更新し、Orchestrator の参照元として維持する。
