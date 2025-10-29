#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VENV_DIR="$ROOT_DIR/.venv"
PYTHON_BIN=""

log() {
  printf '[run-admin-api] %s\n' "$*"
}

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
  elif command -v python >/dev/null 2>&1; then
    printf 'python'
  else
    echo "[error] python / python3 が見つかりません。Python をインストールしてください。" >&2
    exit 1
  fi
}

resolve_venv_python() {
  if [ -x "$VENV_DIR/bin/python" ]; then
    PYTHON_BIN="$VENV_DIR/bin/python"
    return 0
  fi

  if [ -x "$VENV_DIR/Scripts/python.exe" ]; then
    PYTHON_BIN="$VENV_DIR/Scripts/python.exe"
    return 0
  fi

  return 1
}

create_venv() {
  local system_python
  system_python="$(find_python)"
  log "Python 仮想環境を作成します: $VENV_DIR"
  "$system_python" -m venv "$VENV_DIR"
}

ensure_python_env() {
  if [ ! -d "$VENV_DIR" ]; then
    create_venv
  fi

  if ! resolve_venv_python; then
    log "既存の仮想環境が壊れているようです。再作成します。"
    rm -rf "$VENV_DIR"
    create_venv
    resolve_venv_python || {
      echo "[error] 仮想環境を初期化できませんでした。" >&2
      exit 1
    }
  fi

  log "Python 依存関係を確認します。"
  "$PYTHON_BIN" -m pip install --upgrade pip >/dev/null 2>&1 || true
  "$PYTHON_BIN" -m pip install --disable-pip-version-check -r requirements.txt
}

verify_python_deps() {
  "$PYTHON_BIN" - <<'PY' || exit 1
import sys

missing = []
for module in ("fastapi", "uvicorn"):
    try:
        __import__(module)
    except Exception:
        missing.append(module)

if missing:
    print("[error] 必要な Python パッケージが見つかりません: {}".format(", ".join(missing)), file=sys.stderr)
    print("[hint] 例: python -m pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)
PY
}

ensure_python_env
export PYTHONPATH="$ROOT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"
if [ -z "${NYAIMLAB_CONFIG_SYNC:-}" ]; then
  export NYAIMLAB_CONFIG_SYNC=1
fi
if [ -z "${NYAIMLAB_CONFIG_PATH:-}" ]; then
  export NYAIMLAB_CONFIG_PATH="$ROOT_DIR/bot-runtime/config/config.yaml"
fi
verify_python_deps

TOKEN="$("$PYTHON_BIN" - <<'PY'
import secrets

token = secrets.token_urlsafe(32)
print(token)
PY
)"

export API_AUTH_TOKEN="$TOKEN"

log "管理トークンを発行しました。"
log "API_AUTH_TOKEN=${API_AUTH_TOKEN}"
log "ダッシュボードのログインフォーム「管理トークン」に上記の値を入力してください。"
log "サーバーを停止するには Ctrl + C を押してください。"

"$PYTHON_BIN" -m src.nyaimlab "$@"
