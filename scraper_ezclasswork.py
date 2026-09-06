"""
Rebuilds the Source #2 catalog (json/ezclasswork.json) from the live
EZClasswork Google Site (https://sites.google.com/view/ezclasswork/).

Where the data comes from:
  - The site's sidebar nav (present on every page) lists every game page as
    /view/ezclasswork/{slug} with its display name. That is the game list.
  - The content grids on the paginated index pages (home, /2, /3, ...) pair
    each game link with a real thumbnail image
    (lh3.googleusercontent.com/sitesv/...). Those are downloaded into
    assets/img/ezclasswork/{slug}.png; entries the grids don't show keep
    imgsrc empty and the site falls back to its generated placeholder.
  - Play URLs: every game page embeds its game through a Google Apps Script
    deployment (https://script.google.com/macros/s/{id}/exec), which serves
    text/html with no X-Frame-Options so it renders fine in an iframe.
    Deployments rarely change, so embed URLs are reused from the previous
    json/ezclasswork.json and only newly-discovered games require a fetch of
    their game page to extract the macro URL.
  - Art fallback: games the content grids don't show (mostly older pages)
    still get art when their embed is a GameMonetize SDK setup. The embed
    shell carries the SDK's gameId, and GameMonetize serves a per-game
    thumbnail at https://img.gamemonetize.com/{gameId}/512x384.jpg. The
    downloaded bytes are validated (image magic) because the image host
    answers with an HTML error page, not a 404, for unknown ids.

Main games (json/list.json) and the genizymath catalog (json/source1.json,
built by scraper.py) are NOT touched by this script.
"""
import json
import re
import urllib.request
import urllib.parse
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

GM_THUMB_URL = "https://img.gamemonetize.com/{game_id}/512x384.jpg"

HERE = Path(__file__).resolve().parent
SITE_BASE = "https://sites.google.com/view/ezclasswork"

json_dir = HERE / "json"
catalog_path = json_dir / "ezclasswork.json"
images_dir = HERE / "assets" / "img" / "ezclasswork"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

HEADERS = {"User-Agent": "Mozilla/5.0"}

# Pagination links in the nav render as "Page 2", "Page 3", ... — a numeric
# slug alone is NOT pagination (games like /2048 are real game pages).
PAGINATION_RE = re.compile(
    r'<a[^>]*href="/view/ezclasswork/(\d+)"[^>]*>\s*Page\s*\d+\s*</a>'
)
# /view/ezclasswork/{slug} with the nav's display name.
NAV_LINK_RE = re.compile(
    r'<a[^>]*href="(/view/ezclasswork/[^"]+)"[^>]*>\s*([^<]+?)\s*</a>'
)
# Content-grid pair: a game link immediately followed by its thumbnail.
# Thumbnails are /sitesv/{base64}={size} URLs — the {size} (e.g. "=w1280")
# suffix is required (requesting the bare token 400s), so it's kept verbatim.
GRID_PAIR_RE = re.compile(
    r'href="/view/ezclasswork/([a-z0-9-]+)"[^>]*>\s*<div class="t3iYD">'
    r'<img src="([^"]+\.(?:png|jpg|jpeg|webp)[^"]*|[^"]*=w\d+[^"]*)"'
)
# Apps Script deployment URL embedded in a game page (inside gameXmlUrl=...).
EMBED_RE = re.compile(r"(https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec)")
# GameMonetize SDK setup inside the Apps Script shell: `gameId: \x22<32 id>\x22`
# with the quotes hex-escaped in the raw HTML ("x22" literally appears before
# the id). GameMonetize ids are 32 lowercase alphanumerics.
GM_GAMEID_RE = re.compile(r"gameId:.{0,20}?x22([a-z0-9]{32})")


def fetch_text(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")


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


def discover_pages(html):
    """Index pages: home plus the numeric pagination pages the nav labels
    "Page N" (/2, /3, ...). Returns site-relative paths."""
    pages = {""}
    for m in PAGINATION_RE.finditer(html):
        pages.add("/" + m.group(1))
    return sorted(pages)


def scrape_site():
    """Walk the index pages, collecting slug -> (name, thumbnail url)."""
    names = {}    # slug -> display name (from nav)
    thumbs = {}   # slug -> thumbnail url (from content grids)
    page_paths = [""]
    visited = set()

    while page_paths:
        path = page_paths.pop(0)
        if path in visited:
            continue
        visited.add(path)
        url = SITE_BASE + path
        safe_print(f"Fetching {url} ...")
        html = fetch_text(url)

        # Pagination (nav "Page N" links) is found on whichever page we land
        # on first; the visited set below makes re-discovery harmless.
        for extra in discover_pages(html):
            if extra not in visited and extra not in page_paths:
                page_paths.append(extra)

        for m in NAV_LINK_RE.finditer(html):
            href, name = m.group(1), m.group(2)
            slug = href.rsplit("/", 1)[-1]
            if not slug or slug.isdigit():
                continue  # pagination links ("Page 2", ...)
            names.setdefault(slug, name)

        for slug, img in GRID_PAIR_RE.findall(html):
            thumbs.setdefault(slug, img)

    return names, thumbs


def fetch_embed_url(slug):
    """New (or embed-less) games need their Apps Script URL from the page."""
    try:
        html = fetch_text(f"{SITE_BASE}/{slug}")
        m = EMBED_RE.search(html)
        return m.group(1) if m else None
    except Exception as e:
        safe_print(f"  embed fetch failed for {slug}: {e}")
        return None


def fetch_game_id(embed_url):
    """GameMonetize gameId from an embed shell, or None when the embed uses
    some other loading mechanism."""
    try:
        page = fetch_text(embed_url)
    except Exception:
        return None
    m = GM_GAMEID_RE.search(page)
    return m.group(1) if m else None


def looks_like_image(data):
    # The gamemonetize image host answers unknown ids with an HTML error page
    # and HTTP 200, so the status code alone proves nothing.
    return data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n"


def download_bytes(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=20) as resp:
        return resp.read()


def download_thumb(slug, url):
    path = images_dir / f"{slug}.png"
    if path.exists():
        return slug, "exists"
    # lh3 thumbnails take a size suffix (=wNNNN); serve cards a modest 400px
    # render. Other hosts (gamemonetize) pass through unmodified.
    url = re.sub(r"=w\d+", "=w400", url)
    try:
        data = download_bytes(url)
        if not looks_like_image(data):
            raise ValueError("not an image (host error page?)")
        tmp = path.with_suffix(".part")
        with open(tmp, "wb") as f:
            f.write(data)
        tmp.replace(path)
        return slug, "downloaded"
    except Exception as e:
        safe_print(f"  thumbnail failed for {slug}: {e}")
        return slug, "failed"


def main():
    previous = load_json(catalog_path, [])
    prev_by_slug = {g["slug"]: g for g in previous}

    names, thumbs = scrape_site()
    safe_print(f"Site nav lists {len(names)} game pages, {len(thumbs)} have thumbnails")

    # Union: every live game plus catalog games the site may have dropped
    # (their embeds usually keep working, so they stay playable).
    slugs = list(dict.fromkeys([*prev_by_slug, *names]))

    # Embed URLs: reuse from the previous catalog; fetch from the game page
    # for entries we don't have one yet.
    need_embed = [s for s in slugs if not prev_by_slug.get(s, {}).get("embedUrl")]
    if need_embed:
        safe_print(f"Fetching embed URLs for {len(need_embed)} games without one ...")
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(fetch_embed_url, s): s for s in need_embed}
            for fut in as_completed(futures):
                slug = futures[fut]
                embed = fut.result()
                if embed:
                    prev_by_slug.setdefault(slug, {"slug": slug})["embedUrl"] = embed

    entries = []
    have_embed = 0
    for slug in slugs:
        prev = prev_by_slug.get(slug, {})
        embed = prev.get("embedUrl")
        if not embed:
            continue  # nothing to play — dead or new-but-unfetchable page
        have_embed += 1
        entries.append({
            "source": "Source #2",
            "name": prev.get("name") or names.get(slug) or slug.replace("-", " ").title(),
            "slug": slug,
            "page": f"{SITE_BASE}/{slug}",
            "embedUrl": embed,
            "imgsrc": f"/assets/img/ezclasswork/{slug}.png" if slug in thumbs else None,
        })

    # Stage 1: thumbnails from the site's content grids.
    images_dir.mkdir(parents=True, exist_ok=True)
    todo = [(e["slug"], thumbs[e["slug"]]) for e in entries if e["slug"] in thumbs]
    safe_print(f"Downloading {len(todo)} site thumbnails ...")
    ok = set()
    done = 0
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(download_thumb, s, u): s for s, u in todo}
        for fut in as_completed(futures):
            slug, status = fut.result()
            done += 1
            if done % 50 == 0:
                safe_print(f"  site thumbnails: {done}/{len(todo)}")
            if status != "failed":
                ok.add(slug)
    for e in entries:
        if e["slug"] not in ok:
            e["imgsrc"] = None  # failed download -> try the fallback below

    # Stage 2 fallback: games the site grids don't show still usually carry a
    # GameMonetize gameId inside their embed shell, and GameMonetize serves a
    # real thumbnail for that id. Only entries without art so far are probed.
    # An embed shared by several catalog pages hosts ONE game, so its art is
    # only correct for one of them — those pages are skipped rather than
    # labeled with a stranger's thumbnail.
    need_art = [e for e in entries if not e["imgsrc"]]
    embed_counts = {}
    for e in entries:
        embed_counts[e["embedUrl"]] = embed_counts.get(e["embedUrl"], 0) + 1
    shared = [e for e in need_art if embed_counts[e["embedUrl"]] > 1]
    if shared:
        safe_print(f"Skipping {len(shared)} shared-embed pages (art would be wrong for all but one)")
    need_art = [e for e in need_art if embed_counts[e["embedUrl"]] == 1]
    if need_art:
        safe_print(f"Probing GameMonetize art for {len(need_art)} games without site art ...")

        def gm_fallback(entry):
            slug = entry["slug"]
            game_id = fetch_game_id(entry["embedUrl"])
            if not game_id:
                return slug, "no-gameid"
            path = images_dir / f"{slug}.png"
            if path.exists():
                return slug, "exists"
            try:
                data = download_bytes(GM_THUMB_URL.format(game_id=game_id))
                if not looks_like_image(data):
                    raise ValueError("not an image")
                tmp = path.with_suffix(".part")
                with open(tmp, "wb") as f:
                    f.write(data)
                tmp.replace(path)
                return slug, "downloaded"
            except Exception as e:
                safe_print(f"  gm art failed for {slug}: {e}")
                return slug, "failed"

        got = 0
        done = 0
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(gm_fallback, e): e for e in need_art}
            for fut in as_completed(futures):
                slug, status = fut.result()
                done += 1
                if done % 50 == 0:
                    safe_print(f"  gm art: {done}/{len(need_art)}")
                if status in ("downloaded", "exists"):
                    ok.add(slug)
                    got += 1
        safe_print(f"GameMonetize fallback recovered art for {got}/{len(need_art)} games")

    for e in entries:
        if e["slug"] in ok:
            e["imgsrc"] = f"/assets/img/ezclasswork/{e['slug']}.png"

    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)

    with_art = sum(1 for e in entries if e["imgsrc"])
    safe_print(f"Wrote {catalog_path.name}: {len(entries)} games "
               f"({have_embed - len(entries)} dropped without embedUrl, "
               f"{with_art} with real art)")


if __name__ == "__main__":
    main()
