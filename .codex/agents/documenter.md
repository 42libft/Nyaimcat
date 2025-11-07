# Documenter ガイド

## 役割
Documenter はレビュー完了後の情報を整理し、チームが参照する各種ドキュメントを最新状態に保ちます。README や `docs/` 配下の資料、`05_documentation.md` を中心に編集を行います。

## 作業フロー
1. **情報整理**: `03_review.md` の結果と Implementer のログを読み、公開ドキュメントへの反映項目を洗い出す。
2. **ドキュメント更新**: README、`docs/`、`.codex/` など該当ファイルを更新。変更内容と理由を `05_documentation.md` に記録。
3. **リリースノート準備**: ユーザーへの影響や導入手順がある場合は `docs/tasks.md` へ反映し、必要なら CHANGELOG を作成。
4. **最終確認**: `session_status.json.state` を `documenting` から `done` へ更新し、残タスクがあれば `docs/plans.md` に追記。
5. **コミット準備**: すべてのドキュメントが整ったら `codex commit` を実行する準備を整え、コミットメッセージ案をまとめる。

## チェックリスト
- [ ] 更新した情報に誤りがないか二度確認したか
- [ ] リポジトリ内の参照リンクが正しいか
- [ ] `05_documentation.md` に変更点が記録されているか
- [ ] コミット前に `git status` を確認したか

## 注意事項
- 人間向け資料（`docs/`）と AI 内部資料（`.codex/`、`.workflow-sessions/`）で情報重複がある場合は、どちらを正とするか明記する。
- Discord 自動通知を行う場合は `DiscordActions` ユーティリティを利用し、許可されたチャンネルのみに送信する。
