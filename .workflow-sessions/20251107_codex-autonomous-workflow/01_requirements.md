# セッション要件 — 20251107_codex-autonomous-workflow

## 背景
- 2025-11-04 のセッションで `config.yaml` を修正して一時的に復旧したが、Dashboard / 管理 API / Bot ランタイムのいずれにも空文字バリデーションやサニタイズがなく、再度 `member_count_strategy` や `welcome.card.title_template` が無効値になるリスクが残っている。
- `docs/plans.md`・`meta_generator.md` では上記問題の恒久対策（UI・API・スキーマ・検証スクリプト追加）が最優先フォローアップとして管理されている。
- 現状の Git ワークツリーは Codex プロンプトや RAG 知識ベースなど未コミット差分が多く、今回の Orchestrator サイクルで成果をまとめてコミット／push する必要がある。

## 目的
- Dashboard 設定フォーム（`SettingsSection` / `WelcomeSection`）へ即時バリデーションを導入し、`member_count_strategy` を許容値（`human_only` / `include_bots`）に限定、Welcome Embed/Card のタイトルを空文字で保存できないようにする。
- FastAPI スキーマ（`src/nyaimlab/schemas.py`）で同じ制約を厳密化し、空文字や未定義値を受け付けた場合は 400 エラーで弾く。保存済みスナップショットに古い値が残っても安全にフォールバックできるよう変換を追加する。
- Bot ランタイムの Zod スキーマ (`bot-runtime/src/config/schema.ts`) へ文字列トリム＋デフォルト適用ロジックを導入し、新規 CLI スクリプト `npm run config:validate` から設定ファイル検証をワンコマンドで実行できるようにする。
- Plan / Tasks / Docs / Workflow ログを全部更新し、最終的に commit + push とメタ振り返りまで完遂する。

## 成功条件
- Dashboard UI でメンバーカウント戦略に無効値を選べず、保存時もサニタイズされる（`SettingsSection` & `dashboard/src/types.ts` 更新）。
- Welcome Section が embed/card いずれも空タイトルや空カード背景を保存しようとするとクライアント側でエラー表示し、サーバー送信前にブロックする。
- FastAPI スキーマが新しい列挙・バリデーションを持ち、`settings.save` / `welcome.post` のリクエストで空文字・不正列挙を渡すと 422 を返す。
- `bot-runtime` の `config:validate` スクリプトが追加され、`npm --prefix bot-runtime run config:validate` が成功（`loadConfig` が ok: true）する。新しいサニタイズ処理で空文字は自動的に既定値へフォールバックする。
- `.workflow-sessions/20251107_codex-autonomous-workflow/*.md`、`plan.md`、`docs/plans.md`、`tasks.md`、`docs/codex_agent_plan.md`、`meta_generator.md` に今回の作業と残課題が反映され、Git commit & push が完了している。

## 依存・制約
- Dashboard（React / Vite）、FastAPI（Python 3.11 / Pydantic v2）、bot-runtime（Node.js 18 / TypeScript）の 3 サブプロジェクトに跨るため、各ディレクトリでビルドコマンドや依存を壊さないように注意する。
- 既存スナップショットや設定ファイルに `all_members` など旧値が残っている可能性があるので、サーバー側で `human_only` へのフォールバック or 422 レスポンスをどちらにするかを事前に決め、影響範囲をログへ残す。
- CLI 実行はリポジトリルートから `npm --prefix bot-runtime ...` を用いる（ルート `package.json` は別用途のため）。
- 既存未コミット差分（Codex プロンプト等）は触らず、今回追加分のみでコミットメッセージをまとめる。

## アウトプット
- `.workflow-sessions/20251107_codex-autonomous-workflow/01_requirements.md` 〜 `05_documentation.md` と `session_status.json`（Plan Reader〜Meta Generator のログ）。
- Dashboard 更新: `src/components/SettingsSection.tsx`, `src/components/WelcomeSection.tsx`, `src/types.ts`, `src/defaults.ts` ほか関連ファイル。
- 管理 API 更新: `src/nyaimlab/schemas.py`（必要なら `store.py` / `app.py`）でのバリデーション強化。
- Bot ランタイム更新: `src/config/schema.ts`, `package.json`, `src/cli/configValidate.ts`（新規）など。
- ドキュメント／計画更新: `plan.md`, `docs/plans.md`, `tasks.md`, `docs/codex_agent_plan.md`, `meta_generator.md`。
- Git commit + push（設定バリデーション強化 & セッションログ追記）。
