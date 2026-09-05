const navTabs = document.getElementById('nav-tabs');
const tabContents = document.getElementById('tab-contents');
let gxmes = [];
let categorySections = {};
let sourceSections = {};

const defaultSections = ['Favorites', 'last-played', 'top-10', 'last-10'];

function hideAllSections() {
    const sections = document.querySelectorAll('#tab-contents section');
    sections.forEach(section => section.style.display = 'none');
}

function showSection(id) {
    hideAllSections();
    const section = document.getElementById(id);
    if (section) section.style.display = 'block';
}

function addNavDivider(label) {
    if (document.getElementById('nav-divider-alt')) return;
    const li = document.createElement('li');
    li.id = 'nav-divider-alt';
    li.className = 'nav-divider';
    li.textContent = label;
    navTabs.insertBefore(li, document.getElementById('all-gxmes'));
}

function createCategorySection(category, isAltSource) {
    if (categorySections[category]) return;

    const section = document.createElement('section');
    section.id = `${category.toLowerCase()}-gxmes`;
    section.className = 'tab-content';
    section.innerHTML = `
        <h2>${category} gxmes</h2>
        <div class="gxmes-grid"></div>
    `;
    tabContents.appendChild(section);
    categorySections[category] = section;

    section.style.display = 'none';

    const li = document.createElement('li');
    li.id = category.toLowerCase();
    if (isAltSource) li.className = 'nav-alt-source';
    li.innerHTML = `<a>${category}</a>`;
    navTabs.insertBefore(li, document.getElementById('all-gxmes'));

    li.querySelector('a').addEventListener('click', () => {
        showSection(`${category.toLowerCase()}-gxmes`);
    });
}

function createSourceSection(source) {
    const sectionId = source === 'Source #1' ? 'source-1-gxmes' : 'source-2-gxmes';
    if (sourceSections[source]) return sectionId;

    const section = document.createElement('section');
    section.id = sectionId;
    section.className = 'tab-content';
    section.innerHTML = `
        <h2>${source} games</h2>
        <div class="gxmes-grid"></div>
    `;
    tabContents.appendChild(section);
    sourceSections[source] = section;
    section.style.display = 'none';

    const li = document.createElement('li');
    li.id = source === 'Source #1' ? 'source-1' : 'source-2';
    li.className = 'nav-alt-source';
    li.innerHTML = `<a>${source}</a>`;
    navTabs.insertBefore(li, document.getElementById('all-gxmes'));
    li.querySelector('a').addEventListener('click', () => showSection(sectionId));
    return sectionId;
}

function populategxmes(sectionId, gxmesList) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const grid = section.querySelector('.gxmes-grid');

    // Build the whole grid's markup once and assign it in a single write —
    // the old `grid.innerHTML += ...` inside the loop re-parsed the entire
    // accumulated HTML on every iteration, which is O(n^2) and was a large
    // part of why pages with hundreds of cards (all-games, EZClasswork) lagged.
    grid.innerHTML = gxmesList.map(gxme => {
        const isFavorite = favorites.includes(gxme.name);
        const sourceGroup = gxme.source || (typeof isScraperGameEntry === 'function' && isScraperGameEntry(gxme) ? 'Source #1' : 'Main');
        const srcLabel = sourceGroup === 'Source #1' ? 'SRC 1' : sourceGroup === 'Source #2' ? 'SRC 2' : null;
        return `
            <div class="gxme-card" data-game-source="${sourceGroup}" data-gxme-name="${gxme.name}" ${typeof isScraperGameEntry === 'function' && isScraperGameEntry(gxme) ? 'data-scraper-game="true"' : ''}>
                ${srcLabel ? `<span class="game-badge badge-src">${srcLabel}</span>` : ''}
                <button class="favorite-btn ${isFavorite ? 'active' : ''}">
                    <i class="fas fa-star"></i>
                </button>
                <img src="${gxme.imgsrc}" alt="${gxme.name}">
                <h3>${gxme.name}</h3>
                <a href="${typeof getGamePageUrl === 'function' ? getGamePageUrl(gxme) : `/gxmes/${gxme.foldername}/`}" class="play-link">Play Now</a>
            </div>
        `;
    }).join('');

    // Attach handlers by zipping with the source array (same order the markup
    // was built in) instead of round-tripping every game through JSON in a
    // data attribute — cheaper for hundreds of cards, and immune to names
    // containing quotes.
    grid.querySelectorAll('.gxme-card').forEach((card, i) => {
        const gxme = gxmesList[i];
        card.querySelector('.favorite-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            onlyforstar(this, gxme);
            if (sectionId === 'Favorites') diffrentname();
        });
        card.querySelector('.play-link').addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof updateLastPlayed === 'function') updateLastPlayed(gxme);
            window.location.href = e.currentTarget.href;
        });
    });
}

fetchgxmes().then(loadedGxmes => {
    gxmes = loadedGxmes;

    // Genre categories (Platformer, Action, Idle, ...) are the primary way to
    // browse; EZClasswork and the jsdelivr-scraped "Source #1" catalog are
    // alternate sources bolted on afterward. Keep them visually separated in
    // the sidebar instead of mixed in as if they were just more genres.
    const categories = [...new Set(gxmes.map(g => g.category))];
    const genreCategories = categories.filter(c => c !== 'EZClasswork');
    const altCategories = categories.filter(c => c === 'EZClasswork');

    genreCategories.forEach(category => {
        createCategorySection(category);
        populategxmes(`${category.toLowerCase()}-gxmes`, gxmes.filter(g => g.category === category));
    });

    const hasAltSources = altCategories.length > 0 || gxmes.some(g => getGameSourceGroup(g) !== 'Main');
    if (hasAltSources) addNavDivider('Alt Sources');

    altCategories.forEach(category => {
        createCategorySection(category, true);
        populategxmes(`${category.toLowerCase()}-gxmes`, gxmes.filter(g => g.category === category));
    });

    ['Source #1', 'Source #2'].forEach(source => {
        const sourceGames = gxmes.filter(game => getGameSourceGroup(game) === source);
        if (sourceGames.length > 0) {
            const sectionId = createSourceSection(source);
            populategxmes(sectionId, sourceGames);
        }
    });

    hideAllSections();
    defaultSections.forEach(id => {
        const section = document.getElementById(id);
        if (section) section.style.display = 'block';
    });
});

navTabs.addEventListener('click', e => {
    if (e.target.tagName !== 'A') return;

    const parentLi = e.target.parentElement;
    const tabId = parentLi.id || e.target.textContent.trim().toLowerCase();

    if (tabId === 'home') {
        hideAllSections();
        defaultSections.forEach(id => {
            const section = document.getElementById(id);
            if (section) section.style.display = 'block';
        });
        diffrentname();
    } else if (tabId === 'all-gxmes') {
        showSection('all-gxmes2');
    } else if (tabId === 'source-1') {
        showSection('source-1-gxmes');
    } else if (tabId === 'source-2') {
        showSection('source-2-gxmes');
    } else if (categorySections[tabId]) {
        showSection(`${tabId}-gxmes`);
    }
});
function onlyforstar(button, gxme) {
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
}
function diffrentname() {
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const favoritegxmes = gxmes.filter(g => favorites.includes(g.name));
    const favoritesContainer = document.getElementById('favorites');

    if (favoritegxmes.length === 0) {
        favoritesContainer.innerHTML = `<p>No favorites yet, hit the star to add some!</p>`;
    } else {
        populategxmes('Favorites', favoritegxmes);
    }
}
