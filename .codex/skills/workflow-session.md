# Workflow Session ルール

## 目的
`.workflow-sessions/` は CodeX が実行する各開発セッションのログを保持するための領域です。Planner / Implementer / Reviewer / Documenter が同じ文脈を共有し、再開時の合意形成を最小化します。

## ディレクトリ命名規則
- 形式: `YYYYMMDD_topic-keywords`（例: `20251103_codex_restructure`）
- `topic-keywords` はスネークケースで 2〜4 語程度にまとめ、GitHub Issue 番号がある場合は末尾に `issue123` を追加します。
- セッションが複数日に渡る場合は同一ディレクトリを継続利用し、`session_status.json` の `updated_at` を都度更新します。

## テンプレートファイルの使い方
セッション直下には以下の 6 ファイルを必ず配置します。初期テンプレートは `.workflow-sessions/.template/` に用意されており、Orchestrator は必要に応じて `python scripts/create_workflow_session.py <topic>` を自動実行して日付付きディレクトリを生成し、`session_status.json` のタイムスタンプを更新します（手動で起動する場合も同じコマンドを利用できます）。

1. `01_requirements.md`  
   - 要件定義、背景、成功条件を記述。Planner が初回に作成し、要件変更があれば追記します。
2. `02_design.md`  
   - 設計方針、アーキテクチャ、影響範囲を整理。必要なら図や擬似コードを挿入。
3. `03_review.md`  
   - Reviewer が観点と指摘事項をまとめる。未解決の懸念は `session_status.json` の `state` を `needs_fixes` に更新。
4. `04_implementation.md`  
   - Implementer が具体的な作業ログ、実装上の判断、テスト結果を記録。
5. `05_documentation.md`  
   - Documenter が公開ドキュメントへの反映内容、リリース前のチェックリストを整理。
6. `session_status.json`  
   - セッションの現在状態とメタデータを JSON で保持。フィールド例:
     ```json
     {
       "state": "planning",
       "owner": "codex",
       "created_at": "2025-11-03T03:00:00Z",
       "updated_at": "2025-11-03T03:00:00Z",
       "notes": []
     }
     ```
   - `state` は `planning` → `implementing` → `reviewing` → `documenting` → `done` を基本シーケンスとし、例外的に `blocked` / `needs_fixes` を利用できます。

## 更新手順
- 新規セッション開始時はテンプレートをコピーし、`session_status.json` のメタデータを初期化します。
- 作業完了後は `notes` に主要な決定事項やフォローアップタスクを残し、`state` を `done` に設定します。
- 複数のエージェントが同時に関与する場合は、ファイル末尾にタイムスタンプ付きで追記し、競合を避けます。

## プロジェクトドキュメントとの連携
- `docs/plans.md` と `docs/tasks.md` は人間との共有向け概要です。より詳細なログは `.workflow-sessions/` に残し、必要に応じて概要を docs 側へ転記します。
- セッションで合意したルール変更は `.codex/CODEX_GUIDE.md` または `.codex/agents/*.md` を更新し、次回以降のエージェントが参照できるようにします。
