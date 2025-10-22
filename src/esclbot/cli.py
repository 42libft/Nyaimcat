"""Command line utilities for invoking ESCL bot features from other runtimes."""
from __future__ import annotations

import argparse
import base64
import contextlib
import io
import json
import sys
from typing import Any, Dict, Optional

import pandas as pd

from .api_scraper import (
    collect_csv_from_parent_url,
    get_scrim_name,
    parse_scrim_group_from_url,
)
from .bot import __BOT_VERSION__
from .reports import (
    aggregate_player_totals,
    aggregate_team_totals,
    safe_filename_component,
)


def _title_from_parent(parent_url: str, group: str) -> str:
    with contextlib.redirect_stdout(io.StringIO()):
        scrim_uuid, group_uuid = parse_scrim_group_from_url(parent_url)
    scrim_name = get_scrim_name(scrim_uuid, group_uuid) or "ESCL_Scrim"
    title = f"{safe_filename_component(scrim_name)}_{safe_filename_component(group)}".rstrip("_")
    return title or "ESCL_Scrim"


def _encode_dataframe_to_csv(df: pd.DataFrame) -> bytes:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")


def _build_xlsx(df_all: pd.DataFrame) -> bytes:
    mem = io.BytesIO()
    with pd.ExcelWriter(mem, engine="xlsxwriter") as writer:
        for g in sorted(set(df_all["game"].dropna().astype(int))):
            dfg = df_all[df_all["game"] == g]
            dfg.to_excel(writer, sheet_name=f"GAME{g}", index=False)

        player_totals = aggregate_player_totals(df_all)
        player_totals.to_excel(writer, sheet_name="ALL_GAMES", index=False)

        team_totals = aggregate_team_totals(df_all)
        team_totals.to_excel(writer, sheet_name="TEAM_TOTALS", index=False)

    mem.seek(0)
    return mem.read()


def _collect(parent_url: str, group: str) -> pd.DataFrame:
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        return collect_csv_from_parent_url(parent_url, group, 6)


def _respond(payload: Dict[str, Any], *, error: bool = False) -> None:
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(1 if error else 0)


def _cmd_version() -> None:
    _respond({"ok": True, "version": __BOT_VERSION__})


def _cmd_csv(parent_url: str, group: Optional[str]) -> None:
    group_value = group or ""
    df = _collect(parent_url, group_value)
    csv_bytes = _encode_dataframe_to_csv(df)
    title = _title_from_parent(parent_url, group_value)
    _respond(
        {
            "ok": True,
            "filename": f"{title}.csv",
            "content": base64.b64encode(csv_bytes).decode("ascii"),
        }
    )


def _cmd_xlsx(parent_url: str, group: Optional[str]) -> None:
    group_value = group or ""
    df = _collect(parent_url, group_value)
    xlsx_bytes = _build_xlsx(df)
    title = _title_from_parent(parent_url, group_value)
    _respond(
        {
            "ok": True,
            "filename": f"{title}.xlsx",
            "content": base64.b64encode(xlsx_bytes).decode("ascii"),
        }
    )


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m src.esclbot.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("version", help="ESCL Bot のバージョン情報を表示")

    csv_parser = sub.add_parser(
        "csv", help="スクラムからCSVを生成（ALL_GAMES相当の生データ）"
    )
    csv_parser.add_argument("parent_url", help="グループページURL")
    csv_parser.add_argument("--group", default="", help="任意のグループ名（例: G5）")

    xlsx_parser = sub.add_parser(
        "xlsx", help="スクラムからExcelを生成（ALL_GAMES/TEAM_TOTALS付き）"
    )
    xlsx_parser.add_argument("parent_url", help="グループページURL")
    xlsx_parser.add_argument("--group", default="", help="任意のグループ名（例: G5）")

    args = parser.parse_args(argv)

    try:
        if args.command == "version":
            _cmd_version()
        elif args.command == "csv":
            _cmd_csv(args.parent_url, args.group)
        elif args.command == "xlsx":
            _cmd_xlsx(args.parent_url, args.group)
        else:
            raise ValueError(f"unknown command: {args.command}")
    except Exception as exc:  # noqa: BLE001
        _respond({"ok": False, "error": str(exc)}, error=True)


if __name__ == "__main__":
    main()
