# ESCL Scrim Collector Discord Bot (Python)

Collect 6 games of **ESCL** scrim "Detailed Results (copy)" text and export a single CSV (Google Sheets-friendly).
Supports **text paste**, **file attachment (.txt/.tsv)**, and **URL (best-effort extraction)**.

## Quick Start

1) Python 3.10+ recommended
2) Install deps
```bash
pip install -r requirements.txt
```
3) Create `.env` from example and set your token
```bash
cp .env.example .env
# edit .env to put DISCORD_TOKEN=...
```
4) Run the bot
```bash
python -m src.esclbot.bot
```

## Slash Commands

- `/escl_new [scrim_group] [scrim_url]` — start a session (per guild/channel/user)
- `/escl_add [url] [text] [file]` — add one game by **URL**, **text**, or **attachment** (choose one)
- `/escl_list` — show progress
- `/escl_clear` — clear the current session
- `/escl_finish` — when 6 games are added, export a single CSV

> The bot prioritizes **text paste** reliability. URL extraction is best-effort and may fall back to asking for the copied text.

## Output
- A single CSV with headers matching ESCL’s table, plus meta columns:
  - `scrim_group`, `scrim_id`, `game_no`
- UTF-8 with headers row; opens cleanly in Google Sheets.

## Deploy
- Local: run the module as above
- Docker (optional): you can add a simple Dockerfile; PRs welcome
