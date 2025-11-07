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
- [x] Commit & Push: `03_review.md` でレビュー観点を整理し、コミット・プッシュ完了と残課題を記録する

## 2025-10-31 Orchestrator 再実行（20251031_codex-autonomous-workflow-1）
- [x] Plan / Tasks / Workflow ドキュメントを本セッションの進捗で更新する（`plan.md`、`docs/codex_agent_plan.md`、`.workflow-sessions/` 各ファイルなど）
  - [x] Plan Reader の要約を `01_requirements.md` と `session_status.json` に反映済みであることを確認
  - [x] Task Executor / Repo Rebuilder / Reflection / Meta の成果を `02_design.md`〜`05_documentation.md` に順次追記
- [x] `commit_and_review.md` を改訂し、Reflection / Meta フェーズ後でもコミット手順が成立するよう手順とチェックを追記する
  - [x] Reflection 後に再確認する差分チェック手順を追記
  - [x] コミット前チェックリストに Meta 反映有無・通知要否を含める
- [x] `orchestrator.md` / `reflection_logger.md` に `meta_generator.md` の更新手順・期待出力を明文化する
  - [x] Orchestrator の Meta Generator セクションで入力・出力ファイルと通知連携を具体化
  - [x] Reflection Logger の出力に `meta_generator.md` 更新責務を明記し、`tasks.md` へのフィードバック手順を整理
- [x] `.workflow-sessions/.template/session_status.json` にステート一覧と説明を追加し、`session_status` 運用を標準化する
  - [x] 既存ステート（`planning` / `in_progress` / `review` / `blocked` / `completed` / `cancelled` など）の定義をテンプレート `notes` に追記
  - [x] ステートガイドラインを `meta_generator.md` のフォローアップ要求と整合させる

### フォローアップ候補
- [x] Commit & Review プロンプトを更新し、Reflection / Meta フェーズ後にコミットする手順でも破綻しないよう明示する
- [x] Orchestrator / Reflection Logger プロンプトへ `meta_generator.md` 更新手順と期待内容を追記する
- [x] `session_status.json` のステート一覧と説明をテンプレートもしくは AGENTS.md に記載する
- [x] Task Executor プロンプトの参照先（`docs/task.md`）が未整備のため、ドキュメント追加または参照先修正を次サイクルで検討する

## 2025-11-01 Orchestrator セッション
- [x] `scripts/create_workflow_session.py` の `slugify` で空白をハイフンへ正規化し、`--dry-run` で挙動確認する
- [x] Codex 自動運用タスクの俯瞰セクションを `docs/task.md` に追加し、Task Executor の参照先を補強する
- [x] サイクル成果を `plan.md` / `docs/codex_agent_plan.md` / `meta_generator.md` へ反映し、フォローアップタスクとメタ学習を整理する

## 2025-11-04 Orchestrator セッション
- [x] Plan Reader: 設定不整合（member_count_strategy / welcome.card.title_template）を洗い出し、`01_requirements.md` と `session_status.json` を更新する
- [x] Task Executor: `tasks.md` に本セッション用チェックリストを追加し、`04_implementation.md` に実装ログ枠を整備する
- [x] Repo Rebuilder: `bot-runtime/config/config.yaml` をスキーマ準拠（member_count_strategy=include_bots, card.title_template 非空）へ修正する
- [x] Commit & Review: `npx ts-node` 経由で設定ロードを検証し、`03_review.md` に結果とリスクを記録する
- [x] Reflection Logger: `docs/codex_agent_plan.md` と `05_documentation.md` に今回の成果と残課題を記録する
- [x] Meta Generator: `plan.md` / `docs/plans.md` / `meta_generator.md` へ改善点と次アクションを反映する
- [ ] Git: コミット作成と `git push` を実施（失敗時は原因と再試行手順を `tasks.md` へ追記）

### フォローアップ（2025-11-04 セッション）
- [x] Dashboard 設定フォームと管理 API に `member_count_strategy` / `welcome.card.title_template` の空文字バリデーションを追加する
- [x] `bot-runtime/src/config/schema.ts` に文字列トリム＋デフォルト適用のサニタイズ処理を導入する
- [x] `bot-runtime/package.json` に `config:validate` スクリプトを追加し、README / Docs へ利用方法を記載する

### 2025-11-07 作業チェックリスト
1. [x] Dashboard: `SettingsSection` のメンバーカウント戦略を `human_only` / `include_bots` のみに絞り、`WelcomeSection` で Embed / Card タイトルが空の場合は保存前にエラー表示・サニタイズする。
2. [x] 管理 API: `src/nyaimlab/schemas.py` で `MemberCountStrategy` を Bot ランタイムと揃え、`welcome.card.title_template` や Embed タイトルをトリム＋必須化し、旧値（`all_members` など）は安全な既定値へフォールバックさせる。
3. [x] Bot ランタイム: `src/config/schema.ts` に文字列トリム＋デフォルト適用レイヤーを追加し、新規 CLI `npm run config:validate`（`ts-node src/cli/configValidate.ts`）で設定検証が実行できるようにする。
4. [x] ドキュメント＆セッションログ: `.workflow-sessions/20251107_codex-autonomous-workflow/*.md`、`plan.md`、`docs/plans.md`、`docs/codex_agent_plan.md`、`meta_generator.md` へ成果と残タスクを反映する。
5. [x] Commit & Push: 差分レビュー、`npm --prefix bot-runtime run config:validate` 実行結果の記載、`git commit` / `git push` 完了。

## 2025-11-07 Orchestrator（CI hardening フォローアップ）
1. [x] FastAPI 管理 API の空文字ガード（Welcome タイトル／member_count_strategy）を `pytest` で再現し、テストケースを追加する。
2. [x] `.github/workflows/codex-queue-harness.yml` に `npm --prefix bot-runtime run config:validate` を組み込み、CI で設定ファイル破損を検出できるようにする。
3. [x] README / plan / docs に設定検証手順と CI フックを追記し、オペレーションガイドを更新する。
4. [x] `.workflow-sessions/20251107_codex-autonomous-workflow-1` の各フェーズログ・`session_status.json`・`meta_generator.md` を更新し、フォローアップタスク（E2E テストや追加 CI 項目）を整理する。
5. [x] 差分をレビューし、`pytest` / `npm --prefix bot-runtime run config:validate` を実行後にコミット・プッシュする。（179caa1）

## 2025-11-08 Orchestrator 再実行（文書整合とログ更新）
- [ ] Plan Reader: 01_requirements.md と session_status.json を更新
- [ ] Task Executor: 04_implementation.md を本日の実装手順で更新
- [ ] Repo Rebuilder: 02_design.md を方針（ドキュメント中心）で更新
- [ ] Commit & Review: 03_review.md に差分所見とコミット範囲を記載
- [ ] Reflection / Meta: 05_documentation.md に反映内容を記載。必要に応じて docs/codex_agent_plan.md と meta_generator.md を更新

## 2025-11-08 Orchestrator（整合性確認・ドキュメント反映）
- [x] Plan Reader: 本セッションのゴールを 01_requirements.md と session_status.json に反映する
- [x] Task Executor: 本日の実装手順を `.workflow-sessions/20251108_codex-autonomous-workflow/04_implementation.md` に記載する
- [x] Repo Rebuilder: ドキュメントの整合確認と軽微な修正（必要なら）を行い、`02_design.md` に設計意図を追記する
- [x] Commit & Review: `03_review.md` に差分チェックとリスク評価を記録する
- [x] Reflection / Meta: `docs/codex_agent_plan.md` と `meta_generator.md` に学び・改善を記録し、`plan.md` に進捗メモを追記する（plan.md は次サイクルで反映）

## 2025-11-08 Orchestrator 自動実行（20251108_codex-autonomous-workflow-2）
- [x] Plan Reader: 01_requirements.md と session_status.json を更新
- [x] Task Executor: 04_implementation.md を更新
- [x] Repo Rebuilder: 02_design.md に意図を記録
- [x] Commit & Review: 03_review.md に差分確認方針を記録
- [x] Reflection / Meta: 05_documentation.md・docs/meta を更新
