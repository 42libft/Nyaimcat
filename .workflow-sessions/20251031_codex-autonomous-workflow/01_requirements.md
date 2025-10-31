# セッション要件 — 20251031_codex-autonomous-workflow

## 背景
- `.codex/prompts/` に 7 エージェント分のプロンプトが揃ったが、運用サイクルを実際に一巡させるためのドキュメント整備とステータストラッキングが未完了。
- `plan.md` / `docs/plans.md` / `tasks.md` と `.workflow-sessions/` テンプレートの内容が同期されておらず、Orchestrator 実行時の参照先が空のまま残っている。
- 既存リポジトリには他作業による変更が混在しているため、それらを壊さずに今回のセッション成果物を追記する必要がある。

## 目的
- Plan Reader から Meta Generator までの全フェーズを実行し、必要なログ・ドキュメント・タスク更新を反映したうえでコミットとプッシュまで完了させる。
- `plan.md` / `tasks.md` / `docs/codex_agent_plan.md` / `.workflow-sessions/` を相互に矛盾なく更新し、次回以降の自律実行時に参照できる状態へ整える。
- セッション開始時に空だった `01`〜`05` ドキュメントを今回の作業記録で埋め、再現可能な履歴を残す。

## 成功条件
- `01_requirements.md`〜`05_documentation.md` が今回のセッション内容で更新され、必要情報（ゴール・設計・実装ログ・レビュー・ドキュメント反映）が揃っている。
- `session_status.json` が進行ステージと主要メモを追跡し、終了時に `completed` へ遷移している。
- `plan.md` / `tasks.md` / `docs/codex_agent_plan.md` / `meta_generator.md` に今回の成果とフォローアップが反映済み。
- `git status` がクリーンになるまでコミットされ、可能であれば `git push` も成功している（失敗時は理由を記録）。

## 依存・制約
- すべての記録・コミュニケーションは日本語で行う。
- `scripts/create_workflow_session.py` に準拠したセッションスラッグを用いる（既存セッション `20251031_codex-autonomous-workflow` を継続）。
- 既存の変更は触れず、今回の作業で発生した差分のみを扱う。破壊的な Git 操作は禁止。
- ネットワークアクセスは制限されているため、外部依存の取得やリモートビルドは行わない。

## アウトプット
- `.workflow-sessions/20251031_codex-autonomous-workflow/` 配下の 01〜05 各ファイルと `session_status.json` の更新。
- `plan.md` / `tasks.md` / `docs/codex_agent_plan.md` / `meta_generator.md` への追記・改訂。
- 作業内容を要約したコミットと、可能であれば `main` ブランチへのプッシュ。
