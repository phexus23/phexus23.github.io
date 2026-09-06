const navTabs = document.getElementById('nav-tabs');
const tabContents = document.getElementById('tab-contents');
let gxmes = [];
let categorySections = {};
let sourceSections = {};

const defaultSections = ['Favorites', 'last-played', 'top-10', 'last-10'];

const sourceSlug = source => source === SOURCE_MAIN ? 'main' : source === SOURCE_TWO ? 'source-2' : 'source-1';

// The source nav tabs are removable: a source whose catalog failed to load
// (or whose runtime probe found it unreachable/blocked) gets its tab and
// section taken back out instead of dead-ending visitors on an empty grid.
function removeSourceTab(source) {
    const li = document.getElementById(sourceSlug(source));
    if (li) li.remove();
    const section = sourceSections[source];
    if (section) {
        // If the visitor is staring at that section right now, drop back to
        // the home view instead of leaving them on a just-emptied page.
        if (section.style.display === 'block') {
            hideAllSections();
            defaultSections.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'block';
            });
        }
        section.remove();
        delete sourceSections[source];
    }
}

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
    const before = document.getElementById('all-gxmes');
    if (before) navTabs.insertBefore(li, before); else navTabs.appendChild(li);

    li.querySelector('a').addEventListener('click', () => {
        showSection(sectionId);
    });
}

function populategxmes(sectionId, gxmesList) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const grid = section.querySelector('.gxmes-grid');

    // Delegates to the shared chunked renderer in script.js so the big
    // Source #1/#2 grids (~835 cards) render lazily as the visitor scrolls.
    // The favorites flow here uses onlyforstar (no live favorites-section
    // refresh except on the Favorites tab itself).
    renderGamesGrid(grid, gxmesList, {
        favorites: () => JSON.parse(localStorage.getItem('favorites')) || [],
        onFavorite: (button, gxme) => {
            onlyforstar(button, gxme);
            if (sectionId === 'Favorites') diffrentname();
        }
    });
}

// A source only gets a sidebar tab if its catalog actually loaded with
// playable games. Sources whose JSON failed (404, empty/stub body from a
// filter, malformed JSON) resolve as empty lists — this is where they get
// skipped instead of rendering an empty grid.
function sourceHasGames(catalog, source) {
    return catalogLoaded(getCatalogHealth(), source) && catalog[source] && catalog[source].length > 0;
}

// Runtime reachability check per source. The catalog JSONs are served by this
// same site, so them loading only proves the *catalog* arrived — the games
// themselves live upstream (Source #1 wrappers, Source #2 Apps Script embeds)
// and can be down or filtered while the hub still loads fine. One
// representative game per source is probed; unreachable or blocked-to-nothing
// sources lose their tab for this page load.
const SOURCE_PROBE_URLS = {
    [SOURCE_ONE]: '/Vafor_IT/source2/bowmasters.html',
    [SOURCE_TWO]: 'https://script.google.com/macros/s/AKfycbw73xjm9WWdI_rMibzPh2MImZBf6tsNOoUnhotODbh0qEG5jHf5UvD4K5uDVwtgEnQw8Q/exec'
};

function probeSourceTabs(catalog) {
    const sources = [SOURCE_ONE, SOURCE_TWO].filter(source => sourceHasGames(catalog, source));
    if (!sources.length) return;

    Promise.allSettled(sources.map(source => probeSourceUp(SOURCE_PROBE_URLS[source]))).then(results => {
        results.forEach((result, i) => {
            const source = sources[i];
            const up = result.status === 'fulfilled' && result.value === true;
            if (!up) {
                console.warn(`[source] ${source} probe failed; hiding its tab this page load.`, result.reason || '');
                removeSourceTab(source);
            }
            setSourceStatus(source, up);
        });
    });
}

fetchSourceCatalog().then(catalog => {
    // The module-level gxmes feeds name-keyed features like the Favorites
    // listing, so it must be the deduped combined catalog — otherwise a game
    // that exists in more than one source shows up multiple times there.
    gxmes = filterAvailableGames(preferMainSource([
        ...catalog[SOURCE_MAIN],
        ...catalog[SOURCE_ONE],
        ...catalog[SOURCE_TWO]
    ]));

    // Genre tabs stay built from the downloaded Main catalog only — that's
    // the curated shelf. The merged scraped catalog gets one dedicated
    // sidebar tab so it's still one click away without flooding the genre
    // tabs with duplicate copies of games.
    const categories = [...new Set(catalog[SOURCE_MAIN].map(g => g.category))];
    categories.forEach(category => {
        createCategorySection(category);
        populategxmes(`${category.toLowerCase()}-gxmes`, catalog[SOURCE_MAIN].filter(g => g.category === category));
    });

    [SOURCE_MAIN, SOURCE_ONE, SOURCE_TWO].forEach(source => {
        if (!sourceHasGames(catalog, source)) return;
        createSourceSection(source);
        populategxmes(`${sourceSlug(source)}-gxmes`, catalog[source]);
    });

    hideAllSections();
    defaultSections.forEach(id => {
        const section = document.getElementById(id);
        if (section) section.style.display = 'block';
    });

    probeSourceTabs(catalog);
}).catch(error => {
    // One dead source never blanks the whole page anymore (the catalog
    // fetch is allSettled); this catch only fires if the browser itself
    // is too old for allSettled or something truly unexpected throws.
    console.error('[tabs] Sidebar failed to build:', error);
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
    } else if (sourceSections[SOURCE_MAIN] && tabId === sourceSlug(SOURCE_MAIN)) {
        showSection(`${sourceSlug(SOURCE_MAIN)}-gxmes`);
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
