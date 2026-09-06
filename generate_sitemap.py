import json
import os
from datetime import date

homeDir = os.path.dirname(os.path.abspath(__file__))
jsonPath = os.path.join(homeDir, "json", "list.json")
sitemapPath = os.path.join(homeDir, "sitemap1.xml")
domain = "https://maxwellstevenson.com"

with open(jsonPath, encoding="utf-8") as f:
    games = json.load(f)

with open(os.path.join(homeDir, "json", "ezclasswork.json"), encoding="utf-8") as f:
    ezclasswork_games = [g for g in json.load(f) if not g.get("missing")]

today = date.today().isoformat()

entries = [
    (f"{domain}/", "1.00"),
    (f"{domain}/gxmes/", "0.90"),
]
entries += [(f"{domain}/gxmes/{g['foldername']}/", "0.70") for g in games]
entries += [(f"{domain}/gxmes/ezclasswork/?game={g['slug']}", "0.70") for g in ezclasswork_games]

lines = ['<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, priority in entries:
    lines.append("  <url>")
    lines.append(f"    <loc>{loc}</loc>")
    lines.append(f"    <lastmod>{today}</lastmod>")
    lines.append(f"    <priority>{priority}</priority>")
    lines.append("  </url>")
lines.append("</urlset>")
lines.append("")

with open(sitemapPath, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lines))

print(f"Wrote {len(entries)} URLs to sitemap1.xml")
