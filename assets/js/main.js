document.addEventListener('DOMContentLoaded', function() {
    fetch('json/list.json')
        .then(response => response.json())
        .then(data => {
            const gxmeGrid = document.getElementById('gxmeGrid');
            const scraperGamesDisabled = localStorage.getItem('scraperGamesDisabled') === 'true';
            const availableGames = scraperGamesDisabled
                ? data.filter(gxme => {
                    const imageSource = typeof gxme.imgsrc === 'string' ? gxme.imgsrc : '';
                    const isScraperGame = typeof gxme.linksrc === 'string' &&
                        gxme.linksrc.startsWith('/gxmes/') &&
                        (/\/covers@main\/\d+\.png(?:[?#].*)?$/.test(imageSource) ||
                            /_\d+\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(imageSource));
                    return !isScraperGame;
                })
                : data;
            const randomgxmes = availableGames.sort(() => 0.5 - Math.random()).slice(0, 4);

            randomgxmes.forEach(gxme => {
                let gxmeLink = document.createElement('a');
                gxmeLink.href = "/gxmes/" + gxme.foldername + "/";
                gxmeLink.style.textDecoration = 'none';
                gxmeLink.style.color = 'inherit';

                let gxmeCard = document.createElement('div');
                gxmeCard.classList.add('gxme-card');
                gxmeCard.style.cursor = 'pointer';

                let img = document.createElement('img');
                img.src = gxme.imgsrc;
                img.alt = gxme.name;
                img.style.height = "145px";
                img.style.width = "145px";

                let h3 = document.createElement('h3');
                h3.textContent = gxme.name;

                gxmeCard.appendChild(img);
                gxmeCard.appendChild(h3);
                gxmeLink.appendChild(gxmeCard);
                gxmeGrid.appendChild(gxmeLink);
            });
        })
        .catch(error => {
            console.error('Error loading the list.json:', error);
        });
});

function randombutton() {
    window.location.href = '/gxmes';
}