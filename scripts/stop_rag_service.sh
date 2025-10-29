#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.runtime/rag/service.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[stop-rag] service.pid が見つかりません。既に停止している可能性があります。"
  exit 0
fi

PID="$(tr -d '[:space:]' <"$PID_FILE")"
if [ -z "$PID" ]; then
  echo "[stop-rag] PID が空です。ファイルを削除します。"
  rm -f "$PID_FILE"
  exit 0
fi

if kill -0 "$PID" >/dev/null 2>&1; then
  echo "[stop-rag] RAG サービスを停止します (PID: $PID)"
  kill "$PID" >/dev/null 2>&1 || true
  wait "$PID" >/dev/null 2>&1 || true
else
  echo "[stop-rag] PID $PID は稼働していません。"
fi

rm -f "$PID_FILE"
echo "[stop-rag] 完了しました。"
