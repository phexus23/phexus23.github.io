"""
Rebuilds the two scraped game-source catalogs from the freebuisness zones feed.

Source #1 -> json/source1.json
    Every zone in zones.json becomes an entry with:
      - a cover image downloaded into assets/img/{slug}_{id}.png
      - a play URL on the genizymath.github.io/iframe/ mirror.
    The wrapper files on that mirror are byte-identical to the freebuisness/html
    repo (same zone ids), but genizymath serves them as text/html so iframes
    actually render them — the jsdelivr html@main copies come back as
    text/plain and browsers refuse to frame them.

Source #2 -> json/source2.json
    The wrapper files in Vafor_IT/source2/ (downloaded by download_source2.py)
    keep their catalog as-is, but any entry without a real cover gets the same
    covers@main/{id}.png art back-filled, keyed by zone id. Source #1 and
    Source #2 entries for the same zone share one image file.

Main games (json/list.json, local folders in gxmes/ and Vafor_IT/) are NOT
touched by this script. Run download_source2.py separately to refresh the
Source #2 wrapper files themselves.
"""
import json
import os
import re
import sys
import urllib.request
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
zones_url = "https://cdn.jsdelivr.net/gh/freebuisness/assets@main/zones.json"
cover_base = "https://cdn.jsdelivr.net/gh/freebuisness/covers@main"
html_base = "https://cdn.jsdelivr.net/gh/freebuisness/html@main"
IFRAME_BASE = "https://genizymath.github.io/iframe/{file}"

images_dir = HERE / "assets" / "img"
json_dir = HERE / "json"
source1_path = json_dir / "source1.json"
source2_path = json_dir / "source2.json"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

skip_names = {"[!] SUGGEST GAMES .gg/D4c9VFYWyU", "[!] COMMENTS"}


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def download_to(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
        tmp = path.with_suffix(path.suffix + ".part")
        with open(tmp, "wb") as f:
            f.write(resp.read())
        tmp.replace(path)


def slugify(name):
    s = name.lower()
    s = s.replace(" ", "-")
    s = s.replace("_", "-")
    s = "".join(c for c in s if c.isalnum() or c in "-_")
    s = s.strip("-_")
    # School filters commonly keyword-match "game"/"unblocked" in the URL
    # path itself, so new slugs never carry either word going forward.
    # `games?` (not a literal "-game-") so it also catches it embedded in
    # a larger word (e.g. "gamecube" -> "cube") and the plural ("games").
    s = re.sub(r"unblocked", "", s)
    s = re.sub(r"games?", "", s)
    s = re.sub(r"-{2,}", "-", s).strip("-_")
    return s or "gxme"


def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))


def load_json(path, fallback):
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            safe_print(f"  Could not parse {path.name}: {e}")
    return fallback


def build_source1(zones):
    entries = []
    covers = []  # (zone_id, slug, cover_url)
    used_slugs = {}

    for zone in zones:
        name = zone.get("name", "")
        if name in skip_names:
            continue

        zone_id = zone.get("id")
        zone_url = zone.get("url", "")
        # Only games hosted in the html repo are playable via the mirror;
        # external urls (e.g. the discord invite) are not games.
        if not zone_url.startswith("{HTML_URL}/"):
            continue

        file = zone_url[len("{HTML_URL}/"):]
        slug = slugify(name)
        n = used_slugs.get(slug, 0)
        used_slugs[slug] = n + 1
        folder = slug if n == 0 else f"{slug}-{n}"
        cover_url = zone.get("cover", "").replace("{COVER_URL}", cover_base).replace("{COVER_URL}/", cover_base + "/")

        entries.append({
            "source": "Source #1",
            "id": zone_id,
            "name": name,
            "slug": slug,
            "foldername": folder,
            "imgsrc": None,  # filled in once covers are downloaded
            "linksrc": "/gxmes/",
            "file": IFRAME_BASE.format(file=file),
            "category": "Classroom",
        })
        if cover_url:
            covers.append((zone_id, slug, cover_url))

    return entries, covers


def download_covers(covers):
    """Download covers@main/{id}.png as assets/img/{slug}_{id}.png.
    Returns {(zone_id, slug): local filename} for every cover that exists."""
    images_dir.mkdir(parents=True, exist_ok=True)
    found = {}
    done = 0

    def grab(item):
        zone_id, slug, cover_url = item
        filename = f"{slug}_{zone_id}.png"
        path = images_dir / filename
        if path.exists():
            return filename, "exists"
        try:
            download_to(cover_url, path)
            return filename, "downloaded"
        except Exception:
            return filename, "failed"

    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(grab, c): c for c in covers}
        for fut in as_completed(futures):
            filename, status = fut.result()
            done += 1
            if status != "failed":
                found[filename] = True
            if done % 100 == 0:
                safe_print(f"  covers: {done}/{len(covers)}")

    return found


def backfill_source2_covers(source2_games, available_covers):
    """Give Source #2 entries a real cover keyed by zone id; same files Source #1 uses."""
    updated = 0
    for game in source2_games:
        zone_id = game.get("id")
        slug = game.get("slug")
        if zone_id is None or not slug:
            continue
        filename = f"{slug}_{zone_id}.png"
        if filename in available_covers and not (game.get("imgsrc") or "").startswith("/assets/img/"):
            game["imgsrc"] = f"/assets/img/{filename}"
            updated += 1
    return updated


def main():
    safe_print("Fetching zones.json...")
    zones = json.loads(fetch_text(zones_url))
    safe_print(f"Found {len(zones)} zones")

    source1_entries, covers = build_source1(zones)
    safe_print(f"Source #1 catalog: {len(source1_entries)} playable games, {len(covers)} covers to fetch")

    available_covers = download_covers(covers)
    safe_print(f"Covers present: {len(available_covers)}")

    for entry in source1_entries:
        filename = f"{entry['slug']}_{entry['id']}.png"
        if filename in available_covers:
            entry["imgsrc"] = f"/assets/img/{filename}"

    with open(source1_path, "w", encoding="utf-8") as f:
        json.dump(source1_entries, f, indent=2, ensure_ascii=False)
    safe_print(f"Wrote {source1_path.name} ({len(source1_entries)} games)")

    source2_games = load_json(source2_path, [])
    if source2_games:
        updated = backfill_source2_covers(source2_games, available_covers)
        with open(source2_path, "w", encoding="utf-8") as f:
            json.dump(source2_games, f, indent=2, ensure_ascii=False)
        with_real = sum(1 for g in source2_games if (g.get("imgsrc") or "").startswith("/assets/img/"))
        safe_print(f"Source #2: back-filled {updated} covers ({with_real}/{len(source2_games)} entries now have real art)")

    safe_print("\nDone. No new game pages were created, so the sitemap is unchanged.")


if __name__ == "__main__":
    sys.exit(main())
