const SOURCE_DISABLED_KEY = 'sourceDisabled';
const SOURCE_MAIN = 'Main';
const SOURCE_ONE = 'Source #1';

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

// A whole source is only ever hidden by an explicit, manual toggle here — never
// by an automated reachability probe. Probing a single representative game to
// decide a whole source's fate is fragile: if that one game happens to be down,
// every other (perfectly working) game from that source got hidden forever.
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
        // understand or think about.
        group.innerHTML = `
            <div class="modal-item"><label><input type="checkbox" data-source-setting="${SOURCE_ONE}"> Hide Source #1 games</label></div>
        `;
        modalContent.appendChild(group);
    }
    if (group.dataset.sourceSettingsBound === 'true') return;
    group.dataset.sourceSettingsBound = 'true';

    group.querySelectorAll('[data-source-setting]').forEach(input => input.addEventListener('change', () => {
        const disabled = readSourceState(SOURCE_DISABLED_KEY, {});
        disabled[input.dataset.sourceSetting] = input.checked;
        localStorage.setItem(SOURCE_DISABLED_KEY, JSON.stringify(disabled));
        window.location.reload();
    }));
    renderSourceSettings();
}

function initializeSourceSettings() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSourceSettingsToModal, { once: true });
    else addSourceSettingsToModal();
}

initializeSourceSettings();

// Scraper-catalog entries (the merged Source #1 catalog) are always
// explicitly source-tagged in source1.json; everything else is a Main game.
function isScraperGameEntry(gxme) {
    return gxme.source === SOURCE_ONE;
}

function getGamePageUrl(gxme) {
    if (!isScraperGameEntry(gxme)) return `/gxmes/${gxme.foldername}/`;
    // ?s=1 picks the Source #1 catalog in the player; plain ?game= (Source #2)
    // stays the default so existing shared links keep working.
    return `/gxmes/ezclasswork/?game=${encodeURIComponent(gxme.slug)}${gxme.source === SOURCE_ONE ? '&s=1' : ''}`;
}

function getGameSourceGroup(gxme) {
    return gxme.source || (isScraperGameEntry(gxme) ? SOURCE_ONE : 'Main');
}

function getSourcePriority(gxme) {
    const source = getGameSourceGroup(gxme);
    // Main (downloaded/self-hosted) wins over Source #1, which wins over
    // Source #2. The dedup in preferMainSource uses this to pick the best
    // copy of a game that exists in more than one catalog.
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
        // Scrapers back-fill real covers (assets/img/{slug}_{id}.png); only
        // entries the scraper could not find art for fall back to the
        // generated placeholder.
        imgsrc: gxme.imgsrc || ezClassworkPlaceholderImage(gxme.name),
        linksrc: '/gxmes/ezclasswork/',
        foldername: `ezclasswork-${gxme.slug}`,
        category: 'Classroom',
        source: SOURCE_ONE
    };
}

function filterAvailableGames(gxmes) {
    return gxmes.filter(gxme => {
        const source = getGameSourceGroup(gxme);
        return !sourceIsBlocked(source);
    });
}

// Every widget on this page (top 10, all games, recently added, favorites,
// search, category tabs, the per-source sidebar tabs...) needs the same
// combined catalog. Fetching and normalizing it separately for each one is
// what made the page lag — this memoizes it so the ~1700-game catalog is
// fetched, parsed and normalized exactly once per page load no matter how
// many features ask for it.
let catalogPromise = null;
async function fetchSourceCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
        const [gamesResponse, source1Response] = await Promise.all([
            fetch('../json/list.json'),
            fetch('../json/source1.json')
        ]);
        const [gxmes, source1Games] = await Promise.all([
            gamesResponse.json(),
            source1Response.json()
        ]);
        const available = games => games.map(normalizeScraperGame).filter(gxme => !gxme.missing);
        // Keyed by source label so callers can do catalog[SOURCE_MAIN], etc.
        // The scraped catalog is merged: source1.json already prefers our own
        // wrapper files and falls back to the mirror, so there is no separate
        // Source #2 catalog here anymore (json/source2.json remains only as
        // the scraper's id->wrapper lookup and for legacy player links).
        return {
            [SOURCE_MAIN]: gxmes,
            [SOURCE_ONE]: available(source1Games)
        };
    })();
    return catalogPromise;
}

async function fetchgxmes() {
    const catalog = await fetchSourceCatalog();
    // A downloaded/self-hosted game always wins over an embedded copy of
    // the same name (e.g. "2048") — applied once here so every consumer
    // (category tabs, All Games, search) sees the deduped catalog
    // instead of the same game appearing twice.
    return filterAvailableGames(preferMainSource([
        ...catalog[SOURCE_MAIN],
        ...catalog[SOURCE_ONE]
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