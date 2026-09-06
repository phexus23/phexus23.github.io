// Home page "Featured gxmes" showcase. Features only the Main
// (downloaded/self-hosted) catalog — Source #1/#2 games live behind their own
// tabs on the games hub instead of taking over the front page.

function hasRealImage(gxme) {
    return !(gxme.imgsrc || '').startsWith('data:image/svg+xml');
}

// Blocked requests can return HTTP 200 with an empty body or a stub page
// instead of the JSON catalog (school filters do this, and so do CDN
// outages), so the response is validated as a non-empty JSON array before
// it's trusted.
function validateCatalogResponse(text) {
    if (!text || !text.trim()) return null;
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    fetch('json/list.json', { cache: 'no-store' })
        .then(response => response.text())
        .then(validateCatalogResponse)
        .then(gxmes => {
            if (!gxmes) throw new Error('Main game catalog failed to load.');
            const gxmeGrid = document.getElementById('gxmeGrid');
            // Only Main games are featured, and only ones with a real
            // picture — never a generated placeholder.
            const featured = gxmes.filter(hasRealImage);
            const randomgxmes = featured.sort(() => 0.5 - Math.random()).slice(0, 4);

            randomgxmes.forEach(gxme => {
                let gxmeLink = document.createElement('a');
                gxmeLink.href = "/gxmes/" + gxme.foldername + "/";
                gxmeLink.style.textDecoration = 'none';
                gxmeLink.style.color = 'inherit';

                let gxmeCard = document.createElement('div');
                gxmeCard.classList.add('gxme-card');
                gxmeCard.dataset.gameSource = gxme.source || 'Main';
                gxmeCard.style.cursor = 'pointer';

                let img = document.createElement('img');
                img.src = gxme.imgsrc;
                img.alt = gxme.name;
                img.loading = 'lazy';
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
            console.error('Error loading featured gxmes:', error);
        });
});

function randombutton() {
    window.location.href = '/gxmes';
}