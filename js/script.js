const SOURCE_DISABLED_KEY = 'sourceDisabled';
const SOURCE_ONE = 'Source #1';
const SOURCE_TWO = 'Source #2';
const EZCLASSWORK_SOURCE = SOURCE_TWO;

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

function sourceBadgeLabel(gxme) {
    const source = getGameSourceGroup(gxme);
    return source === SOURCE_ONE ? 'SRC 1' : source === SOURCE_TWO ? 'SRC 2' : null;
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
        group.innerHTML = `<h6>Alternate Game Sources</h6><p>Games tagged SRC 1 / SRC 2 come from an alternate source. Hide a whole source instantly if it's down or misbehaving.</p>${[SOURCE_ONE, SOURCE_TWO].map(source => `<div class="modal-item"><label><input type="checkbox" data-source-setting="${source}"> Hide ${source} games</label></div>`).join('')}`;
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

function isScraperGameEntry(gxme) {
    if (gxme.source === EZCLASSWORK_SOURCE || typeof gxme.linksrc !== 'string' || !gxme.linksrc.startsWith('/gxmes/')) {
        return false;
    }

    const imageSource = typeof gxme.imgsrc === 'string' ? gxme.imgsrc : '';
    return gxme.source === SOURCE_ONE ||
        /\/covers@main\/\d+\.png(?:[?#].*)?$/.test(imageSource) ||
        /_\d+\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(imageSource);
}

function getGamePageUrl(gxme) {
    return gxme.source === EZCLASSWORK_SOURCE
        ? `/gxmes/ezclasswork/?game=${encodeURIComponent(gxme.slug)}`
        : `/gxmes/${gxme.foldername}/`;
}

function getGameSourceGroup(gxme) {
    return gxme.source || (isScraperGameEntry(gxme) ? SOURCE_ONE : 'Main');
}

function getSourcePriority(gxme) {
    const source = getGameSourceGroup(gxme);
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

function normalizeEzClassworkGames(gxmes) {
    return gxmes.map(gxme => ({
        ...gxme,
        imgsrc: ezClassworkPlaceholderImage(gxme.name),
        linksrc: '/gxmes/ezclasswork/',
        foldername: `ezclasswork-${gxme.slug}`,
        category: 'EZClasswork',
        source: EZCLASSWORK_SOURCE
    }));
}

function filterAvailableGames(gxmes) {
    return gxmes.filter(gxme => {
        const source = getGameSourceGroup(gxme);
        return !sourceIsBlocked(source);
    });
}

// Every widget on this page (top 10, all games, recently added, favorites,
// search, category tabs...) needs the same combined catalog. Fetching and
// normalizing it separately for each one is what made the page lag — this
// memoizes it so the ~660-game catalog is fetched, parsed and normalized
// exactly once per page load no matter how many features ask for it.
let catalogPromise = null;
async function fetchgxmes() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
        const [gamesResponse, ezClassworkResponse] = await Promise.all([
            fetch('../json/list.json'),
            fetch('../json/ezclasswork.json')
        ]);
        const [gxmes, ezClassworkGames] = await Promise.all([
            gamesResponse.json(),
            ezClassworkResponse.json()
        ]);
        const allGames = gxmes.concat(normalizeEzClassworkGames(ezClassworkGames));
        return filterAvailableGames(allGames);
    })();
    return catalogPromise;
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

function rendergxmes(gxmes, containerId, badge) {
    const container = document.getElementById(containerId);
    gxmes = filterAvailableGames(gxmes);
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const badgeHTML = badge ? `<span class="game-badge badge-${badge.toLowerCase()}">${badge}</span>` : '';

    container.innerHTML = gxmes.map(gxme => {
        const isFavorite = favorites.includes(gxme.name);
        const srcLabel = sourceBadgeLabel(gxme);
        return `
            <div class="gxme-card" data-game-source="${getGameSourceGroup(gxme)}" data-gxme-name="${gxme.name}" ${isScraperGameEntry(gxme) ? 'data-scraper-game="true"' : ''}>
                ${badgeHTML}
                ${srcLabel ? `<span class="game-badge badge-src">${srcLabel}</span>` : ''}
                <button class="favorite-btn ${isFavorite ? 'active' : ''}">
                    <i class="fas fa-star"></i>
                </button>
                <img src="${gxme.imgsrc}" alt="${gxme.name}">
                <h3>${gxme.name}</h3>
                <a href="${getGamePageUrl(gxme)}" class="play-link">Play Now</a>
            </div>
        `;
    }).join('');

    // Attach handlers by zipping with the source array (same order the markup
    // was built in) instead of round-tripping every game through JSON in a
    // data attribute — cheaper, and immune to names containing quotes.
    container.querySelectorAll('.gxme-card').forEach((card, i) => {
        const gxme = gxmes[i];
        card.querySelector('.favorite-btn').addEventListener('click', function () {
            toggleFavorite(this, gxme);
        });
        card.querySelector('.play-link').addEventListener('click', (e) => {
            e.preventDefault();
            updateLastPlayed(gxme);
            window.location.href = e.currentTarget.href;
        });
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