# Commit & Review

## 目的
Git 差分の検証と品質確認を行い、Reflection / Meta フェーズ後の更新も含めて最終的なコミット・プッシュ準備を整える。レビュー観点を体系化し、失敗時の再試行手順を `.codex/skills/error-handling.md` と同期させる。

## 入力
- `git status` / `git diff` の結果
- `.workflow-sessions/<current>/03_review.md`
- `tasks.md` の完了状況
- テスト実行ログ

## 出力
- レビュー所見と修正指示
- Reflection / Meta フェーズへ伝える残課題とテスト要否
- Meta 反映後の最終差分確認ログと通知要否の判断
- コミットメッセージ案と push 直前チェックリスト（最終確認結果を含む）

## 実行ステップ
1. `git status` / `git diff` を用いて変更ファイルを精査し、仕様逸脱・テスト欠如・スタイル崩れを `03_review.md` に記録する。Reflection / Meta で追加変更が想定される箇所は明示しておく。
2. 指摘に基づき必要な修正・追記を行い、テスト結果を確認して `tasks.md` のステータスを更新する。修正が完了したら一度 `git status` を確認し、未整理の差分が残っていないか把握する。
3. Reflection Logger / Meta Generator フェーズでドキュメントやプロンプトが更新された後に再度 `git status` / `git diff` を確認し、最終差分と Meta 反映結果を `03_review.md` に追記する。必要なら差分を調整し、コミット対象を確定させる。
4. コミットメッセージ案と残課題を整理し、通知有無（Discord / Docs 更新）と push 前チェックリスト（テスト状況・未解決事項・次アクション）を Orchestrator へ連携する。

## 更新対象
- tasks.md
- .workflow-sessions/
