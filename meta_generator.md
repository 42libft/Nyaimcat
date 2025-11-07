# Meta Generator 改善ログ — 2025-10-31

## 改善提案
- ~~Orchestrator / Commit & Review プロンプトの指示順序が現行フロー（Reflection → Meta の後にコミット）と噛み合っていないため、コミットを最終段階へ明示的に移すか、Reflection フェーズ実施前にコミットできるよう改善する。~~（対応済）
- ~~`meta_generator.md` の更新手順が既存ドキュメントに記載されていないため、Orchestrator / Reflection Logger プロンプトへ参照先と期待する内容を追記する。~~（対応済）
- ~~`session_status.json` の `state` 値について、許容されるステータス一覧をどこかに明文化し、各フェーズで使用するキーが統一されるよう管理する。~~（対応済）

## 優先度順フォローアップ
1. ~~Commit & Review プロンプトを改訂し、Reflection / Meta フェーズ後にコミットする流れでも齟齬が出ないよう手順を再整理する。（優先度: 高）~~
2. ~~Orchestrator / Reflection Logger プロンプトに `meta_generator.md` の出力位置・更新項目を明文化する。（優先度: 中）~~
3. ~~`.workflow-sessions/` テンプレートまたは AGENTS.md に `session_status.json` のステート一覧と説明を追加する。（優先度: 中）~~

## 再評価（2025-10-31 再実行）
- 上記 1〜3 のフォローアップは今回のセッションで反映済み。`commit_and_review.md` / `reflection_logger.md` / `orchestrator.md` の改訂とテンプレート更新を確認した。
- Task Executor プロンプトが `docs/task.md` を参照しているが、該当ドキュメントが未整備なため次サイクルで補完するタスクを追加した。（優先度: 中）

## メモ
- 今回は手動で `meta_generator.md` を作成したが、将来的にはセッション初期化時にテンプレートを生成するスクリプトへ統合できると流れが滑らかになる。

## 改善提案（2025-11-01）
- `scripts/create_workflow_session.py` の `slugify` へ簡易ユニットテストまたは CLI ハーネスを追加し、空白処理の回帰を自動で検知できるようにする。
- セッション初期化スクリプトに `.workflow-sessions/<session>/05_documentation.md` などの雛形へ初期説明文を挿入し、テンプレートから実用メモへの書き換えを漏れなく誘導する。
- Codex 自動運用セクションと長期 `docs/plans.md` のバックログ整理を定期的に同期するため、Reflection フェーズで確認するチェックリストを作成する。

## 改善提案（2025-11-04）
- Dashboard 設定フォームと管理 API に `member_count_strategy` / `welcome.card.title_template` など必須フィールドの空文字ガードを追加し、設定ファイルへ不正値が保存されないようにする。
- `bot-runtime/src/config/schema.ts` で文字列項目のトリムおよび空文字時のデフォルト適用を導入し、バリデーションエラーを未然に防ぐ。
- `bot-runtime/package.json` へ `config:validate` スクリプト（`ts-node src/config/loader.ts`）を追加し、CI やローカルで簡易検証できるようにする。
- `.workflow-sessions/` のテンプレートを現行の実施内容へ即書き換える運用を定着させるため、Reflection Logger がチェックできる簡易チェックリスト案を追加する。

## 改善提案（2025-11-07）
- 追加した Dashboard / FastAPI のバリデーションを E2E / API テストで自動検証できるようにし、回帰検知を容易にする。
- `npm run config:validate` を CI（GitHub Actions）の必須ジョブに組み込み、PR ごとに設定ファイルの破損を検出する。
- README / 運用ガイドへ `config:validate` の使い方と想定フローを追記し、ヒューマンオペレーション時の迷いを減らす。
- FastAPI 側で発生している `FieldValidationInfo` Deprecation Warning を整理し、`ValidationInfo` への移行や `schema.py` のリファクタリング計画を立てる。

## 優先度順フォローアップ（更新）
1. ~~Dashboard 設定フォーム／API へ空文字バリデーションを実装し、`config.yaml` が再び不正値を含まないようにする。（優先度: 高）~~
2. ~~`schema.ts` に文字列トリム＆デフォルト値適用のサニタイズレイヤーを追加し、入力時の無効値を吸収する。（優先度: 高）~~
3. ~~`bot-runtime` に `config:validate` スクリプトを追加し、CI / ローカルで設定バリデーションを即時実行できるようにする。（優先度: 中）~~
4. Dashboard / FastAPI の新バリデーションを自動テスト（E2E or API レベル）でカバーし、回帰検知を仕組み化する。（優先度: 高）※ 2025-11-07 に FastAPI 用 pytest を追加済み。Dashboard UI の E2E テストが残タスク。
5. ~~`config:validate` を GitHub Actions に組み込み、PR 時に必ず実行する。（優先度: 中）~~（codex-queue-harness に追加済み、2025-11-07）
6. ~~README / 運用ガイドに設定検証フローと CLI の使い方を追記する。（優先度: 中）~~（README スクリプト節へ追記、2025-11-07）
7. `scripts/create_workflow_session.py` の slugify 回帰テストを追加し、空白・全角文字のケースを固定化する。（優先度: 中）
8. セッション初期化スクリプトでドキュメントテンプレートにガイド文を埋め込み、Reflection Logger が毎回テンプレートから書き換える手間を削減する。（優先度: 中）
9. Codex 運用タスクセクションで扱うバックログと `docs/plans.md` の優先課題を突き合わせるチェックリストを Reflection Logger に追加する。（優先度: 低）
10. Pydantic v2 の `FieldValidationInfo` 非推奨警告を解消し、`ValidationInfo` への置き換えと単体テスト更新を進める。（優先度: 中）
\n+## メモ（2025-11-08 再実行）
- セッションログ（`.workflow-sessions`）のコミット運用は現行どおり「ignore だが必要時は強制 add」で運用。次サイクルで明文化し、テンプレート例外 or ログ全量コミットの方針を確定する。
11. `.workflow-sessions` の commit/ignore 方針を整理し、テンプレートのみ例外コミットするか、セッションログを随時コミットするかの運用をドキュメント化する。（優先度: 中）
