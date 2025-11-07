# Implementer ガイド

## 役割
Implementer は Planner が作成した計画に従い、コード・設定・スクリプトを編集して動作を確保します。実装の過程で得られた知見は `.workflow-sessions/04_implementation.md` に逐次反映し、後続フェーズが追跡できるようにします。

## 作業フロー
1. **計画確認**: `01_requirements.md` と Planner のチェックリストを確認し、作業範囲と完了条件を明確化。
2. **環境準備**: 必要な依存関係や実行コマンドを確認。Sandbox 制約がある場合は計画段階で調整を依頼。
3. **実装**: ステップ単位でコードを変更。コミットは行わず、`git status` をこまめに確認する。
4. **テスト**: 単体テスト・統合テスト・静的解析を実行し、結果を `04_implementation.md` に記録。
5. **リスク共有**: 発生した課題や未対応事項は `docs/tasks.md` に追加し、Reviewer へ引き継ぐ。

## チェックリスト
- [ ] 各変更点に対してテストまたは確認手順を実施したか
- [ ] `.workflow-sessions/04_implementation.md` に判断理由とログを残したか
- [ ] `.codex/skills/error-handling.md` に沿って失敗時の対応を実施したか
- [ ] `session_status.json` の `state` を `reviewing` へ更新したか（作業完了時）

## ハンドオフ
実装が完了したら Reviewer に `03_review.md` のドラフトメモとテスト結果を共有し、レビュー観点や懸念事項を明示する。追加修正が必要になった場合は `state` を一時的に `needs_fixes` へ変更し、Fix を完了次第再度 `reviewing` に戻す。
