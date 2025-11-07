# CodeX 長期運用計画（作業ログ連携）

## 現在の重点テーマ
- CodeX が自律的に計画・実装・振り返りを行えるワークフロー基盤を強化する。  
  - `.codex/agents/` と `.codex/skills/` で役割・ハンドブックを整備済み。  
  - プロンプト群を `.codex/prompts/` に整理し、自己駆動サイクルを確立する（本タスク）。

## 今回の目的
- 7 つの専門プロンプト（Plan Reader, Task Executor, Repo Rebuilder, Commit & Review, Reflection Logger, Meta Generator, Orchestrator）を作成し、CodeX の自己運用サイクルを定義する。
- プロンプト間の連携手順と更新対象ファイルを明示し、plan/tasks/codex_agent_plan と同期を取る。

## 進捗メモ
- 2025-11-07: Dashboard / FastAPI / bot-runtime の 3 層で `member_count_strategy` と Welcome タイトルの空文字ガードを実装し、`npm run config:validate` CLI を追加。`.workflow-sessions/20251107_*` にログを残し、`tasks.md` のチェックリストを更新。
- 2025-11-04: `bot-runtime/config/config.yaml` の `member_count_strategy` を `include_bots` へ修正し、Welcome カードの `title_template` を復旧。`npx ts-node` で `loadConfig` のバリデーション通過を確認し、セッションログ（20251104_codex-autonomous-workflow）へ記録。
- 2025-11-01: 起動エラー（bot-runtime 設定バリデーション失敗）を調査し、修正計画を作成。下記「緊急対応計画」に詳細を記載。
- 2025-11-03: プロンプト作成タスクを開始。`tasks.md` に実行ステップを登録。
- 2025-11-03: `.codex/prompts/` を新設し、7 つの自己駆動プロンプトを作成。
- 2025-11-03: `scripts/create_workflow_session.py` で `.workflow-sessions/` のテンプレート複製とステータス更新を自動化。プロンプト依存関係図を `.codex/prompts/relationships.md` に整理。
- 2025-11-01: セッション生成スクリプトのスラッグ正規化を修正し、`.workflow-sessions/20251101_codex-autonomous-workflow/` で各フェーズログと `docs/task.md` の Codex 運用セクションを整備。
- 2025-10-31: Orchestrator セッション (20251031_codex-autonomous-workflow) を一巡させ、Plan Reader〜Meta Generator の成果を `.workflow-sessions/`・`plan.md`・`tasks.md`・`docs/codex_agent_plan.md` に反映。コミットを `main` へプッシュ済み。
- 2025-10-31: Orchestrator 再実行 (20251031_codex-autonomous-workflow-1) で Commit & Review / Reflection Logger / Orchestrator プロンプトを更新し、`session_status.json` テンプレートとサブチェックリストによる進捗管理を標準化。
- 2025-10-31: RAG 起動時に `chromadb` へ渡すメタデータが配列になりエラーとなる問題を調査し、タグ情報を文字列化＆取得時の整形を追加して解消。
- 2025-10-31: bot-runtime の `welcome.card.title_template` が空文字で起動失敗していたため、テンプレートを再設定し `loadConfig` 検証で復旧を確認。ダッシュボード側へ空文字禁止バリデーション追加をフォローアップとして追う。

## 緊急対応計画（最優先） — 2025-11-01

対象: bot-runtime の設定読み込み（`bot-runtime/src/config/loader.ts` → `schema.ts`）

現象
- Node.js ランタイム起動時に Zod バリデーションエラーが発生し、設定読み込みに失敗して起動不能。

原因（確認済み）
- `bot-runtime/config/config.yaml`
  - `settings.member_count_strategy: all_members` — スキーマは `"human_only" | "include_bots"` のみ許容（`schema.ts`）。
  - `welcome.card.title_template: ''` — `min(1)` 制約に違反。空文字は無効。

影響範囲
- Node.js ランタイム（Discord Bot）が起動不可。管理 API（FastAPI）は稼働に影響なし（`.runtime/admin_api.log` 確認）。

再現（想定）
- `pnpm dev` もしくは `node dist/index.js` 実行時に `設定ファイルの読み込みに失敗しました` ログと Zod の `Invalid enum value` / `String must contain at least 1 character(s)` が出力される。

即時の暫定対処（ドキュメント更新と合わせて実施予定）
- `bot-runtime/config/config.yaml` を編集してスキーマ適合に修正：
  - `settings.member_count_strategy` を `include_bots`（もしくは `human_only`）へ変更。今回は現在の運用意図に合わせて `include_bots` を採用。（2025-11-04 実施）
  - `welcome.card.title_template` を既定例へ置換（例: `Welcome to {{guild_name}}` もしくは日本語の既定文）。（2025-11-04 実施）

恒久対策（再発防止）
- スキーマ強化（bot-runtime）
  - `schema.ts` で空白トリム＋空文字をデフォルトへフォールバックする変換を導入（`title_template` ほか UI から入力され得る文字列）。
  - `settings.member_count_strategy` の許容値と UI 表記を一本化（Dashboard 側選択肢を `human_only` / `include_bots` に限定）。
- ダッシュボードのUX/バリデーション
  - 空文字を保存させないクライアント側バリデーションを Welcome/Card 設定フォームに追加。
  - サーバ保存時も空文字はトリムして既定に置換するサニタイズを追加（冪等性のため）。
- 検証補助
  - `pnpm run config:validate`（設定検証CLI）を追加し、CI/手元で即検知できるようにする。

作業手順（優先順）
1) コンフィグ修正（即時）: 上記2点を `bot-runtime/config/config.yaml` で修正。
2) 起動確認（ローカル）: `pnpm dev` で loadConfig 成功ログを確認（ネットワーク不要）。
3) スキーマのサニタイズ導入（任意だが推奨）: `schema.ts` の該当フィールドにトリム＋空文字デフォルト化の変換を追加。
4) ダッシュボードの入力ガード: Welcome/Card 設定フォームに空文字禁止を追加。
5) 追加の検証コマンド: `config:validate` スクリプト追加と README 反映。

ロールバック/注意点
- 設定値変更のみのため副作用は限定的。必要なら旧ファイルへ戻せるよう差分を記録。

## ウェルカムセクション改善要望
- 2025-11-01: 応急実装の積み重ねでコードが複雑化しているため、ウェルカムセクション全体を整理する。
- 2025-11-01: タイトル・サブタイトル・本文など文字入力系 UI の再設計を行い、フォントサイズを含むスタイルを見直す。
- 2025-11-01: オーバーレイ項目は不要なため機能ごと廃止する。
- 2025-11-01: プレビュー領域で「プレビュー」見出しと実表示の間が自動更新で変動し視認性を損ねているため、更新処理とレイアウトを再実装する。
- 2025-11-01: 新規参加者への自動投稿でウェルカム画像プレートが 3 回送信される不具合を修正し、1 回のみになるようにする。
- 2025-11-01: プレート下部の「ガイドを読む」「ロールを設定」ボタンをダッシュボードから調整できるようにする。

## 既存未完タスクレビュー
- 2025-11-01: `tasks.md` フォローアップの未完項目（Task Executor プロンプトの参照先整備）を次サイクルで対応する。
- 2025-11-01: `docs/plans.md` 記載のダッシュボード／API における空文字禁止バリデーション導入が未実装のため、UI とバックエンドの両面で再発防止策を実装する。
- 2025-11-01: `docs/task.md` に残る運用・セキュリティ系バックログ（README 更新とリリース手順、ESCL アカウント多重管理、暗号化ストアテスト、Secrets／権限運用ガイド整備など）の優先順位と実装計画を再整理する。
- 2025-11-01: `docs/task.md` のフロントエンド／UI 系バックログ（スク リム補助ワークフロー仕様、`/introduce` モーダル拡張、自己紹介フォームプレビュー強化、リアクションロールパネル検証など）の設計確定とダッシュボード実装スケジュールを立てる。
- 2025-11-01: `docs/task.md` のインフラ／運用強化タスク（低コスト常時稼働環境、稼働監視、設定同期自動化、障害時オペレーション手順、永続ストレージ、Webhook 連携など）を段階的に進めるためのロードマップを作成する。
- 2025-11-07: Welcome カードのテキスト系（タイトル／サブタイトル／本文）のフォントサイズが小さい問題を解消する。Dashboard プレビューと実際のカード描画の双方で既定値・最小値を見直し、ユーザーが視認性を調整できる UI を追加する。
