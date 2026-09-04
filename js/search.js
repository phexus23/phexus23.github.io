const searchContainer = document.querySelector(".search-container");

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("search-input");
  const resultsContainer = document.getElementById("search-results");

  let gxmes = [];

  Promise.all([
    fetch("../json/list.json").then(res => res.json()),
    fetch("../json/ezclasswork.json").then(res => res.json())
  ]).then(async ([data, ezClassworkGames]) => {
      const normalizedEzGames = typeof normalizeEzClassworkGames === 'function'
        ? normalizeEzClassworkGames(ezClassworkGames)
        : ezClassworkGames;
      const allGames = data.concat(normalizedEzGames);
      if (typeof checkSourceAvailability === 'function') {
        await checkSourceAvailability(allGames);
      }
      gxmes = typeof filterAvailableGames === 'function' ? filterAvailableGames(allGames) : allGames;
    });

  searchInput.addEventListener("input", () => {
    searchContainer.style.borderBottomLeftRadius = "0";
    searchContainer.style.borderBottomRightRadius = "0";
    document.getElementById("search-results").classList.add("active");
    const query = searchInput.value.toLowerCase();
    resultsContainer.innerHTML = "";

    if (query.length === 0) {
      resultsContainer.innerHTML = "Try searching somethin or hit esc";
      return;
    }

    const filtered = gxmes.filter(gxme =>
      gxme.name.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      resultsContainer.innerHTML = "Nothing found with the search of: " + query;
      return;
    }

    resultsContainer.style.display = "block";

    filtered.forEach(gxme => {
      const card = document.createElement("div");
      card.className = "search-game-card";
      card.dataset.gameSource = gxme.source || (typeof isScraperGameEntry === 'function' && isScraperGameEntry(gxme) ? 'Source #1' : 'Main');
      card.dataset.sourceLabel = gxme.source === 'Source #1'
        ? 'Source #1'
        : gxme.source === 'Source #2' ? 'Source #2' : 'Main';
      if (typeof isScraperGameEntry === 'function' && isScraperGameEntry(gxme)) {
        card.dataset.scraperGame = "true";
      }
      card.innerHTML = `
        <a href="${typeof getGamePageUrl === 'function' ? getGamePageUrl(gxme) : `/gxmes/${gxme.foldername}/`}">
          <img src="${gxme.imgsrc}" alt="${gxme.name}">
          <h3>${gxme.name}</h3>
        </a>
      `;
      resultsContainer.appendChild(card);
    });
  });

  document.addEventListener("click", (e) => {
    if (!document.querySelector(".search-wrapper").contains(e.target)) {
      resultsContainer.style.display = "none";
      document.getElementById("search-results").classList.remove("active"); 
    }
  searchContainer.style.borderBottomLeftRadius = "10px";
  searchContainer.style.borderBottomRightRadius = "10px";
  });
});