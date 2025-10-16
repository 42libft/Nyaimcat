#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[stop-bots] %s\n' "$*"
}

STATE_DIR=".runtime"
PID_DIR="$STATE_DIR/pids"
NODE_PID_FILE="$PID_DIR/node.pid"
PYTHON_PID_FILE="$PID_DIR/python.pid"

PS_AVAILABLE=1
if ! ps -Ao pid= >/dev/null 2>&1; then
  PS_AVAILABLE=0
  log "プロセス一覧を取得できなかったため、PIDファイル以外の検出をスキップします。"
fi

read_pid_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  tr -d '[:space:]' <"$file"
}

is_pid_active() {
  local pid="$1"
  if [ -z "${pid:-}" ]; then
    return 1
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

remove_pid_file() {
  local file="$1"
  rm -f "$file"
}

stopped_any=0

handled_pids=""

mark_pid_handled() {
  local pid="$1"
  handled_pids="${handled_pids} ${pid}"
}

pid_handled() {
  local pid="$1"
  case " ${handled_pids} " in
    *" ${pid} "*) return 0 ;;
    *) return 1 ;;
  esac
}

stop_process() {
  local name="$1"
  local file="$2"
  local mode="${3:-single}"

  if [ ! -f "$file" ]; then
    log "$name のPIDファイルが見つかりませんでした。"
    return
  fi

  local pid
  pid="$(read_pid_file "$file")"

  if ! is_pid_active "$pid"; then
    log "$name は稼働していません (PID: ${pid:-unknown})。"
    remove_pid_file "$file"
    return
  fi

  log "$name を停止します (PID: $pid)"
  stopped_any=1

  if [ "$mode" = "group" ]; then
    kill -- -"$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" >/dev/null 2>&1 || true
  fi

  for _ in {1..10}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "$name が停止しないため SIGKILL を送信します (PID: $pid)"
    if [ "$mode" = "group" ]; then
      kill -9 -- -"$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
    else
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    sleep 0.5
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "$name の終了を確認できませんでした (PID: $pid)。手動で確認してください。"
  else
    log "$name を停止しました。"
  fi

  mark_pid_handled "$pid"
  remove_pid_file "$file"
}

stop_pid() {
  local name="$1"
  local pid="$2"
  local mode="${3:-single}"
  local context="${4:-manual}"

  if pid_handled "$pid"; then
    return
  fi

  if [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ]; then
    return
  fi

  log "$name を停止します (PID: $pid, source: $context)"
  stopped_any=1

  if [ "$mode" = "group" ]; then
    kill -- -"$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" >/dev/null 2>&1 || true
  fi

  for _ in {1..10}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "$name が停止しないため SIGKILL を送信します (PID: $pid, source: $context)"
    if [ "$mode" = "group" ]; then
      kill -9 -- -"$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
    else
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    sleep 0.5
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "$name の終了を確認できませんでした (PID: $pid)。手動で確認してください。"
  else
    log "$name を停止しました。"
  fi

  mark_pid_handled "$pid"
}

list_matching_pids() {
  local keyword="$1"
  if [ "$PS_AVAILABLE" -ne 1 ]; then
    return
  fi
  ps -Ao pid=,command= 2>/dev/null | awk -v kw="$keyword" '
    {
      pid=$1
      $1=""
      sub(/^ +/, "", $0)
      cmd=$0
      if (pid ~ /^[0-9]+$/ && index(cmd, kw)) {
        print pid
      }
    }
  '
}

stop_matching_processes() {
  local name="$1"
  local mode="$2"
  shift 2

  if [ "$PS_AVAILABLE" -ne 1 ]; then
    return
  fi

  local keyword
  local found=0

  for keyword in "$@"; do
    while IFS= read -r pid; do
      [ -z "${pid:-}" ] && continue
      if pid_handled "$pid"; then
        continue
      fi
      stop_pid "$name" "$pid" "$mode" "keyword:${keyword}"
      found=1
    done < <(list_matching_pids "$keyword")
  done

  if [ "$found" -eq 0 ]; then
    log "$name の追加プロセスは見つかりませんでした。"
  fi
}

stop_process "Python Bot" "$PYTHON_PID_FILE" "single"
stop_process "Node.js Bot" "$NODE_PID_FILE" "group"

stop_matching_processes "Python Bot" "single" \
  "src.esclbot.bot"

stop_matching_processes "Node.js Bot" "group" \
  "bot-runtime/dist/index.js" \
  "bot-runtime/src/index.ts" \
  "ts-node-dev" \
  "npm run dev"

if [ "$stopped_any" -eq 0 ]; then
  log "稼働中のBotプロセスは見つかりませんでした。"
fi
