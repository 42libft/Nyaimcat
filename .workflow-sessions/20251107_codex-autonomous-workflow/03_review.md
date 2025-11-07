# レビューログ — 20251107_codex-autonomous-workflow

## レビュー観点
- Dashboard UI の入力ガードが要件どおりか（許容値の絞り込み・保存前検証）。
- FastAPI スキーマが Bot ランタイムと整合し、旧値フォールバックと 422 エラーが期待どおり動くか。
- bot-runtime の Zod スキーマと新規 `config:validate` CLI が設定ファイル検証を自動化できているか。
- セッションログ（01〜05）と tasks / plans が今回の成果と整合しているか。

## 差分サマリ
- Dashboard: `SettingsSection` で `member_count_strategy` を 2 値に制限し、`WelcomeSection` に Title / Background のバリデーション＆サニタイズを追加。
- FastAPI: `MemberCountStrategy` 列挙を `human_only | include_bots` に統一し、Welcome タイトルのトリム＋必須化、旧値からのフォールバックを実装。
- Bot runtime: Zod スキーマへ `trimToUndefined` ヘルパーを導入し `title_template` をサニタイズ。CLI `src/cli/configValidate.ts` と npm script `config:validate` を追加。
- Docs / Tasks / Workflow: 要件・実装ログ・チェックリストを更新。

## テスト
- `npm --prefix bot-runtime run config:validate` … OK（`config/config.yaml` 読み込み成功）。

## 指摘事項
- 追加の自動テストは未整備だが、UI と API の単体検証でカバー可。次サイクルで Dashboard E2E テストを検討するメモを Reflection で拾う。

## 承認判断
- `approve` — UI / API / runtime の三層で同じ制約を反映でき、手動検証コマンドも整備済み。残課題はドキュメント整理と push 手順のみ。
