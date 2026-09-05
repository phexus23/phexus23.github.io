"""
Download every game wrapper HTML file from genizymath.github.io (/iframe/<file>.html)
into Vafor_IT/source2/ and build json/source2.json with each game's
base URL (the <base href> / asset origin the game loads from) and local file.

Hosting just these wrapper files on another site is enough for the games to
work: their assets load directly from the jsdelivr CDN.
"""
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "Vafor_IT", "source2")
JSON_PATH = os.path.join(HERE, "json", "source2.json")
ZONES_URL = "https://cdn.jsdelivr.net/gh/freebuisness/assets@main/zones.json"
IFRAME_BASE = "https://genizymath.github.io/iframe/{file}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
# Asset URLs that are boilerplate (analytics/ads), never the game itself.
DENYLIST = ("googletagmanager.com", "google-analytics.com", "pagead2.googlesyndication.com", "doubleclick.net")


def slugify(name):
    slug = re.sub(r"\s+", "-", name.lower())
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "game"


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def derive_base(html):
    """<base href> wins; else EJS emulator data path; else the most common directory
    among hardcoded asset URLs."""
    m = re.search(r'<base[^>]+href="([^"]+)"', html)
    if m:
        return m.group(1)
    ejs = re.search(r'EJS_pathtodata\s*=\s*"([^"]+)"', html)
    if ejs:
        return ejs.group(1)
    urls = re.findall(r'(?:src|href)="([^"]+)"', html)
    dirs = {}
    for u in urls:
        if not u.startswith("http") or any(d in u for d in DENYLIST):
            continue
        d = u[: u.rfind("/") + 1] if "/" in u else u
        dirs[d] = dirs.get(d, 0) + 1
    if not dirs:
        return None
    return max(dirs, key=dirs.get)


def derive_game_url(html):
    m = re.search(r'EJS_gameUrl\s*=\s*"([^"]+)"', html)
    return m.group(1) if m else None


def download_one(zone):
    gid = zone["id"]
    name = zone.get("name", str(gid))
    zurl = zone.get("url", "")
    # Only games hosted in the html repo get a wrapper file; external urls (e.g. discord) are not games.
    if not zurl.startswith("{HTML_URL}/"):
        return {"id": gid, "name": name, "skip": True}
    file = zurl[len("{HTML_URL}/"):]
    url = IFRAME_BASE.format(file=file)
    try:
        html = fetch(url)
    except Exception as e:
        return {"id": gid, "name": name, "file": file, "error": str(e)[:120]}
    title = re.search(r"<title>([^<]*)</title>", html)
    return {
        "id": gid,
        "name": name,
        "file": file,
        "html": html,
        "baseUrl": derive_base(html),
        "gameUrl": derive_game_url(html),
        "title": title.group(1).strip() if title else None,
    }


def main():
    zones = json.loads(fetch(ZONES_URL))
    print(f"zones: {len(zones)}")

    os.makedirs(OUT_DIR, exist_ok=True)
    results = []
    errors = []
    used_slugs = {}

    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download_one, z): z for z in zones}
        for i, fut in enumerate(as_completed(futures), 1):
            zone = futures[fut]
            try:
                res = fut.result()
            except Exception as e:
                res = {"id": zone["id"], "name": zone.get("name"), "error": str(e)[:120]}
            if res.get("skip"):
                print(f"[{i}/{len(zones)}] id {res['id']} SKIPPED (not a hosted game)")
                continue
            if "error" in res:
                errors.append(res)
                print(f"[{i}/{len(zones)}] id {res['id']} FAILED: {res['error']}")
                continue
            gid, name, html = res["id"], res["name"], res["html"]
            missing = "Couldn't find" in html[:200]
            slug = slugify(name)
            n = used_slugs.get(slug, 0)
            used_slugs[slug] = n + 1
            fname = f"{slug}.html" if n == 0 else f"{slug}-{n}.html"
            with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8", newline="") as f:
                f.write(html)
            results.append({
                "source": "Source #2",
                "id": gid,
                "name": name,
                "slug": slug,
                "title": res.get("title"),
                "page": f"https://genizymath.github.io/games/{slug}/",
                "embedUrl": IFRAME_BASE.format(file=res["file"]),
                "baseUrl": res.get("baseUrl"),
                "gameUrl": res.get("gameUrl"),
                "file": f"/Vafor_IT/source2/{fname}",
                "missing": missing or None,
            })
            if i % 100 == 0:
                print(f"progress: {i}/{len(zones)}")

    results.sort(key=lambda r: r["id"])
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    ok = len(results)
    with_base = sum(1 for r in results if r["baseUrl"])
    missing_n = sum(1 for r in results if r["missing"])
    print(f"\ndownloaded: {ok}, with baseUrl: {with_base}, missing wrappers: {missing_n}, errors: {len(errors)}")
    if errors:
        print("failed:", [(e["id"], e.get("file")) for e in errors])


if __name__ == "__main__":
    sys.exit(main())