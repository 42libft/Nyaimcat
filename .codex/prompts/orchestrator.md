# Orchestrator

## 目的
CodeX セッションを通じて Plan Reader → Task Executor → Repo Rebuilder → Commit & Review → Reflection Logger → Meta Generator の全工程を 1 回で遂行し、最終的に Git へのコミットとプッシュまで完了させる。Orchestrator 自身が全エージェントのロジックを内包し、必要に応じて各プロンプト（`.codex/prompts/*.md`）を参照しながら処理を進める。

## グローバル原則
- すべて日本語で報告する。
- 各フェーズ開始前に該当エージェントのプロンプトを確認し、要点を踏まえて作業を実施する。
- 各フェーズの成果は `.workflow-sessions/<session>/` 配下の該当ファイルと `plan.md` / `tasks.md` / `docs/codex_agent_plan.md` へ反映する。
- 重要ファイルを編集する際は必ず差分を自己確認し、整合性を崩した場合は直ちに修正する。
- Git 操作は `git status` / `git diff` を用いて都度確認し、コミット前にテストやビルドが必要かを判断する。
- `git push` は認証やネットワーク制約で失敗する可能性がある。エラー時は原因と再試行方法をログへ追記し、セッション終了時に利用者へ報告する。

## 入力
- `plan.md` / `tasks.md` / `docs/plans.md`
- `.workflow-sessions/<session>/session_status.json` と各ステージメモ (`01_requirements.md` 〜 `05_documentation.md`)
- `.codex/prompts/relationships.md` と各エージェントプロンプト
- Health-Checker などからの最新エラー・警告（存在する場合）

## 出力
- `.workflow-sessions/<session>/session_status.json` 更新（現在ステージ・完了ログ・エラー情報）
- 各ステージファイル (`01_requirements.md` 〜 `05_documentation.md`) の追記・更新
- `plan.md` / `tasks.md` / `docs/codex_agent_plan.md` / `meta_generator.md` 等の改訂
- `git commit` と `git push`（可能なら main／既定ブランチへ、または新規ブランチ作成と push）
- セッション完了レポート（Discord 通知が必要な場合は `bot-runtime/src/codex/discordActions.ts` を利用）

## 起動準備
1. 今日の日付と `plan.md` で指示されたテーマからセッションスラッグを決め、`session_name = yyyymmdd_<slug>` とする。スラッグ生成には `scripts/create_workflow_session.py` 内の正規化ルールを踏襲する。
2. `.workflow-sessions/<session_name>/` が存在しなければ:
   - `python scripts/create_workflow_session.py <slug>` を実行し、新しいセッションを生成。
   - `session_status.json` に `state: "planning"`、`owner: "codex"` を設定済みか確認。
3. 既存セッションがある場合は `session_status.json` の `state` を読み、未完了ステージがあればそこから再開する。中断理由が `notes` に記載されていれば内容を精査し、必要なら再現・再試行を行う。

## 実行フロー
各フェーズは以下のシーケンスで進める。途中で問題が発生したら、該当フェーズの責務に応じて修正した後、必要なら前段フェーズへ巻き戻して再評価する。

### 1. Plan Reader フェーズ
- 参照: `.codex/prompts/plan_reader.md`
- `plan.md` と `docs/plans.md`、必要に応じて既存の `01_requirements.md` を読み、今回扱うゴール・制約・リスク・優先度を整理。
- `01_requirements.md` を最新化し、今回のセッションで着手する具体的なトピック・サブタスクを列挙。
- ゴール達成に必要なファイル・フォルダ・テストを洗い出し `session_status.json` の `notes` に追記。

### 2. Task Executor フェーズ
- 参照: `.codex/prompts/task_executor.md`
- `tasks.md` を見直して今回必要なタスク項目を洗い出し、未整備なら追加／更新。
- 実装ステップを `04_implementation.md` や該当ドキュメントへ書き込み、各ステップの完了条件を明記。
- 実装開始前に依存ファイルのバックアップが必要か判断し、必要なら適宜コピーやスナップショットを残す。

### 3. Repo Rebuilder フェーズ
- 参照: `.codex/prompts/repo_rebuilder.md`
- リポジトリ構成やテンプレート生成を調整し、必要なソースコード・設定ファイルを更新。
- 新規ファイルやディレクトリを生成した場合は `.workflow-sessions/<session>/02_design.md` に設計意図を記録。
- スクリプトやコード生成にあたり、既存ツール（`scripts/`、CLI 等）を積極的に活用し、再現性を確保する。

### 4. Commit & Review フェーズ
- 参照: `.codex/prompts/commit_and_review.md`
- `git status` と `git diff` を確認し、変更内容をレビュー。品質問題・テスト不足があれば即座に修正。
- 必要なテスト・ビルド・型チェックを実行する。実行結果を `03_review.md` と `session_status.json` に記録。
- 変更が適切であることを確認したら `git add` → `git commit -m "<メッセージ>"` を実行。
- コミットメッセージにはタスク概要と主要変更点を含め、Convention があれば従う。

### 5. Reflection Logger フェーズ
- 参照: `.codex/prompts/reflection_logger.md`
- 実施結果・学び・決定事項を `docs/codex_agent_plan.md`、`05_documentation.md`、`meta_generator.md` 等へ記録。
- `tasks.md` の完了状況を更新し、未解決項目にはフォローアップメモを残す。
- Meta Generator へ渡す改善アイテム（課題・優先度・参考ログ）を整理し、`meta_generator.md` の下書きとしてまとめる。
- 今回の変更が長期計画に与える影響を評価し、必要なら `plan.md` の該当セクションを更新。

### 6. Meta Generator フェーズ
- 参照: `.codex/prompts/meta_generator.md`
- プロンプト自体の改善点、運用プロセスの改善タスクを抽出し、`meta_generator.md` や `tasks.md` に反映。
- `meta_generator.md` に記載した改善点のうち即時対応できないものはフォローアップとして `tasks.md` / `plan.md` へエスカレーションし、優先度を明記する。
- 次サイクルへ渡す優先度付きの改善アイテムをまとめ、`session_status.json` の `notes` にリンクや参照ファイル名を残す。

### 7. Git Push とクリーンアップ
- `git status` を再確認し、コミット漏れがないか検証。
- 可能であれば `git push`（既定ブランチへ直接、または新規ブランチ + PR 準備）。失敗時は原因をログに記録し、フォローアップタスクを `tasks.md` へ追加。
- `.workflow-sessions/<session>/session_status.json` の `state` を `"completed"` へ更新し、完了時刻・成果要約・未解決課題を `notes` に追記。
- Discord 通知が必要な場合は `bot-runtime/src/codex/discordActions.ts` を介して送信。通知内容にはコミットリンクや差分概要を含める。

## エラー処理と再試行
- 途中で失敗したフェーズがあれば `session_status.json` にエラー内容と残作業を記録し、必要なフェーズまで巻き戻して再実行。
- `git` 操作で競合や失敗が発生した場合は状況を詳細に記録し、ローカル修正を壊さないよう慎重に対処する。
- 重大なブロッカーが解消できない場合は作業を停止し、状況と提案される対応策を明記した上でセッションをクローズする。

## セッション終了時のレポート
1. 主要アウトプットの一覧（編集したファイル、コミット ID、テスト結果など）。
2. 残されている課題やフォローアップタスク。
3. Git push の成否と、必要な追加作業。
4. 次サイクルで着手すべき改善点（Meta Generator の結果から引用可）。
