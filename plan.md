# CodeX 長期運用計画（作業ログ連携）

## 現在の重点テーマ
- CodeX が自律的に計画・実装・振り返りを行えるワークフロー基盤を強化する。  
  - `.codex/agents/` と `.codex/skills/` で役割・ハンドブックを整備済み。  
  - プロンプト群を `.codex/prompts/` に整理し、自己駆動サイクルを確立する（本タスク）。

## 今回の目的
- 7 つの専門プロンプト（Plan Reader, Task Executor, Repo Rebuilder, Commit & Review, Reflection Logger, Meta Generator, Orchestrator）を作成し、CodeX の自己運用サイクルを定義する。
- プロンプト間の連携手順と更新対象ファイルを明示し、plan/tasks/codex_agent_plan と同期を取る。

## 進捗メモ
- 2025-11-03: プロンプト作成タスクを開始。`tasks.md` に実行ステップを登録。
- 2025-11-03: `.codex/prompts/` を新設し、7 つの自己駆動プロンプトを作成。
- 2025-11-03: `scripts/create_workflow_session.py` で `.workflow-sessions/` のテンプレート複製とステータス更新を自動化。プロンプト依存関係図を `.codex/prompts/relationships.md` に整理。
- 2025-10-31: Orchestrator セッション (20251031_codex-autonomous-workflow) を一巡させ、Plan Reader〜Meta Generator の成果を `.workflow-sessions/`・`plan.md`・`tasks.md`・`docs/codex_agent_plan.md` に反映。コミットを `main` へプッシュ済み。
- 2025-10-31: Orchestrator 再実行 (20251031_codex-autonomous-workflow-1) で Commit & Review / Reflection Logger / Orchestrator プロンプトを更新し、`session_status.json` テンプレートとサブチェックリストによる進捗管理を標準化。
- 2025-10-31: RAG 起動時に `chromadb` へ渡すメタデータが配列になりエラーとなる問題を調査し、タグ情報を文字列化＆取得時の整形を追加して解消。
- 2025-10-31: bot-runtime の `welcome.card.title_template` が空文字で起動失敗していたため、テンプレートを再設定し `loadConfig` 検証で復旧を確認。ダッシュボード側へ空文字禁止バリデーション追加をフォローアップとして追う。
