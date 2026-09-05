const SOURCE_ONE = 'Source #1';
const SOURCE_TWO = 'Source #2';

function isEzClassworkGameEntry(item) {
    return item && item.source === SOURCE_TWO;
}

function ezClassworkPlaceholderImage(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue},45%,35%)"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="72" fill="hsl(${hue},60%,88%)" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function normalizeEzClassworkGame(item) {
    return {
        ...item,
        imgsrc: ezClassworkPlaceholderImage(item.name),
        linksrc: '/gxmes/ezclasswork/',
        foldername: `ezclasswork-${item.slug}`,
        category: 'Classroom',
        source: SOURCE_TWO
    };
}

function isAvailableSourceTwoGame(item) {
    // Source #2 catalog entries whose wrapper file failed to download ("missing") are broken; skip them.
    return !(item && item.missing);
}

function isScraperGameEntry(item) {
    if (isEzClassworkGameEntry(item) || typeof item.linksrc !== 'string' || !item.linksrc.startsWith('/gxmes/')) {
        return false;
    }

    const imageSource = typeof item.imgsrc === 'string' ? item.imgsrc : '';
    return item.source === SOURCE_ONE ||
        /\/covers@main\/\d+\.png(?:[?#].*)?$/.test(imageSource) ||
        /_\d+\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(imageSource);
}

function getGameSource(item) {
    // Source #2 games are self-hosted: prefer the downloaded wrapper file we
    // host ourselves over the third-party embed URL (its assets still stream
    // from the jsdelivr CDN via the wrapper's <base href>).
    if (isEzClassworkGameEntry(item)) return item.file || item.embedUrl || item.gameUrl;
    // cdnfile is only set when our own URL slug (foldername) was cleaned up
    // (e.g. to drop "game"/"unblocked") and no longer matches the filename
    // the upstream freebuisness/html CDN actually hosts the game under.
    const cdnKey = item.cdnfile || item.foldername;
    return isScraperGameEntry(item) && cdnKey
        ? `https://cdn.jsdelivr.net/gh/freebuisness/html@main/${encodeURIComponent(cdnKey)}.html`
        : item.linksrc;
}

const SOURCE_DISABLED_KEY = 'sourceDisabled';

function readSourceState(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

function hasRealImage(item) {
    return !(item.imgsrc || '').startsWith('data:image/svg+xml');
}

// A whole source is only hidden by an explicit, manual toggle in Settings —
// never by an automatic reachability probe. Probing (or lazily flagging) one
// game and using the result to hide an entire source is fragile: one broken
// file used to wrongly hide every other, perfectly working game from that
// source. A specific broken game is instead removed from just the page it's
// on, by removeScraperGames() below, when its own iframe turns out blank.
function sourceIsBlocked(source) {
    return readSourceState(SOURCE_DISABLED_KEY, {})[source] === true;
}


function initializeGameAds() {
    const adSlots = document.querySelectorAll('ins.adsbygoogle');
    if (!adSlots.length) return;

    // Some older game wrappers do not include the AdSense script in their head.
    // Load it once here, while preserving the normal AdSense command queue.
    const adQueue = window.adsbygoogle = window.adsbygoogle || [];
    if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
        const adScript = document.createElement('script');
        adScript.async = true;
        adScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3858578074050552';
        adScript.crossOrigin = 'anonymous';
        document.head.appendChild(adScript);
    }

    adSlots.forEach((ins) => {
        if (ins.dataset.adsbygoogleStatus) return;
        try {
            adQueue.push({});
        } catch (e) {
            console.error('AdSense push failed:', e);
        }
    });
}

function hideGameStatus(status) {
    if (status) status.remove();
}

function removeScraperGames() {
    // Only removes this specific broken game from the current page — it does
    // not touch any global "Source #1 is blocked" state, so one dead file on
    // jsdelivr can no longer take every other Source #1 game down with it.
    const gamesToRemove = new Set();

    document.querySelectorAll('[data-scraper-game="true"]').forEach(element => {
        const game = element.closest('.game-frame-wrap, .game-card, .gxme-card, .search-game-card') || element;
        gamesToRemove.add(game);
    });

    gamesToRemove.forEach(game => game.remove());
    document.querySelector('.fullscreen-strip')?.remove();

    const title = document.getElementById('gameTitle');
    if (title) title.textContent = 'This game is unavailable.';
}

async function validateCdnGame(src) {
    try {
        const response = await fetch(src, { cache: 'no-store' });
        if (!response.ok) return false;

        const html = await response.text();
        if (!html.trim()) return false;

        const parsed = new DOMParser().parseFromString(html, 'text/html');
        return Boolean(parsed.body && parsed.body.querySelector('*'));
    } catch (error) {
        // A CORS/network read failure is inconclusive; the iframe may still load.
        return null;
    }
}

async function fetchData(index) {
    try {
        const ezClassworkSlug = new URLSearchParams(window.location.search).get('game');
        let item;

        if (ezClassworkSlug) {
            const response = await fetch('../../json/source2.json');
            const data = await response.json();
            const sourceItem = data.find(game => game.slug === ezClassworkSlug);
            if (!sourceItem || sourceItem.missing) throw new Error('Classroom game not found');
            item = normalizeEzClassworkGame(sourceItem);
        } else {
            const response = await fetch('../../json/list.json');
            const data = await response.json();
            item = data[index];
        }

        if (!item) throw new Error('Game not found');
        const name1 = item.name;
        const imgsrc = item.imgsrc;
        const src = getGameSource(item);

        console.log("name", name1);
        console.log("src", src);
        var allowedsites = ["maxwellstevenson.com", "phexus.netlify.app", "ph4xus.github.io", "phexus.bitbucket.io"];

        let windoworigin = window.location.host;
        var SiteText = "maxwellstevenson.com";
        
        if (allowedsites.includes(windoworigin)) {
            SiteText = window.location.host
            console.log(SiteText)
        }
        const iframe = document.getElementById('game-iframe');
        const status = document.getElementById('game-status');
        const isScraperGame = isScraperGameEntry(item) && Boolean(item.foldername);
        const source = item.source || (isScraperGame ? SOURCE_ONE : 'Main');
        iframe.removeAttribute('src');

        if (sourceIsBlocked(source)) {
            iframe.closest('.game-frame-wrap')?.remove();
            document.querySelector('.fullscreen-strip')?.remove();
            if (status) status.textContent = `${source} is unavailable.`;
            document.getElementById('gameTitle').textContent = `${source} is unavailable.`;
            return;
        }

        if (isScraperGame) {
            iframe.dataset.scraperGame = 'true';
            iframe.closest('.game-frame-wrap')?.setAttribute('data-scraper-game', 'true');
            let iframeLoaded = false;
            let validationComplete = false;
            let validationValid = false;
            const validationTimeout = window.setTimeout(() => {
                if (!iframeLoaded) removeScraperGames();
            }, 10000);

            iframe.addEventListener('load', () => {
                iframeLoaded = true;
                window.clearTimeout(validationTimeout);
                hideGameStatus(status);
                if (validationComplete && validationValid === false) removeScraperGames();
            }, { once: true });
            iframe.addEventListener('error', removeScraperGames, { once: true });
            validateCdnGame(src).then(isValid => {
                validationComplete = true;
                validationValid = isValid;
                if (isValid === false) removeScraperGames();
                else if (isValid === true) hideGameStatus(status);
            });
        } else {
            hideGameStatus(status);
        }

        iframe.src = src;
        const image = document.getElementById('bottomimage');
        image.src = imgsrc; 
        document.getElementById('gameTitle').textContent = 'Play ' + name1 + ' on ' + SiteText;
        const keywords = 'game, gxmes, ' + name1 + ' unblocked, ' + name1 + ' ' + SiteText + ', Vafor, Vafor IT, ' + name1 + ', ' + name1 + ' school, github gxmes, github ' + name1;
        var meta = document.querySelector('meta[name="description"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'description';
            document.getElementsByTagName('head')[0].appendChild(meta);
        }
        meta.content = 'Play ' + name1 + ' on maxwellstevenson.com';

        const savedTabName = localStorage.getItem('tabName');
        const savedTabImage = localStorage.getItem('tabImage');

        if (savedTabName && savedTabImage) {
            document.title = savedTabName;

            const savedFavicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
            savedFavicon.type = 'image/x-icon';
            savedFavicon.rel = 'shortcut icon';
            savedFavicon.href = savedTabImage;
            document.head.appendChild(savedFavicon);
        } else {
            document.title = 'Play ' + name1 + ' on maxwellstevenson.com';
            const imgSrc = imgsrc; document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon', href: imgSrc, id: 'faviconLink' }));
        }
    
        const keywordsArray = keywords.split(', ');

        const keywordsDiv = document.querySelector('.keywords');

        keywordsDiv.innerHTML = '<h3>Keywords:</h3>';

        keywordsArray.forEach(keyword => {
            const span = document.createElement('span');
            span.textContent = keyword;
            keywordsDiv.appendChild(span);
        });
        if (localStorage.getItem('leaveConf') == 'true') {
            window.addEventListener('beforeunload', function(e) {
                e.preventDefault();
                e.returnValue = ''; 
            });
            } else {
            window.removeEventListener('beforeunload', function(e) {
                e.preventDefault();
                e.returnValue = ''; 
            });
        }

        document.getElementById('game-iframe').focus();
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

function preferMainSource(games) {
    const preferred = new Map();
    games.forEach(game => {
        const key = String(game.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const current = preferred.get(key);
        if (!current || sourcePriority(game) < sourcePriority(current)) {
            preferred.set(key, game);
        }
    });
    return [...preferred.values()];
}

function sourcePriority(game) {
    return game.source === SOURCE_ONE ? 1 : game.source === SOURCE_TWO ? 2 : 0;
}

    async function fetchRecommendedGames() {
        try {
            const [gamesResponse, ezClassworkResponse] = await Promise.all([
                fetch('../../json/list.json'),
                fetch('../../json/source2.json')
            ]);
            const [data, ezClassworkGames] = await Promise.all([
                gamesResponse.json(),
                ezClassworkResponse.json()
            ]);
            const allGames = data.concat(ezClassworkGames.filter(isAvailableSourceTwoGame).map(normalizeEzClassworkGame));
            const recommendedGamesContainer = document.getElementById('recommendedGames');
            recommendedGamesContainer.innerHTML = ''; 

            const cardWidth = 220; 
            const containerWidth = recommendedGamesContainer.clientWidth;
            const cardsPerRow = Math.floor(containerWidth / cardWidth);

            const availableGames = allGames.filter(game => {
                const source = game.source || (isScraperGameEntry(game) ? SOURCE_ONE : 'Main');
                return !sourceIsBlocked(source);
            });
            // Recommended Games shows on every game page, so only promote
            // games with a real picture — not the generated placeholder used
            // for EZClasswork games that have no artwork of their own.
            const showcaseGames = preferMainSource(availableGames).filter(hasRealImage);
            const shuffledGames = showcaseGames.sort(() => 0.5 - Math.random()).slice(0, cardsPerRow);

            shuffledGames.forEach(game => {
                const gameCard = document.createElement('div');
                gameCard.className = 'game-card';
                gameCard.dataset.gameSource = game.source || (isScraperGameEntry(game) ? SOURCE_ONE : 'original');
                if (isScraperGameEntry(game) && game.foldername) {
                    gameCard.dataset.scraperGame = 'true';
                }
                gameCard.innerHTML = `
                    <a href="${isEzClassworkGameEntry(game) ? `/gxmes/ezclasswork/?game=${encodeURIComponent(game.slug)}` : `/gxmes/${game.foldername}/`}">
                    <img src="${game.imgsrc}" alt="${game.name}">
                    <p>${game.name}</p>
                    </a>
                `;
                recommendedGamesContainer.appendChild(gameCard);
            });
        } catch (error) {
            console.error('Error fetching recommended games:', error);
        }
    }
document.addEventListener("DOMContentLoaded", function () {
    const link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css";
    document.head.appendChild(link2);

    const bodyTag = document.body;
    bodyTag.innerHTML = `
        <style>
             * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: "Heebo", sans-serif;
            }

            html, body {
                height: 100%;
                margin: 0;
                display: flex;
                flex-direction: column;
                background-color: #2d2d2d;
                color: #eaeaea;
            }

            header {
                background-color: #3e3e3e;
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            header .title {
                color: #eaeaea;
                padding: 10px 20px;
                text-decoration: none;
                font-weight: 600;
                font-size: 1.1rem;
                transition: color 0.3s;
            }

            header .title:hover {
                color: #b7e1c0;
            }

            .content {
                flex: 1 0 auto;
                padding: 20px;
                text-align: center;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .game-info {
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .game-info h2 {
                color: #b7e1c0;
                margin-bottom: 10px;
                text-align: left;
                flex: 1;
            }

            .game-frame-wrap {
                position: relative;
                width: 80%;
                margin: 0 auto;
            }

            .game-status {
                position: absolute;
                top: 12px;
                left: 50%;
                z-index: 1;
                transform: translateX(-50%);
                padding: 6px 12px;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.75);
                color: #fff;
                font-size: 0.9rem;
                pointer-events: none;
            }

            .game-iframe {
                width: 100%;
                height: 70vh;
                border: none;
                border-radius: 10px 10px 0 0;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
                margin: 0 auto;
                display: block;
            }

            .fullscreen-strip {
                width: 80%;
                background-color: #555;
                padding: 5px 20px;
                display: flex;
                justify-content: flex-end;
                align-items: center;
                border-radius: 0 0 10px 10px;
                margin: 0 auto 20px;
                margin-top: -5px;
            }

            .fullscreen-btn {
                font-size: 1.5em;
                background: none;
                border: none;
                color: #fff;
                cursor: pointer;
                padding: 5px;
                transition: background 0.3s ease;
            }

            .fullscreen-btn:hover {
                background-color: #444;
            }

            .recommended-games {
                width: 80%;
                margin: 0 auto 20px;
                background-color: #3e3e3e;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
            }

            .recommended-games h3 {
                color: #b7e1c0;
                margin-bottom: 15px;
            }

            .games-list {
                display: flex;
                justify-content: space-between; 
                gap: 15px; 
                flex-wrap: wrap; 
            }

            .game-card {
                background-color: #444;
                border-radius: 10px;
                overflow: hidden;
                width: 220px;
                text-align: center;
                transition: transform 0.3s ease;
                flex: 0 0 auto;
                position: relative;
            }
            .game-card a {
                text-decoration: none;
            }

            .game-card:hover {
                transform: scale(1.05);
            }

            .game-card img {
                width: 100%;
                object-fit: cover;
                height:200px;
            }

            .game-card p {
                padding: 10px;
                font-size: 0.9rem;
                color: #eaeaea;
            }

            .keywords-section {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                background-color: #3e3e3e;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
                width: 80%;
                margin: 0 auto;
            }

            .keywords {
                width: 362px;
                text-align: left;
                display: flex;
                flex-wrap: wrap;
            }

            .keywords h3 {
                width: 100%;
                color: #b7e1c0;
                margin-bottom: 10px;
            }

            .keywords span {
                display: inline-block;
                background-color: #444;
                color: #eaeaea;
                padding: 5px 10px;
                margin: 5px;
                border-radius: 20px;
                font-size: 0.9rem;
                transition: background-color 0.3s, transform 0.2s;
            }

            .keywords span:hover {
                background-color: #b7e1c0;
                color: #1a1a1a;
                transform: scale(1.1);
            }

            .game-image {
                flex: 1;
                text-align: right;
            }

            .game-image img {
                width: 200px;
                height: 200px;
                border-radius: 10px;
            }

            footer {
                background-color: #1a1a1a;
                text-align: center;
                padding: 15px;
                color: #eaeaea;
            }

            footer a {
                color: #b7e1c0;
                text-decoration: none;
            }

            footer a:hover {
                color: #a0d1a4;
            }
            .center-adsense {
                text-align: center;
            }
          .unique-sidebar { 
            width:10%; 
            background: #444; 
            padding: 20px; 
            border-radius: 10px; 
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4); 
            position: absolute; 
            top: 170px; 
            height: 70vh;
            box-sizing: border-box; 
        }
        .unique-sidebar .ad-preview {
            background: #333; 
            color: #eaeaea; 
            padding: 10px; 
            margin-top: 10px; 
            border-radius: 8px; 
            text-align: center; 
            margin: 10px 0; 
        }
        .adbar-left {
            left:0;
            margin-left:7px;

        }
        .adbar-right {
            right:0;
            margin-right:7px;
        }
        @media (max-width: 1100px) {
            .unique-sidebar {
                display: none;
            }
        }
        @media (max-width: 700px) {
            .game-frame-wrap,
            .fullscreen-strip,
            .recommended-games,
            .keywords-section {
                width: 96%;
            }
            .keywords-section {
                flex-direction: column;
            }
            .keywords {
                width: 100%;
            }
            .game-image {
                text-align: left;
                margin-top: 15px;
            }
            .game-image img {
                width: 120px;
                height: 120px;
            }
        }
        </style>
        <header>
            <a class="title" href="/gxmes/">Vafor</a>
        </header>
        <div class="content">
            <div class="game-info">
                <h2 id="gameTitle">Loading...</h2>
            </div>
            <div class="game-frame-wrap">
                <span id="game-status" class="game-status" data-scraper-game-status="loading">Loading game...</span>
                <iframe id="game-iframe" class="game-iframe" src=""></iframe>
            </div>
            <div class="fullscreen-strip">
                <button class="fullscreen-btn" onclick="toggleFullscreen()">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
            <div class="unique-sidebar adbar-left">
                <div class="ad-preview">
                    <ins class="adsbygoogle"
                    style="display:block"
                    data-ad-client="ca-pub-3858578074050552"
                    data-ad-slot="8667470266"
                    data-ad-format="auto"
                    data-full-width-responsive="true"></ins>
                </div>
            </div>
            <div class="unique-sidebar adbar-right">
                <div class="ad-preview">
                    <ins class="adsbygoogle"
                    style="display:block"
                    data-ad-client="ca-pub-3858578074050552"
                    data-ad-slot="8667470266"
                    data-ad-format="auto"
                    data-full-width-responsive="true"></ins>
                </div>
            </div>
            <div>
            <ins class="adsbygoogle"
            style="display:block"
            data-ad-client="ca-pub-3858578074050552"
            data-ad-slot="3817988366"
            data-ad-format="auto"
            data-full-width-responsive="true"></ins>
            </div>
            <div class="recommended-games" data-nosnippet>
                <h3>Recommended Games</h3>
                <div class="games-list" id="recommendedGames"></div>
            </div>
            <div>
            <ins class="adsbygoogle"
            style="display:block"
            data-ad-client="ca-pub-3858578074050552"
            data-ad-slot="3817988366"
            data-ad-format="auto"
            data-full-width-responsive="true"></ins>
            </div>
            <div class="keywords-section">
                <div class="keywords">
                    <h3>Keywords:</h3>
                    <span>loading..</span>
                </div>
                <div class="game-image">
                    <img id="bottomimage">
                </div>
            </div>
        </div>
        <div class="center-adsense">
            <ins class="adsbygoogle"
            style="display:block"
            data-ad-client="ca-pub-3858578074050552"
            data-ad-slot="3817988366"
            data-ad-format="auto"
            data-full-width-responsive="true"></ins>
        </div>
        <footer>
            <p>© 2025 Vafor IT. All Rights Reserved.</p>
        </footer>
    `;

    window.addEventListener('resize', fetchRecommendedGames);

    
    fetchRecommendedGames();
    initializeGameAds();

});

    function toggleFullscreen() {
        const iframe = document.getElementById('game-iframe');
        if (iframe.requestFullscreen) {
            iframe.requestFullscreen();
        } else if (iframe.mozRequestFullScreen) {
            iframe.mozRequestFullScreen();
        } else if (iframe.webkitRequestFullscreen) {
            iframe.webkitRequestFullscreen();
        } else if (iframe.msRequestFullscreen) {
            iframe.msRequestFullscreen();
        }
    }