"""
Rebuilds the merged scraped game catalog from the freebuisness zones feed.

json/source1.json
    Every zone in zones.json becomes one entry with:
      - a cover image downloaded into assets/img/{slug}_{id}.png
      - a play URL: the self-hosted wrapper in Vafor_IT/source2/ when
        download_source2.py has fetched one for that zone id (more reliable —
        it lives in this repo), otherwise the genizymath.github.io/iframe/
        mirror URL for the same wrapper (the mirror serves the freebuisness/html
        files as text/html so iframes render them; the jsdelivr html@main
        copies come back text/plain and browsers refuse to frame those).
    Both routes serve byte-identical wrappers keyed by zone id, so the two
    former catalogs (source1/source2) were the same games twice — they are
    one merged catalog now.

Main games (json/list.json, local folders in gxmes/ and Vafor_IT/) are NOT
touched by this script. json/source2.json is kept as the id->wrapper-file
lookup this script reads; refresh it with download_source2.py.
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


def wrapper_is_junk(url):
    """True when the mirror has no real wrapper for this zone (404 or the
    "Couldn't find" stub page) — same heuristic download_source2.py uses.
    Such games are dead upstream and get flagged missing so the site skips
    them instead of showing "This game is unavailable"."""
    try:
        html = fetch_text(url)
    except Exception:
        return True
    return "Couldn't find" in html[:200]


def build_source1(zones, wrapper_files):
    """wrapper_files maps zone id -> local wrapper path (/Vafor_IT/source2/...)"""
    entries = []
    covers = []  # (zone_id, slug, cover_url)
    junk_zones = []
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

        # Prefer our own wrapper file when download_source2.py fetched one;
        # fall back to the mirror URL for zones it missed or failed on.
        play_url = wrapper_files.get(zone_id) or IFRAME_BASE.format(file=file)

        entries.append({
            "source": "Source #1",
            "id": zone_id,
            "name": name,
            "slug": slug,
            "foldername": folder,
            "imgsrc": None,  # filled in once covers are downloaded
            "linksrc": "/gxmes/",
            "file": play_url,
            "category": "Classroom",
        })
        if cover_url:
            covers.append((zone_id, slug, cover_url))

    # Zones with no self-hosted wrapper may be dead upstream (the mirror
    # 404s or serves its "Couldn't find" stub). Probe just those few and
    # flag the dead ones missing so the site filters them out.
    mirror_only = [e for e in entries if not e["file"].startswith("/Vafor_IT/")]
    for entry in mirror_only:
        if wrapper_is_junk(entry["file"]):
            entry["missing"] = True
            junk_zones.append(entry["name"])
            safe_print(f"  Missing upstream: {entry['name']} ({entry['file']})")
    if junk_zones:
        safe_print(f"Flagged {len(junk_zones)} games missing (dead upstream): {junk_zones}")

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


def main():
    safe_print("Fetching zones.json...")
    zones = json.loads(fetch_text(zones_url))
    safe_print(f"Found {len(zones)} zones")

    # Zone id -> local wrapper file, from the download_source2.py catalog.
    # Zones with a wrapper here play from our own hosting; the rest fall
    # back to the genizymath mirror URL.
    source2_games = load_json(source2_path, [])
    wrapper_files = {
        g["id"]: g["file"]
        for g in source2_games
        if g.get("id") is not None and g.get("file") and not g.get("missing")
    }
    safe_print(f"Self-hosted wrappers available: {len(wrapper_files)}")

    source1_entries, covers = build_source1(zones, wrapper_files)
    from_wrapper = sum(1 for e in source1_entries if e["file"].startswith("/Vafor_IT/"))
    from_mirror = len(source1_entries) - from_wrapper
    safe_print(f"Merged catalog: {len(source1_entries)} playable games ({from_wrapper} self-hosted, {from_mirror} via mirror), {len(covers)} covers to fetch")

    available_covers = download_covers(covers)
    safe_print(f"Covers present: {len(available_covers)}")

    for entry in source1_entries:
        filename = f"{entry['slug']}_{entry['id']}.png"
        if filename in available_covers:
            entry["imgsrc"] = f"/assets/img/{filename}"

    with open(source1_path, "w", encoding="utf-8") as f:
        json.dump(source1_entries, f, indent=2, ensure_ascii=False)
    safe_print(f"Wrote {source1_path.name} ({len(source1_entries)} games)")

    safe_print("\nDone. No new game pages were created, so the sitemap is unchanged.")


if __name__ == "__main__":
    sys.exit(main())
