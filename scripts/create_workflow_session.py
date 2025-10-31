#!/usr/bin/env python3
"""
Workflow session auto generator.

このスクリプトは `.workflow-sessions/.template/` をコピーして、新しいセッションディレクトリを自動生成します。
生成後は `session_status.json` のタイムスタンプとメタデータを最新化します。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import unicodedata
from pathlib import Path
from typing import Optional


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    cleaned = re.sub(r"[^0-9A-Za-z\-_/]+", "-", normalized)
    cleaned = cleaned.replace("/", "-").replace("_", "-")
    cleaned = re.sub(r"-+", "-", cleaned)
    cleaned = cleaned.strip("-").lower()
    return cleaned or "session"


def build_session_name(topic: str, base_date: Optional[str] = None) -> str:
    today = base_date or dt.datetime.now(dt.timezone.utc).astimezone().strftime("%Y%m%d")
    slug = slugify(topic)
    return f"{today}_{slug}"


def ensure_unique_path(base_dir: Path, session_name: str) -> Path:
    candidate = base_dir / session_name
    counter = 1
    while candidate.exists():
        candidate = base_dir / f"{session_name}-{counter}"
        counter += 1
    return candidate


def copy_template(template_dir: Path, target_dir: Path) -> None:
    shutil.copytree(template_dir, target_dir)


def update_session_status(session_dir: Path, owner: str) -> None:
    status_path = session_dir / "session_status.json"
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    if status_path.exists():
        with status_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {
            "state": "planning",
            "owner": owner,
            "created_at": now_iso,
            "updated_at": now_iso,
            "notes": [],
        }

    data["state"] = "planning"
    data["owner"] = owner
    data["created_at"] = now_iso
    data["updated_at"] = now_iso
    data.setdefault("notes", [])

    with status_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a new workflow session from template.")
    parser.add_argument(
        "topic",
        nargs="?",
        default="codex_session",
        help="セッションのトピック（例: codex_restructure）。省略時は codex_session。",
    )
    parser.add_argument(
        "--owner",
        default="codex",
        help="session_status.json に記録するオーナー名（既定: codex）",
    )
    parser.add_argument(
        "--date",
        help="セッション名に使う日付 (YYYYMMDD)。省略時は現在日付。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="実際にはディレクトリを作成せず、生成されるパスを表示する。",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    root = project_root()
    template_dir = root / ".workflow-sessions" / ".template"
    if not template_dir.exists():
        print(f"[error] テンプレートディレクトリが見つかりません: {template_dir}", file=sys.stderr)
        return 1

    base_dir = root / ".workflow-sessions"
    base_dir.mkdir(parents=True, exist_ok=True)

    session_name = build_session_name(args.topic, args.date)
    target_dir = ensure_unique_path(base_dir, session_name)

    if args.dry_run:
        print(f"[dry-run] 新規セッションは {target_dir.relative_to(root)} に作成されます。")
        return 0

    copy_template(template_dir, target_dir)
    update_session_status(target_dir, args.owner)

    print(f"[ok] 新しいセッションを作成しました: {target_dir.relative_to(root)}")
    print("      session_status.json のタイムスタンプと owner を更新済みです。")
    print("      作業ログを開始するにはテンプレート内の各ファイルへ詳細を追記してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
