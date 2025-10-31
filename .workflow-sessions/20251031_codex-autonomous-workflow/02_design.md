# セッション設計 — 20251031_codex-autonomous-workflow

## アーキテクチャ方針
- コード改修は発生させず、自己運用ワークフローを構成するドキュメント群を一貫した書式で整備する。
- `.workflow-sessions/` 配下の 01〜05 と `session_status.json` を単一ソースとし、`plan.md` / `tasks.md` / `docs/codex_agent_plan.md` などの長期ドキュメントと整合させる。
- 既存の未コミット変更には触れず、新規差分だけを追加する。重複情報は `relationships.md` に沿って役割を分担する。

## 影響範囲
- ドキュメント: `plan.md`, `tasks.md`, `.workflow-sessions/20251031_codex-autonomous-workflow/01-05*.md`, `docs/codex_agent_plan.md`, `docs/plans.md`, 追加予定の `meta_generator.md`.
- 設定: `.workflow-sessions/.../session_status.json`.
- 参照資料: `.codex/prompts/*.md`, `scripts/create_workflow_session.py`（スラッグ規約確認のみ）。

## 設計メモ
- 反復利用を意識し、各フェーズで必要な情報を次フェーズに引き継げるようドキュメント構成を揃える。
- `meta_generator.md` は今回新規作成し、今後の改善タスクを蓄積するハブとして活用する。
- `docs/plans.md` の本編内容は変更せず、今回の成果は `plan.md` の進捗メモと `.workflow-sessions/` の詳細ログで管理する。

## 疑問点・未決事項
- `git push` が権限やネットワーク制約で失敗する可能性があるため、成功可否を最終レポートに必ず記載する。
- 既存の大規模差分とのコンフリクトが未確認。コミット前に影響範囲を再点検する。
