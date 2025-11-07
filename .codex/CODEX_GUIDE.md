# CodeX 内部ワークフローガイド

## 目的と背景
このガイドは、Nyaimlab リポジトリを CodeX 単体で自己運用できるようにするための設計図です。Claude Code の Planner / Agent / Session アーキテクチャをベースにしつつ、CodeX CLI が提供する `plan → implement → review → commit` のライフサイクルを前提に整理しています。全エージェントが共通の前提と情報源を持てるよう、役割・セッション構造・エラー時の再試行方針を一冊に集約します。

## ワークフロー全体像
- **Planner（計画担当）**: 要件を分解し、`.workflow-sessions/01_requirements.md` と `docs/plans.md` に整合した作業計画を作成。必要に応じて `plans.md` の Exec Plan を更新。
- **Implementer（実装担当）**: Planner の計画に従い、コード／ドキュメント編集とテスト実行を行う。実装中は `.workflow-sessions/04_implementation.md` に主要な決定事項と作業ログを残す。
- **Reviewer（検証担当）**: 変更点を精査し、リスク・不足テスト・仕様逸脱を指摘。`03_review.md` に観点と所見を整理し、必要な修正を Implementer にフィードバックする。
- **Documenter（記録担当）**: 実装結果をまとめ、`05_documentation.md` と関連ドキュメントを更新。リリースノートや README 追記、開発者向け資料のメンテナンスを担う。
- **Health-Checker（監視担当）**: 自動ワークフローの失敗検知と再実行管理を行い、`session_status.json` の状態遷移を更新する。

各エージェントの詳細な行動規範は `.codex/agents/*.md` を参照してください。

## セッション設計と命名規則
- CodeX によるアクティビティは `.workflow-sessions/` で管理します。セッションは日付とトピックを組み合わせたディレクトリ名（例: `20251103_codex_restructure`）を推奨します。テンプレートは `.workflow-sessions/.template/` に格納されており、`python scripts/create_workflow_session.py <topic>` で自動作成できます。
- セッション配下にはテンプレート（01～05, `session_status.json`）を配置し、ライフサイクルに沿って情報を追記します。詳細な記載ルールは `.codex/skills/workflow-session.md` を参照してください。
- 作業開始時は既存セッションを再利用するか新規作成を判断し、`session_status.json` の `state` を `planning → implementing → reviewing → documenting → done` の順で更新します。

## CLI オペレーションフロー
CodeX CLI は以下の基本シーケンスで操作します。具体的なコマンド例とオプションは `.codex/skills/codex-cli.md` を参照してください。
1. `codex plan`: 要件整理と作業計画の更新。Planner が主導し、plans.md / 01_requirements.md を同期。
2. `codex implement`: 実装とテスト。Implementer が担当し、実装ログと進捗を 04 へ追記。
3. `codex review`: Reviewer が diff を検証し、03_review.md を更新。未解決事項はステータスを `needs_fixes` に変更。
4. `codex commit`: Documenter がドキュメント整理後にコミットを作成。必要なら `--update-docs` を併用して plans/docs を同期。

## 再試行とフォールバック
- 実行中に CLI コマンドが失敗した場合は `.codex/skills/error-handling.md` の手順に従って再試行・ロールバック・保留判断を行います。
- ワークフローを中断する場合でも、`session_status.json` に最新状態を反映し、`docs/plans.md` へメモを残して次回の引き継ぎを容易にします。

## 関連ドキュメント
- `.codex/agents/` : 各エージェントごとの詳細手順
- `.codex/skills/workflow-session.md` : セッションテンプレートと命名規則
- `.codex/skills/codex-cli.md` : CLI コマンドと利用規約
- `.codex/skills/error-handling.md` : エラー時対応と自動修復ポリシー
- `docs/plans.md` : 人間／AI 共用の中長期計画
- `docs/tasks.md` : 作業タスクリストと進捗共有（必要に応じて更新）

このガイドに沿って運用することで、CodeX はリポジトリ内の情報のみで自律的に計画・実装・検証・記録を回せるようになります。
