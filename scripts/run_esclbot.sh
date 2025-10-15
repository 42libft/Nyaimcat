#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "python3 または python コマンドが見つかりません。" >&2
    exit 1
  fi
fi

if [ ! -d ".venv" ]; then
  echo "[setup] 仮想環境 .venv を作成します。"
  "$PYTHON_BIN" -m venv .venv
fi

if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
  # Windows (Git Bash 等)
  # shellcheck disable=SC1091
  source .venv/Scripts/activate
else
  echo "仮想環境の activate スクリプトが見つかりません (.venv)。" >&2
  exit 1
fi

echo "[setup] 依存パッケージを確認します。"
pip install --upgrade pip >/dev/null
pip install -r requirements.txt

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "[notice] .env を作成しました。DISCORD_TOKEN を設定してください。"
    echo "[notice] 設定後にもう一度スクリプトを実行してください。"
    exit 0
  else
    echo "[error] .env がありません。DISCORD_TOKEN を設定してください。" >&2
    exit 1
  fi
fi

echo "[run] Discord Bot を起動します。"
python -m src.esclbot.bot "$@"
