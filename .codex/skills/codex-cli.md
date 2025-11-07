# CodeX CLI 利用ガイド

## 基本コマンド
CodeX CLI は `plan → implement → review → commit` の順で操作することを前提に設計しています。各コマンドは `.workflow-sessions/` と `docs/` を一貫して更新するようにしてください。

- `codex plan`  
  - 目的: 要件整理と作業計画作成。  
  - 標準手順: 既存セッションの `01_requirements.md` と `docs/plans.md` を読み込み、差分を反映。必要に応じて `--update-docs` で docs 側にも変更を反映します。  
  - 成果物: `plan` サブディレクトリの生成、作業ステップの列挙、想定テスト項目。

- `codex implement`  
  - 目的: 実装とテスト実行。  
  - 標準手順: Planner が作成したステップに従ってコードを編集し、`04_implementation.md` へ進捗と判断理由を記録。テストは `--run-tests` や `--cmd` オプションで必要なスクリプトを実行します。  
  - 成果物: 修正済みコード、テストログ、未解決リスクの整理。

- `codex review`  
  - 目的: 差分検証と品質保証。  
  - 標準手順: `git diff` とテスト結果を確認し、`03_review.md` に観点・指摘・承認判断を記載します。自動レビュー指摘は必ず再現手順と根拠を添えます。  
  - 成果物: レビューコメント、必要な修正タスク、承認可否。

- `codex commit`  
  - 目的: ドキュメント更新後のコミット生成。  
  - 標準手順: `05_documentation.md` を更新し、必要な README 追記や公開ドキュメント反映を完了してから `codex commit` を実行します。コミットメッセージはセッション名と概要を含めると追跡しやすくなります。

## 補助オプション
- `--notify` / `--no-notify`: Discord 通知を制御。通知する場合は環境変数 `CODEX_DISCORD_NOTIFY_CHANNEL` を設定済みであることを確認。
- `--update-docs`: 実行終了後に `CODEX_DOCS_UPDATE_ENABLED` を参照して docs への反映を行います。自動追記が不要なら `--no-update-docs` を使用。
- `--stdout-limit` / `--stderr-limit`: Discord へのログ通知上限を調整。長大なテストログを扱う場合に有効です。

## 運用ルール
1. コマンド実行前に `.workflow-sessions/<current-session>/session_status.json` の状態を更新し、誰が作業しているかを明示する。  
2. 失敗時は `.codex/skills/error-handling.md` に従って再試行可否を判断し、ステータスを `blocked` または `needs_fixes` に変更する。  
3. Discord への進捗通知が必要な場合は `bot-runtime/src/codex/discordActions.ts` のユーティリティを介して実施する。直接 API を呼び出さない。  
4. 作業完了後は `codex commit` 実行前に `git status` と `session_status.json` の整合を確認し、`docs/plans.md` に残タスクを追記する。

## 参考リンク
- `.codex/CODEX_GUIDE.md`: ワークフロー全体の概説
- `.codex/skills/workflow-session.md`: セッションファイルの詳細ルール
- `.codex/skills/error-handling.md`: エラー処理とフォールバック
- `.codex/agents/*.md`: 各ロールの行動指針
