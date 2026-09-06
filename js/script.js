const SOURCE_DISABLED_KEY = 'sourceDisabled';
const SOURCE_MAIN = 'Main';
const SOURCE_ONE = 'Source #1';
const SOURCE_TWO = 'Source #2';

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
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

// A source can be hidden two ways: an explicit manual toggle (the Settings
// checkbox below) or an automated health probe that detected the whole source
// was unreachable (see probeSourceUp). A single broken game never hides its
// whole source — per-game removal is handled separately on the player page.
function sourceIsBlocked(source) {
    return readSourceState(SOURCE_DISABLED_KEY, {})[source] === true;
}

function renderSourceSettings() {
    const group = document.getElementById('source-settings-group');
    if (!group) return;
    const disabled = readSourceState(SOURCE_DISABLED_KEY, {});
    group.querySelectorAll('[data-source-setting]').forEach(input => {
        input.checked = disabled[input.dataset.sourceSetting] === true;
    });
}

// The per-source status lines live inside the settings group. They are
// appended here rather than only baked into the group's innerHTML because the
// group is also present as static HTML in gxmes/index.html — whichever way
// the group came into existence, the status lines need to end up in it.
function ensureSourceStatusLines(group) {
    [SOURCE_ONE, SOURCE_TWO].forEach(source => {
        const id = `source-status-${source === SOURCE_ONE ? 'source-1' : 'source-2'}`;
        if (document.getElementById(id)) return;
        const line = document.createElement('div');
        line.id = id;
        line.className = 'modal-item source-status';
        group.appendChild(line);
    });
}

function addSourceSettingsToModal() {
    let group = document.getElementById('source-settings-group');
    if (!group) {
        const modalContent = document.querySelector('#modal .modal-content');
        if (!modalContent) return;

        group = document.createElement('div');
        group.id = 'source-settings-group';
        group.className = 'modal-group';
        // Deliberately quiet and unlabeled with jargon — this is just a quick
        // kill switch for troubleshooting, not something a visitor needs to
        // understand or think about. The per-source status lines only say
        // something when a source actually failed (probe/blocked/unreachable).
        group.innerHTML = `
            <div class="modal-item"><label><input type="checkbox" data-source-setting="${SOURCE_ONE}"> Hide Source #1 games</label></div>
            <div class="modal-item source-status" id="source-status-source-1"></div>
            <div class="modal-item"><label><input type="checkbox" data-source-setting="${SOURCE_TWO}"> Hide Source #2 games</label></div>
            <div class="modal-item source-status" id="source-status-source-2"></div>
        `;
        modalContent.appendChild(group);
    }
    if (group.dataset.sourceSettingsBound !== 'true') {
        group.dataset.sourceSettingsBound = 'true';
        group.querySelectorAll('[data-source-setting]').forEach(input => input.addEventListener('change', () => {
            const disabled = readSourceState(SOURCE_DISABLED_KEY, {});
            disabled[input.dataset.sourceSetting] = input.checked;
            localStorage.setItem(SOURCE_DISABLED_KEY, JSON.stringify(disabled));
            window.location.reload();
        }));
        renderSourceSettings();
    }
    ensureSourceStatusLines(group);
    renderSourceStatus();
}

function initializeSourceSettings() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSourceSettingsToModal, { once: true });
    else addSourceSettingsToModal();
}

initializeSourceSettings();

// Scraped-catalog entries are always explicitly source-tagged in their JSON
// (Source #1 = genizymath zones feed, Source #2 = EZClasswork site);
// everything else is a Main game.
function isScraperGameEntry(gxme) {
    return gxme.source === SOURCE_ONE || gxme.source === SOURCE_TWO;
}

function getGamePageUrl(gxme) {
    if (!isScraperGameEntry(gxme)) return `/gxmes/${gxme.foldername}/`;
    // Both scraped catalogs play through the shared player: ?game=slug picks
    // the game, &s=1 selects the Source #1 catalog (the plain ?game= form
    // stays the Source #2 default so existing shared links keep working).
    return `/gxmes/ezclasswork/?game=${encodeURIComponent(gxme.slug)}${gxme.source === SOURCE_ONE ? '&s=1' : ''}`;
}

function getGameSourceGroup(gxme) {
    return gxme.source || (isScraperGameEntry(gxme) ? SOURCE_ONE : 'Main');
}

function getSourcePriority(gxme) {
    const source = getGameSourceGroup(gxme);
    // Main (downloaded/self-hosted) wins over Source #1 (genizymath), which
    // wins over Source #2 (EZClasswork embeds). The dedup in preferMainSource
    // uses this to pick the best copy of a game that exists in more than one
    // catalog.
    return source === 'Main' ? 0 : source === SOURCE_ONE ? 1 : 2;
}

function preferMainSource(gxmes) {
    const preferred = new Map();
    gxmes.forEach(gxme => {
        const key = String(gxme.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const current = preferred.get(key);
        if (!current || getSourcePriority(gxme) < getSourcePriority(current)) {
            preferred.set(key, gxme);
        }
    });
    return [...preferred.values()];
}

function normalizeScraperGame(gxme) {
    return {
        ...gxme,
        // Scrapers back-fill real covers/art (Source #1: assets/img/{slug}_{id}.png,
        // Source #2: assets/img/ezclasswork/{slug}.png); only entries the scraper
        // could not find art for fall back to the generated placeholder.
        imgsrc: gxme.imgsrc || ezClassworkPlaceholderImage(gxme.name),
        linksrc: '/gxmes/ezclasswork/',
        foldername: `ezclasswork-${gxme.slug}`,
        category: 'Classroom',
        source: gxme.source || SOURCE_ONE
    };
}

function filterAvailableGames(gxmes) {
    return gxmes.filter(gxme => {
        const source = getGameSourceGroup(gxme);
        return !sourceIsBlocked(source);
    });
}

// Response validation for catalog fetches. A blocked/filtered request (e.g.
// jsdelivr-style proxies, school filters) often succeeds at the network level
// but returns an empty body or a stub HTML page instead of the JSON catalog —
// so "200 OK" alone proves nothing. Treat anything that isn't a non-empty
// JSON array as a failed load.
function validateCatalogResponse(text) {
    if (!text || !text.trim()) return null;
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
        return null;
    }
}

async function fetchJsonCatalog(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const text = await response.text();
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    const parsed = validateCatalogResponse(text);
    if (!parsed) throw new Error(`${url} -> empty or non-JSON body`);
    return parsed;
}

// Every widget on this page (top 10, all games, recently added, favorites,
// search, category tabs, the per-source sidebar tabs...) needs the same
// combined catalog. Fetching and normalizing it separately for each one is
// what made the page lag — this memoizes it so the ~1700-game catalog is
// fetched, parsed and normalized exactly once per page load no matter how
// many features ask for it.
//
// Each catalog loads independently (Promise.allSettled): one dead source
// degrades to just its own games being absent instead of rejecting the whole
// fetch chain and blanking the entire hub. Main is the curated local shelf,
// so its failure is still fatal to the page — fetchgxmes() callers surface
// that as an error rather than silently showing an empty site.
let catalogPromise = null;
let catalogHealth = { [SOURCE_MAIN]: true, [SOURCE_ONE]: true, [SOURCE_TWO]: true };

function catalogLoaded(health, source) {
    return Boolean(health && health[source]);
}

function getCatalogHealth() {
    return { ...catalogHealth };
}

async function fetchSourceCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
        const settled = await Promise.allSettled([
            fetchJsonCatalog('../json/list.json'),
            fetchJsonCatalog('../json/source1.json'),
            fetchJsonCatalog('../json/ezclasswork.json')
        ]);
        const available = games => games.map(normalizeScraperGame).filter(gxme => !gxme.missing);

        const value = (index, fallback) => settled[index].status === 'fulfilled' ? settled[index].value : fallback;
        catalogHealth = {
            [SOURCE_MAIN]: settled[0].status === 'fulfilled',
            [SOURCE_ONE]: settled[1].status === 'fulfilled',
            [SOURCE_TWO]: settled[2].status === 'fulfilled'
        };
        [SOURCE_MAIN, SOURCE_ONE, SOURCE_TWO].forEach(source => {
            if (!catalogHealth[source]) console.warn(`[catalog] ${source} failed to load; its content is hidden this page load.`, settled[[SOURCE_MAIN, SOURCE_ONE, SOURCE_TWO].indexOf(source)].reason);
        });

        // Keyed by source label so callers can do catalog[SOURCE_MAIN], etc.
        // Source #1 is the genizymath zones feed (self-hosted wrapper first,
        // mirror fallback); Source #2 is the EZClasswork site catalog.
        // A failed source resolves as an empty list — filtered out of the
        // combined catalog and its tab never renders.
        return {
            [SOURCE_MAIN]: value(0, []),
            [SOURCE_ONE]: available(value(1, [])),
            [SOURCE_TWO]: available(value(2, []))
        };
    })();
    return catalogPromise;
}

// Runtime health probe for a source. Detects two failure modes:
//  1. unreachable: network error / HTTP error / timeout, and
//  2. blocked-but-responding: a filter (school proxy, jsdelivr outage mode)
//     that returns 200 with an empty body or a useless stub page.
// Either mode returns false (source down); a page that looks like a real
// game shell returns true. CORS-blocked reads are inconclusive -> true,
// because the iframe may still render fine when the fetch cannot read it.
const SOURCE_PROBE_TIMEOUT_MS = 8000;

function bodyLooksLikeGameShell(html) {
    const text = (html || '').trim().toLowerCase();
    if (!text) return false;
    if (text === 'not found' || text === 'error' || text === 'null') return false;
    // A real game wrapper/page has actual markup; a stub typically doesn't.
    return text.includes('<') && (text.includes('<body') || text.includes('<div') || text.includes('<script') || text.includes('<iframe'));
}

async function probeSourceUp(probeUrl) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SOURCE_PROBE_TIMEOUT_MS);
    try {
        const response = await fetch(probeUrl, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return false;
        const body = await response.text();
        return bodyLooksLikeGameShell(body);
    } catch {
        // Abort (timeout) is a real failure; a CORS/network read error is
        // inconclusive — the iframe may still work, so stay optimistic.
        return true;
    } finally {
        window.clearTimeout(timer);
    }
}

// Keeps the Settings modal's per-source status line current. Quiet by design:
// it only says anything when a source actually failed to load or its probe
// found it unreachable.
function setSourceStatus(source, up) {
    // sourceSlug lives in tabs.js; both are classic scripts on the same page,
    // but guard anyway so an early call can't throw.
    const slug = typeof sourceSlug === 'function' ? sourceSlug(source) : source === SOURCE_ONE ? 'source-1' : 'source-2';
    const line = document.getElementById(`source-status-${slug}`);
    if (!line) return;
    line.textContent = up ? '' : `${source} is currently unavailable — its games are hidden.`;
}

function renderSourceStatus() {
    const health = getCatalogHealth();
    [SOURCE_ONE, SOURCE_TWO].forEach(source => setSourceStatus(source, health[source]));
}

async function fetchgxmes() {
    const catalog = await fetchSourceCatalog();
    // Main is the curated local shelf every other widget assumes exists; if
    // even it failed (site broken, not just one source), fail loudly instead
    // of silently rendering an empty site.
    if (!catalogLoaded(catalogHealth, SOURCE_MAIN)) {
        throw new Error('Main game catalog failed to load.');
    }
    // A downloaded/self-hosted game always wins over an embedded copy of
    // the same name (e.g. "2048") — applied once here so every consumer
    // (category tabs, All Games, search) sees the deduped catalog
    // instead of the same game appearing twice. Sources that failed to
    // load resolve as empty lists, so they simply don't contribute.
    return filterAvailableGames(preferMainSource([
        ...catalog[SOURCE_MAIN],
        ...catalog[SOURCE_ONE],
        ...catalog[SOURCE_TWO]
    ]));
}

function renderLastPlayed() {
    const lastPlayed = filterAvailableGames(JSON.parse(localStorage.getItem('lastPlayed')) || []);
    const container = document.getElementById('last-played-gxmes');
    
    if (lastPlayed.length > 0) {
        rendergxmes(lastPlayed, 'last-played-gxmes');
    } else {
        container.innerHTML = '<p>No gxmes played yet.</p>';
    }
}

async function fetchTop10FolderNames() {
    const response = await fetch('../json/metadata.json');
    const data = await response.json();
    return data[0].Top10; 
}

// Big grids (All Games, the Source #1/#2 tabs — up to ~835 cards each) are
// rendered in chunks of this size, with an IntersectionObserver sentinel
// appending the next chunk as the visitor scrolls. Instantly rendering a
// thousand-plus cards made the hub janky on low-end devices; now only the
// first few screens' worth of DOM nodes and image requests exist until the
// visitor actually scrolls. Small grids (Top 10, favorites...) render whole.
const GRID_CHUNK_SIZE = 120;

function makeCardHTML(gxme, favorites, badgeHTML = '') {
    const isFavorite = favorites.includes(gxme.name);
    return `
        <div class="gxme-card" data-game-source="${getGameSourceGroup(gxme)}" data-gxme-name="${gxme.name}" ${isScraperGameEntry(gxme) ? 'data-scraper-game="true"' : ''}>
            ${badgeHTML}
            <button class="favorite-btn ${isFavorite ? 'active' : ''}">
                <i class="fas fa-star"></i>
            </button>
            <img loading="lazy" src="${gxme.imgsrc}" alt="${gxme.name}">
            <h3>${gxme.name}</h3>
            <a href="${getGamePageUrl(gxme)}" class="play-link">Play Now</a>
        </div>
    `;
}

function attachOneCard(card, gxme, opts = {}) {
    card.querySelector('.favorite-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        if (opts.onFavorite) opts.onFavorite(this, gxme);
        else toggleFavorite(this, gxme);
    });
    card.querySelector('.play-link').addEventListener('click', (e) => {
        e.preventDefault();
        updateLastPlayed(gxme);
        window.location.href = e.currentTarget.href;
    });
}

// Renders gxmesList into container and wires up card handlers, chunking the
// work when the list is big. opts.favorites drives the star buttons and
// opts.badgeHTML (TOP/NEW) renders inside each card. Returns the rendered
// card elements in list order.
function renderGamesGrid(container, gxmesList, opts = {}) {
    // opts.favorites may be an array or a getter; a getter keeps lazily
    // appended chunks in sync with stars toggled since the initial render.
    const favoritesOf = typeof opts.favorites === 'function' ? opts.favorites : () => opts.favorites || [];
    // opts.badgeHTML (TOP/NEW) is rendered inside each card, top-left corner.
    const cardHTML = gxme => makeCardHTML(gxme, favoritesOf(), opts.badgeHTML);

    if (gxmesList.length <= GRID_CHUNK_SIZE) {
        container.innerHTML = gxmesList.map(cardHTML).join('');
    } else {
        // Chunked path. A single sentinel div rides at the end of the grid;
        // when it scrolls within 600px of the viewport the next chunk is
        // appended and handlers are attached to just the new cards.
        container.innerHTML = gxmesList.slice(0, GRID_CHUNK_SIZE).map(cardHTML).join('')
            + '<div class="grid-sentinel"></div>';
        const sentinel = container.querySelector('.grid-sentinel');
        let rendered = GRID_CHUNK_SIZE;

        const appendChunk = () => {
            const chunk = gxmesList.slice(rendered, rendered + GRID_CHUNK_SIZE);
            if (!chunk.length) return;
            const frag = document.createElement('template');
            frag.innerHTML = chunk.map(cardHTML).join('');
            const newCards = Array.from(frag.content.querySelectorAll('.gxme-card'));
            sentinel.before(frag.content);
            newCards.forEach((card, i) => attachOneCard(card, chunk[i], opts));
            rendered += chunk.length;
            if (rendered >= gxmesList.length) {
                observer.disconnect();
                sentinel.remove();
            }
        };

        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) appendChunk();
        }, { rootMargin: '600px' });
        observer.observe(sentinel);
    }

    const cards = Array.from(container.querySelectorAll('.gxme-card'));
    cards.forEach((card, i) => attachOneCard(card, gxmesList[i], opts));
    return cards;
}

function rendergxmes(gxmes, containerId, badge) {
    const container = document.getElementById(containerId);
    gxmes = filterAvailableGames(gxmes);
    const badgeHTML = badge ? `<span class="game-badge badge-${badge.toLowerCase()}">${badge}</span>` : '';

    renderGamesGrid(container, gxmes, {
        favorites: () => JSON.parse(localStorage.getItem('favorites')) || [],
        badgeHTML
    });
}

async function loadTop10() {
    const gxmes = await fetchgxmes();
    const top10FolderNames = await fetchTop10FolderNames();
    const top10gxmes = gxmes.filter(gxme => top10FolderNames.includes(gxme.foldername));
    rendergxmes(top10gxmes, 'top-10-gxmes', 'TOP');
}

async function loadAllgxmes() {
    const gxmes = await fetchgxmes();
    rendergxmes(gxmes, 'all-gxmes-grid');
    renderLastPlayed();
}
async function loadLast10gxmes() {
    const gxmes = await fetchgxmes();
    // "Recently Added" is one of the first things a visitor sees, so only
    // promote games with a real picture here — not the generated placeholder.
    const last10gxmes = gxmes.filter(hasRealImage).slice(-10).reverse();
    rendergxmes(last10gxmes, 'last-10-gxmes', 'NEW');
}
function toggleFavorite(button, gxme) {
    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const isFavorite = favorites.includes(gxme.name);

    if (isFavorite) {
        favorites = favorites.filter(fav => fav !== gxme.name);
        button.classList.remove('active');
    } else {
        favorites.push(gxme.name);
        button.classList.add('active');
    }

    localStorage.setItem('favorites', JSON.stringify(favorites));
    updateFavoritesDisplay();
}

function updateFavoritesDisplay() {
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const favoritesSection = document.getElementById('Favorites');
    const favoritesContainer = document.getElementById('favorites');

    if (favorites.length > 0) {
        favoritesSection.style.display = 'block';
        fetchgxmes().then(gxmes => {
            const favoritegxmes = gxmes.filter(gxme => favorites.includes(gxme.name));
            
            const renderedNames = Array.from(favoritesContainer.querySelectorAll('.gxme-card'))
                .map(card => card.dataset.gxmeName);

            const isDifferent = renderedNames.length !== favoritegxmes.length ||
                !favoritegxmes.every(gxme => renderedNames.includes(gxme.name));

            if (isDifferent) {
                rendergxmes(favoritegxmes, 'favorites');
            }
        });
    } else {
        favoritesSection.style.display = 'block';
        favoritesContainer.innerHTML = `<p>No favorites yet, hit the star to add some!</p>`;
    }

    document.querySelectorAll('.gxme-card').forEach(card => {
        const button = card.querySelector('.favorite-btn');
        const isFavorite = favorites.includes(card.dataset.gxmeName);
        if (isFavorite) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

function updateLastPlayed(gxme) {
    let lastPlayed = JSON.parse(localStorage.getItem('lastPlayed')) || [];
    lastPlayed = lastPlayed.filter(item => item.name !== gxme.name);
    lastPlayed.unshift(gxme); 
    lastPlayed = lastPlayed.slice(0, 5); 
    localStorage.setItem('lastPlayed', JSON.stringify(lastPlayed));
    renderLastPlayed();
}

Promise.all([
    loadTop10(),
    loadAllgxmes(),
    updateFavoritesDisplay(),
    loadLast10gxmes()
]);