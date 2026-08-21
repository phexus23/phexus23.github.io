const navTabs = document.getElementById('nav-tabs');
const tabContents = document.getElementById('tab-contents');
let gxmes = [];
let categorySections = {};

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

function populategxmes(sectionId, gxmesList) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const grid = section.querySelector('.gxmes-grid');
    grid.innerHTML = '';

    gxmesList.forEach(gxme => {
        const isFavorite = favorites.includes(gxme.name);
        const gxmeHTML = `
            <div class="gxme-card">
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-gxme='${JSON.stringify(gxme)}'>
                    <i class="fas fa-star"></i>
                </button>
                <img src="${gxme.imgsrc}" alt="${gxme.name}">
                <h3>${gxme.name}</h3>
                <a href="/gxmes/${gxme.foldername}/" class="play-link" data-gxme='${JSON.stringify(gxme)}'>Play Now</a>
            </div>
        `;
        grid.innerHTML += gxmeHTML;
    });

    if (sectionId === 'Favorites' || !defaultSections.includes(sectionId)) {
        const favBtns = section.querySelectorAll('.favorite-btn');
        favBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                onlyforstar(this);

                if (sectionId === 'Favorites') {
                    diffrentname();
                }   
            });
        });
    }
}

fetch('../json/list.json')
    .then(res => res.json())
    .then(data => {
        gxmes = data;

        const categories = [...new Set(gxmes.map(g => g.category))];
        categories.forEach(category => {
            createCategorySection(category);
            const catgxmes = gxmes.filter(g => g.category === category);
            populategxmes(`${category.toLowerCase()}-gxmes`, catgxmes);
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
    } else if (categorySections[tabId]) {
        showSection(`${tabId}-gxmes`);
    }
});
function onlyforstar(button) {
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