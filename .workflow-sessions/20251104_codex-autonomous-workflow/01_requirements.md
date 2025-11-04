# セッション要件 — 20251104_codex-autonomous-workflow

## 背景
- `bot-runtime/config/config.yaml` の `settings.member_count_strategy` がスキーマ未対応値（`all_members`）のままで、Zod バリデーションに失敗してランタイムが起動できない。
- Welcome カード設定の `title_template` が空文字になっており、`WelcomeCardConfigSchema` の `min(1)` 制約を満たさない状態が継続している。
- 2025-10-31〜2025-11-03 の自己駆動サイクルでプロンプト整備までは完了したが、緊急対応として設定修正とドキュメントへの反映が保留されている。

## 目的
- 設定ファイルをスキーマ適合させ、`loadConfig` 実行時にエラーが出ない状態へ戻す。
- セッションログ（`.workflow-sessions/20251104_codex-autonomous-workflow/`）と長期計画ドキュメントを更新し、修正内容と今後のフォローアップを共有する。
- 必要なテスト・検証手順を整理し、次の Commit & Review フェーズへ明確な引き継ぎを行う。

## 成功条件
- `settings.member_count_strategy` を許容値（`include_bots` 予定）へ修正し、`welcome.card.title_template` を空文字から適切なテンプレートへ更新できている。
- `npx ts-node src/config/loader.ts` などで `loadConfig` を実行し、`ok: true` で読み込みが完了することを確認する。
- `plan.md` / `docs/plans.md` / `.workflow-sessions/20251104_codex-autonomous-workflow/` 関連ファイルへ今回の対応内容・リスク・フォローアップを反映し、他フェーズが参照できる。
- 変更差分が `git diff` で意図どおりになっており、不要な編集が紛れ込んでいない。

## 依存・制約
- Node.js 20 系 + `ts-node` が利用可能である前提（既存 `node_modules` を再利用）。
- ネットワークアクセスは利用せずローカル検証のみで完結させる。
- 既存の `canvas` 依存により `npm install` の追加実行は避け、既存ロックファイルを尊重する。
- Orchestrator のガイドラインに従い、各フェーズの着手前にプロンプトを参照しログを更新する。

## アウトプット
- `bot-runtime/config/config.yaml` の修正と自己確認ログ。
- `.workflow-sessions/20251104_codex-autonomous-workflow/` 配下の更新（特に `01_requirements.md` / `session_status.json` など）。
- `plan.md` / `docs/plans.md` / `tasks.md` / `docs/codex_agent_plan.md` / `meta_generator.md` に必要な追記。
- Config 検証の実施結果とフォローアップ課題を記録したメモ（`03_review.md` / `05_documentation.md` など）。
