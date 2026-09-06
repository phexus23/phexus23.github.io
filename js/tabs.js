const navTabs = document.getElementById('nav-tabs');
const tabContents = document.getElementById('tab-contents');
let gxmes = [];
let categorySections = {};
let sourceSections = {};

const defaultSections = ['Favorites', 'last-played', 'top-10', 'last-10'];

const sourceSlug = source => source === SOURCE_ONE ? 'source-1' : 'source-2';

function hideAllSections() {
    const sections = document.querySelectorAll('#tab-contents section');
    sections.forEach(section => section.style.display = 'none');
}

function showSection(id) {
    hideAllSections();
    const section = document.getElementById(id);
    if (section) section.style.display = 'block';
}

function createCategorySection(category) {
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
    li.innerHTML = `<a>${category}</a>`;
    navTabs.insertBefore(li, document.getElementById('all-gxmes'));

    li.querySelector('a').addEventListener('click', () => {
        showSection(`${category.toLowerCase()}-gxmes`);
    });
}

function createSourceSection(source) {
    const sectionId = `${sourceSlug(source)}-gxmes`;
    if (sourceSections[source]) return;

    const section = document.createElement('section');
    section.id = sectionId;
    section.className = 'tab-content';
    section.innerHTML = `
        <h2>${source} gxmes</h2>
        <div class="gxmes-grid"></div>
    `;
    tabContents.appendChild(section);
    sourceSections[source] = section;

    section.style.display = 'none';

    const li = document.createElement('li');
    li.id = sourceSlug(source);
    li.innerHTML = `<a>${source}</a>`;
    navTabs.insertBefore(li, document.getElementById('all-gxmes'));

    li.querySelector('a').addEventListener('click', () => {
        showSection(sectionId);
    });
}

function populategxmes(sectionId, gxmesList) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const grid = section.querySelector('.gxmes-grid');

    // Build the whole grid's markup once and assign it in a single write —
    // the old `grid.innerHTML += ...` inside the loop re-parsed the entire
    // accumulated HTML on every iteration, which is O(n^2) and was a large
    // part of why pages with hundreds of cards (all-games, the Source tabs)
    // lagged.
    grid.innerHTML = gxmesList.map(gxme => {
        const isFavorite = favorites.includes(gxme.name);
        const sourceGroup = typeof getGameSourceGroup === 'function' ? getGameSourceGroup(gxme) : (gxme.source || 'Main');
        const isScraper = typeof isScraperGameEntry === 'function' && isScraperGameEntry(gxme);
        return `
            <div class="gxme-card" data-game-source="${sourceGroup}" data-gxme-name="${gxme.name}" ${isScraper ? 'data-scraper-game="true"' : ''}>
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

fetchSourceCatalog().then(catalog => {
    gxmes = [...catalog.main, ...catalog[SOURCE_ONE], ...catalog[SOURCE_TWO]];

    // Genre tabs stay built from the downloaded Main catalog only — that's
    // the curated shelf. The two scraped catalogs get one dedicated sidebar
    // tab each so they're still one click away without flooding the genre
    // tabs with duplicate copies of games.
    const categories = [...new Set(catalog.main.map(g => g.category))];
    categories.forEach(category => {
        createCategorySection(category);
        populategxmes(`${category.toLowerCase()}-gxmes`, catalog.main.filter(g => g.category === category));
    });

    [SOURCE_ONE, SOURCE_TWO].forEach(source => {
        createSourceSection(source);
        populategxmes(`${sourceSlug(source)}-gxmes`, catalog[source]);
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
    } else if (sourceSections[SOURCE_ONE] && tabId === sourceSlug(SOURCE_ONE)) {
        showSection(`${sourceSlug(SOURCE_ONE)}-gxmes`);
    } else if (sourceSections[SOURCE_TWO] && tabId === sourceSlug(SOURCE_TWO)) {
        showSection(`${sourceSlug(SOURCE_TWO)}-gxmes`);
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
