async function fetchData(index) {
    try {
        const response = await fetch('../../json/list.json');
        const data = await response.json();
        const item = data[index];
        const name1 = item.name;
        const imgsrc = item.imgsrc;
        const src = item.linksrc;

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
    async function fetchRecommendedGames() {
        try {
            const response = await fetch('../../json/list.json');
            const data = await response.json();
            const recommendedGamesContainer = document.getElementById('recommendedGames');
            recommendedGamesContainer.innerHTML = ''; 

            const cardWidth = 220; 
            const containerWidth = recommendedGamesContainer.clientWidth;
            const cardsPerRow = Math.floor(containerWidth / cardWidth);

            const shuffledGames = data.sort(() => 0.5 - Math.random()).slice(0, cardsPerRow);

            shuffledGames.forEach(game => {
                const gameCard = document.createElement('div');
                gameCard.className = 'game-card';
                gameCard.innerHTML = `
                    <a href="/gxmes/${game.foldername}/">
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

            .game-iframe {
                width: 80%;
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
        </style>
        <header>
            <a class="title" href="/gxmes/">Vafor</a>
        </header>
        <div class="content">
            <div class="game-info">
                <h2 id="gameTitle">Loading...</h2>
            </div>
            <iframe id="game-iframe" class="game-iframe" src=""></iframe>
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
    for (let i = 0; i < 5; i++) {
        (adsbygoogle = window.adsbygoogle || []).push({});
    }

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