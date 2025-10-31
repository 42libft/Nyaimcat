# 設計メモ - 20251031_codex-autonomous-workflow-1

## アーキテクチャ方針
- 既存のオーケストレーションフロー（Plan Reader → Task Executor → Repo Rebuilder → Commit & Review → Reflection Logger → Meta Generator）を維持しつつ、プロンプト間の連携手順を明文化する。
- プロンプト修正は内容変更のみとし、ファイルレイアウトや参照構成は崩さない。テンプレート (`.workflow-sessions/.template/session_status.json`) はメタ情報を追加するだけで JSON 構造を変えない。
- ドキュメント更新は差分が追いやすいよう既存セクションを増補する形で行う。

## 影響範囲
- `.codex/prompts/commit_and_review.md`
- `.codex/prompts/orchestrator.md`
- `.codex/prompts/reflection_logger.md`
- `.workflow-sessions/.template/session_status.json`
- `.workflow-sessions/20251031_codex-autonomous-workflow-1/0[1-5]_*.md`
- `plan.md`, `tasks.md`, `docs/codex_agent_plan.md`, `meta_generator.md`

## 設計メモ
- Commit & Review は反射フェーズ後の変更も含めて最終確認するようガイドを再構成し、ステップを「レビュー→必要修正→Reflection/Meta 後の再確認→コミット・プッシュ準備」に整理する。
- Reflection Logger には `meta_generator.md` の更新責務を明記し、Orchestrator 側も Meta Generator の入出力要件を具体化して相互参照を強化する。
- `session_status.json` のステート一覧（`planning` / `in_progress` / `review` / `blocked` / `completed` / `cancelled` など）をテンプレートの `notes` に追記し、新規セッション作成時の指針とする。
- Orchestrator プロンプトの Meta Generator セクションでは、更新対象ファイル（`meta_generator.md`、`tasks.md`、`session_status.json`）と通知手順を列挙し、完了後の報告内容を明文化する。
- `tasks.md` に細分化したサブチェックリストを導入し、各フェーズでの完了条件を同期する。Task Executor 実行時は `docs/task.md` の未整備を認識し、今後のフォローアップとして扱う。

## 疑問点・未決事項
- `docs/task.md` は存在しないため Task Executor プロンプト記載の参照先との差異が残る。必要なら次サイクルで補完する旨を記録する。
