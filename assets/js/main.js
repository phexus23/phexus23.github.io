const SOURCE_DISABLED_KEY = 'sourceDisabled';

function ezClassworkPlaceholderImage(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue},45%,35%)"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="72" fill="hsl(${hue},60%,88%)" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function hasRealImage(gxme) {
    return !(gxme.imgsrc || '').startsWith('data:image/svg+xml');
}

function readSourceState(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

// Same manual, per-browser toggle used on the games hub Settings modal — no
// automatic reachability probing. Probing a single representative game to
// decide a whole source's fate used to hang page load for seconds and could
// wrongly hide an entire source over one broken file.
function sourceIsEnabled(source) {
    return readSourceState(SOURCE_DISABLED_KEY, {})[source] !== true;
}

document.addEventListener('DOMContentLoaded', function() {
    Promise.all([
        fetch('json/list.json').then(response => response.json()),
        fetch('json/ezclasswork.json').then(response => response.json())
    ])
        .then(([data, ezClassworkGames]) => {
            const ezGames = ezClassworkGames.map(game => ({
                ...game,
                imgsrc: ezClassworkPlaceholderImage(game.name),
                foldername: `ezclasswork-${game.slug}`,
                category: 'EZClasswork',
                source: 'Source #2'
            }));
            const allGames = data.concat(ezGames);
            const gxmeGrid = document.getElementById('gxmeGrid');
            const availableGames = allGames.filter(gxme => sourceIsEnabled(gxme.source));
            // This is the first thing most visitors see, so only promote
            // games with a real picture — not the generated placeholder used
            // for EZClasswork games that have no artwork of their own.
            const showcaseGames = preferMainSource(availableGames).filter(hasRealImage);
            const randomgxmes = showcaseGames.sort(() => 0.5 - Math.random()).slice(0, 4);

            randomgxmes.forEach(gxme => {
                let gxmeLink = document.createElement('a');
                gxmeLink.href = gxme.source === 'Source #2'
                    ? `/gxmes/ezclasswork/?game=${encodeURIComponent(gxme.slug)}`
                    : "/gxmes/" + gxme.foldername + "/";
                gxmeLink.style.textDecoration = 'none';
                gxmeLink.style.color = 'inherit';

                let gxmeCard = document.createElement('div');
                gxmeCard.classList.add('gxme-card');
                gxmeCard.dataset.gameSource = gxme.source || 'Main';
                gxmeCard.style.cursor = 'pointer';

                let img = document.createElement('img');
                img.src = gxme.imgsrc;
                img.alt = gxme.name;
                img.style.height = "145px";
                img.style.width = "145px";

                let h3 = document.createElement('h3');
                h3.textContent = gxme.name;

                gxmeCard.appendChild(img);
                gxmeCard.appendChild(h3);
                gxmeLink.appendChild(gxmeCard);
                gxmeGrid.appendChild(gxmeLink);
            });
        })
        .catch(error => {
            console.error('Error loading the list.json:', error);
        });
});

function preferMainSource(gxmes) {
    const preferred = new Map();
    gxmes.forEach(gxme => {
        const key = String(gxme.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const current = preferred.get(key);
        if (!current || sourcePriority(gxme) < sourcePriority(current)) {
            preferred.set(key, gxme);
        }
    });
    return [...preferred.values()];
}

function sourcePriority(gxme) {
    return gxme.source === 'Source #1' ? 1 : gxme.source === 'Source #2' ? 2 : 0;
}

function randombutton() {
    window.location.href = '/gxmes';
}