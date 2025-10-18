# dump_escl_api.py  — リクエスト/レスポンスの両方を保存する版
from pathlib import Path
from playwright.sync_api import sync_playwright
import re, sys, json, time
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTDIR = REPO_ROOT / "data" / "escl" / "raw"
DEFAULT_OUTDIR.mkdir(parents=True, exist_ok=True)

GROUP_URL = sys.argv[1] if len(sys.argv) > 1 else ""
if not GROUP_URL:
    print("Usage: python dump_escl_api.py <GROUP_PAGE_URL>")
    sys.exit(1)

OUTDIR = DEFAULT_OUTDIR

def is_json_response(resp):
    try:
        ct = resp.headers.get("content-type", "")
    except Exception:
        ct = ""
    return ("application/json" in ct.lower()) or ("+json" in ct.lower())

def safe_filename(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s[:200]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context(viewport={"width": 1400, "height": 900},
                              user_agent="Mozilla/5.0 (ESCL API Dump)")
    page = ctx.new_page()

    def on_response(resp):
        try:
            url = resp.url
            rtype = resp.request.resource_type
        except Exception:
            return
        if rtype not in ("xhr", "fetch"):
            return

        ts = time.strftime("%Y%m%d-%H%M%S")
        parsed = urlparse(url)
        base = safe_filename(parsed.netloc + parsed.path)
        json_path = OUTDIR / f"{ts}_{base}.json"
        meta_path = OUTDIR / f"{ts}_{base}.meta.txt"

        # メタ（リクエスト/レスポンス）も保存
        try:
            req = resp.request
            with meta_path.open("w", encoding="utf-8") as mf:
                mf.write(f"URL: {url}\nMETHOD: {req.method}\nSTATUS: {resp.status}\n")
                mf.write("REQ_HEADERS:\n")
                for k,v in (req.headers or {}).items():
                    vv = v
                    if k.lower() in ("cookie", "authorization"):
                        vv = "<masked>"
                    mf.write(f"{k}: {vv}\n")
                body = None
                try:
                    body = req.post_data
                except Exception:
                    body = None
                if body:
                    mf.write("\nREQ_BODY:\n")
                    mf.write(body if isinstance(body, str) else str(body))
                mf.write("\n\nRESP_HEADERS:\n")
                for k,v in (resp.headers or {}).items():
                    mf.write(f"{k}: {v}\n")
        except Exception:
            pass

        # JSON（っぽいもの）も保存
        try:
            body_bytes = resp.body()
            if not body_bytes:
                return
            if is_json_response(resp):
                with json_path.open("wb") as f:
                    f.write(body_bytes)
                print(f"[DUMP] {url} -> {json_path}")
            else:
                # text/plain だが実体がJSONのケースもある
                txt = body_bytes.decode("utf-8", errors="ignore")
                if "{" in txt or "[" in txt:
                    with json_path.open("w", encoding="utf-8") as f:
                        f.write(txt)
                    print(f"[DUMP as text] {url} -> {json_path}")
        except Exception:
            pass

    page.on("response", on_response)

    print("[OPEN]", GROUP_URL)
    page.goto(GROUP_URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    def click_game(i: int):
        for loc in [
            page.get_by_role("tab", name=re.compile(rf"^GAME\s*{i}\b", re.I)).first,
            page.get_by_text(re.compile(rf"^GAME\s*{i}\b", re.I)).first,
            page.locator(f"text=GAME {i}").first,
            page.locator(f"text=GAME{i}").first,
        ]:
            try:
                loc.click(timeout=1500)
                return True
            except Exception:
                continue
        return False

    for i in range(1, 7):
        ok = click_game(i)
        print(f"[TAB] GAME {i} -> {'clicked' if ok else 'skip'}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

    browser.close()

print("\nDumped files in:", OUTDIR)
