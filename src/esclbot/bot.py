# src/esclbot/bot.py （末尾のコマンド群のあたりに追記）
from .scraper import extract_text_from_url, guess_scrim_id, find_game_urls_from_parent
from .parser import parse_pasted_text
import pandas as pd
import io

@BOT.tree.command(name="escl_from_parent", description="親ページURLから自動でG1〜G6を収集してCSVを返す（貼付不要）")
@app_commands.describe(parent_url="その日のスクリム親ページURL（例: https://fightnt.escl.co.jp/scrims/<scrimId>/...）", scrim_group="G1〜G5（任意）")
async def escl_from_parent(inter: discord.Interaction, parent_url: str, scrim_group: Optional[str] = None):
    await inter.response.defer(thinking=True, ephemeral=False)

    urls = find_game_urls_from_parent(parent_url, limit=6)
    if not urls:
        await inter.followup.send("親ページからゲームURLを見つけられませんでした。URLが正しいか確認してください。")
        return

    rows = []
    sid = guess_scrim_id(parent_url)
    for i, url in enumerate(urls, start=1):
        txt = extract_text_from_url(url)
        if not txt:
            await inter.followup.send(f"ゲーム{i}の抽出に失敗：{url}\nページの「詳細な試合結果をコピー」でテキスト貼付なら確実です。")
            return
        df = parse_pasted_text(txt)
        df.insert(0, "game_no", i)
        df.insert(0, "scrim_id", sid or "")
        df.insert(0, "scrim_group", scrim_group or "")
        rows.append(df)

    df_all = pd.concat(rows, ignore_index=True)
    buf = io.StringIO()
    df_all.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    fname = f"ESCL_{(scrim_group or 'G?')}_{(sid or 'unknown')}.csv"
    await inter.followup.send(content="CSVを生成しました。", file=discord.File(data, filename=fname))

@BOT.tree.command(name="escl_from_urls", description="ゲームURLを1〜6個まとめて渡してCSVを返す（改行/空白区切り）")
@app_commands.describe(urls="ゲームURLを空白または改行で区切って1〜6個（G1〜G6）", scrim_group="G1〜G5（任意）")
async def escl_from_urls(inter: discord.Interaction, urls: str, scrim_group: Optional[str] = None):
    await inter.response.defer(thinking=True, ephemeral=False)

    # 改行や空白で分割 → 最大6件
    candidates = [u.strip() for u in re.split(r"[\s,]+", urls) if u.strip()]
    candidates = candidates[:6]
    if not candidates:
        await inter.followup.send("URLが見つかりませんでした。")
        return

    rows = []
    sid = guess_scrim_id(candidates[0])
    for i, url in enumerate(candidates, start=1):
        if not re.match(r"^https?://", url):
            await inter.followup.send(f"URL形式エラー: {url}")
            return
        txt = extract_text_from_url(url)
        if not txt:
            await inter.followup.send(f"ゲーム{i}の抽出に失敗：{url}\nページの「詳細な試合結果をコピー」でテキスト貼付なら確実です。")
            return
        df = parse_pasted_text(txt)
        df.insert(0, "game_no", i)
        df.insert(0, "scrim_id", sid or "")
        df.insert(0, "scrim_group", scrim_group or "")
        rows.append(df)

    df_all = pd.concat(rows, ignore_index=True)
    buf = io.StringIO()
    df_all.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    fname = f"ESCL_{(scrim_group or 'G?')}_{(sid or 'unknown')}.csv"
    await inter.followup.send(content="CSVを生成しました。", file=discord.File(data, filename=fname))

