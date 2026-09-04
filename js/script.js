const SCRAPER_GAMES_DISABLED_KEY = 'scraperGamesDisabled';
const SOURCE_AVAILABILITY_KEY = 'sourceAvailabilityV2';
const SOURCE_OVERRIDES_KEY = 'sourceAvailabilityOverrides';
const SOURCE_ONE = 'Source #1';
const SOURCE_TWO = 'Source #2';
const EZCLASSWORK_SOURCE = SOURCE_TWO;
let sourceAvailabilityPromise = null;

function readSourceState(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

function sourceIsOverridden(source) {
    return readSourceState(SOURCE_OVERRIDES_KEY, {})[source] === true;
}

function sourceIsBlocked(source) {
    return readSourceState(SOURCE_AVAILABILITY_KEY, {})[source] === 'blocked' && !sourceIsOverridden(source);
}

function getSourceProbeUrl(game) {
    if (game.source === SOURCE_ONE) {
        return `https://cdn.jsdelivr.net/gh/freebuisness/html@main/${encodeURIComponent(game.foldername)}.html`;
    }
    if (game.source === SOURCE_TWO) return game.gameUrl;
    return null;
}

async function probeGameSource(url) {
    if (!url) return { reachable: false, inconclusive: false };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return { reachable: false, inconclusive: false };
        const html = await response.text();
        if (!html.trim()) return { reachable: false, inconclusive: false };
        const documentCopy = new DOMParser().parseFromString(html, 'text/html');
        return { reachable: Boolean(documentCopy.body && documentCopy.body.querySelector('*')), inconclusive: false };
    } catch {
        // CORS/network errors do not prove that an iframe source is unavailable.
        return { reachable: false, inconclusive: true };
    } finally {
        clearTimeout(timeout);
    }
}

async function checkSourceAvailability(games, force = false) {
    if (sourceAvailabilityPromise && !force) return sourceAvailabilityPromise;
    sourceAvailabilityPromise = (async () => {
        const state = readSourceState(SOURCE_AVAILABILITY_KEY, {});
        const sources = [...new Set(games.map(game => game.source))]
            .filter(source => source === SOURCE_ONE || source === SOURCE_TWO);
        const results = await Promise.all(sources.map(async source => {
            if (!force && (state[source] === 'available' || state[source] === 'blocked')) {
                return [source, state[source]];
            }
            const representative = games.find(game => game.source === source);
            const result = representative
                ? await probeGameSource(getSourceProbeUrl(representative))
                : { reachable: false, inconclusive: false };
            return [source, result.inconclusive ? 'available' : result.reachable ? 'available' : 'blocked'];
        }));
        results.forEach(([source, status]) => { state[source] = status; });
        localStorage.setItem(SOURCE_AVAILABILITY_KEY, JSON.stringify(state));
        renderSourceSettings();
        return state;
    })();
    return sourceAvailabilityPromise;
}

function renderSourceSettings() {
    const group = document.getElementById('source-settings-group');
    if (!group) return;
    const state = readSourceState(SOURCE_AVAILABILITY_KEY, {});
    const overrides = readSourceState(SOURCE_OVERRIDES_KEY, {});
    group.querySelectorAll('[data-source-setting]').forEach(input => {
        const source = input.dataset.sourceSetting;
        input.checked = overrides[source] === true;
        const status = group.querySelector(`[data-source-status="${source}"]`);
        if (status) status.textContent = state[source] === 'blocked' ? 'blocked' : state[source] === 'available' ? 'available' : 'checking';
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
        group.innerHTML = `<h6>Alternate Game Sources</h6><p>Blocked sources stay hidden unless overridden.</p>${[SOURCE_ONE, SOURCE_TWO].map(source => `<div class="modal-item"><label><input type="checkbox" data-source-setting="${source}"> Override ${source} <span data-source-status="${source}">checking</span></label></div>`).join('')}<div class="modal-item"><button type="button" id="source-recheck">Recheck sources</button></div>`;
        modalContent.appendChild(group);
    }
    if (group.dataset.sourceSettingsBound === 'true') return;
    group.dataset.sourceSettingsBound = 'true';

    group.querySelectorAll('[data-source-setting]').forEach(input => input.addEventListener('change', () => {
        const overrides = readSourceState(SOURCE_OVERRIDES_KEY, {});
        overrides[input.dataset.sourceSetting] = input.checked;
        localStorage.setItem(SOURCE_OVERRIDES_KEY, JSON.stringify(overrides));
        window.location.reload();
    }));
    group.querySelector('#source-recheck').addEventListener('click', () => {
        localStorage.removeItem(SOURCE_AVAILABILITY_KEY);
        window.location.reload();
    });
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
        imgsrc: '/assets/img/sddefault.jpg',
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

async function fetchgxmes() {
    const [gamesResponse, ezClassworkResponse] = await Promise.all([
        fetch('../json/list.json'),
        fetch('../json/ezclasswork.json')
    ]);
    const [gxmes, ezClassworkGames] = await Promise.all([
        gamesResponse.json(),
        ezClassworkResponse.json()
    ]);
    const allGames = gxmes.concat(normalizeEzClassworkGames(ezClassworkGames));
    await checkSourceAvailability(allGames);
    return filterAvailableGames(allGames);
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
        return `
            <div class="gxme-card" data-game-source="${getGameSourceGroup(gxme)}" ${isScraperGameEntry(gxme) ? 'data-scraper-game="true"' : ''}>
                ${badgeHTML}
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-gxme='${JSON.stringify(gxme)}'>
                    <i class="fas fa-star"></i>
                </button>
                <img src="${gxme.imgsrc}" alt="${gxme.name}">
                <h3>${gxme.name}</h3>
                <a href="${getGamePageUrl(gxme)}" class="play-link" data-gxme='${JSON.stringify(gxme)}'>Play Now</a>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.favorite-btn').forEach(button => {
        button.addEventListener('click', () => toggleFavorite(button));
    });

    container.querySelectorAll('.play-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const gxme = JSON.parse(link.dataset.gxme);
            updateLastPlayed(gxme);
            window.location.href = link.href;
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
    const last10gxmes = gxmes.slice(-10).reverse();
    rendergxmes(last10gxmes, 'last-10-gxmes', 'NEW');
}
function toggleFavorite(button) {
    const gxme = JSON.parse(button.dataset.gxme);
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
        const gxme = JSON.parse(button.dataset.gxme);
        const isFavorite = favorites.includes(gxme.name);
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