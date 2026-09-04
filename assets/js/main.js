const SOURCE_ONE = 'Source #1';
const SOURCE_TWO = 'Source #2';
const SOURCE_AVAILABILITY_KEY = 'sourceAvailability';
const SOURCE_OVERRIDES_KEY = 'sourceAvailabilityOverrides';

function readSourceState(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function sourceIsOverridden(source) {
    return readSourceState(SOURCE_OVERRIDES_KEY, {})[source] === true;
}

function sourceIsEnabled(source) {
    return readSourceState(SOURCE_AVAILABILITY_KEY, {})[source] !== 'blocked' || sourceIsOverridden(source);
}

async function probeSource(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const html = response.ok ? await response.text() : '';
        const parsed = html.trim() ? new DOMParser().parseFromString(html, 'text/html') : null;
        return { reachable: Boolean(parsed && parsed.body && parsed.body.querySelector('*')), inconclusive: false };
    } catch {
        return { reachable: false, inconclusive: false };
    }
    finally { clearTimeout(timeout); }
}

async function checkHomepageSources(games) {
    const state = readSourceState(SOURCE_AVAILABILITY_KEY, {});
    for (const source of [SOURCE_ONE, SOURCE_TWO]) {
        if (state[source] === 'available' || state[source] === 'blocked') continue;
        const representative = games.find(game => game.source === source);
        const result = representative && await probeSource(
            source === SOURCE_ONE
                ? `https://cdn.jsdelivr.net/gh/freebuisness/html@main/${encodeURIComponent(representative.foldername)}.html`
                : representative.gameUrl
        );
        state[source] = result && result.reachable ? 'available' : 'blocked';
    }
    localStorage.setItem(SOURCE_AVAILABILITY_KEY, JSON.stringify(state));
}

function createSourceSettings() {
    if (document.getElementById('source-settings-button')) return;
    const button = document.createElement('button');
    button.id = 'source-settings-button';
    button.type = 'button';
    button.textContent = 'Source Settings';
    button.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:10000;padding:8px 12px;border:1px solid #777;border-radius:6px;background:#3e3e3e;color:#fff;cursor:pointer;';

    const panel = document.createElement('div');
    panel.id = 'source-settings-panel';
    panel.hidden = true;
    panel.style.cssText = 'position:fixed;left:12px;bottom:54px;z-index:10000;width:250px;padding:14px;border:1px solid #777;border-radius:8px;background:#2d2d2d;color:#fff;box-shadow:0 4px 16px #0008;';
    panel.innerHTML = `<strong>Game source settings</strong><p style="margin:8px 0;font-size:.85rem;">Blocked sources stay hidden unless overridden.</p>${[SOURCE_ONE, SOURCE_TWO].map(source => `<label style="display:block;margin:8px 0;"><input type="checkbox" data-source-setting="${source}"> Override ${source} <span data-source-status="${source}">checking</span></label>`).join('')}<button type="button" id="source-recheck" style="margin-top:8px;padding:5px 8px;">Recheck sources</button>`;

    function render() {
        const state = readSourceState(SOURCE_AVAILABILITY_KEY, {});
        const overrides = readSourceState(SOURCE_OVERRIDES_KEY, {});
        panel.querySelectorAll('[data-source-setting]').forEach(input => {
            const source = input.dataset.sourceSetting;
            input.checked = overrides[source] === true;
            const status = panel.querySelector(`[data-source-status="${source}"]`);
            if (status) status.textContent = state[source] || 'checking';
        });
    }

    button.addEventListener('click', () => { panel.hidden = !panel.hidden; render(); });
    panel.querySelectorAll('[data-source-setting]').forEach(input => input.addEventListener('change', () => {
        const overrides = readSourceState(SOURCE_OVERRIDES_KEY, {});
        overrides[input.dataset.sourceSetting] = input.checked;
        localStorage.setItem(SOURCE_OVERRIDES_KEY, JSON.stringify(overrides));
        window.location.reload();
    }));
    panel.querySelector('#source-recheck').addEventListener('click', () => {
        localStorage.removeItem(SOURCE_AVAILABILITY_KEY);
        window.location.reload();
    });
    document.body.append(button, panel);
}

document.addEventListener('DOMContentLoaded', function() {
    createSourceSettings();
    Promise.all([
        fetch('json/list.json').then(response => response.json()),
        fetch('json/ezclasswork.json').then(response => response.json())
    ])
        .then(async ([data, ezClassworkGames]) => {
            const ezGames = ezClassworkGames.map(game => ({
                ...game,
                imgsrc: '/assets/img/sddefault.jpg',
                foldername: `ezclasswork-${game.slug}`,
                category: 'EZClasswork',
                source: 'Source #2'
            }));
            const allGames = data.concat(ezGames);
            await checkHomepageSources(allGames);
            const gxmeGrid = document.getElementById('gxmeGrid');
            const availableGames = allGames.filter(gxme => sourceIsEnabled(gxme.source));
            const randomgxmes = preferMainSource(availableGames).sort(() => 0.5 - Math.random()).slice(0, 4);

            randomgxmes.forEach(gxme => {
                let gxmeLink = document.createElement('a');
                gxmeLink.href = gxme.source === 'Source #2'
                    ? `/gxmes/ezclasswork/?game=${encodeURIComponent(gxme.slug)}`
                    : "/gxmes/" + gxme.foldername + "/";
                gxmeLink.style.textDecoration = 'none';
                gxmeLink.style.color = 'inherit';

                let gxmeCard = document.createElement('div');
                gxmeCard.classList.add('gxme-card');
                gxmeCard.dataset.gameSource = gxme.source || 'Main';
                gxmeCard.dataset.sourceLabel = gxme.source === 'Source #1'
                    ? 'Source #1'
                    : gxme.source === 'Source #2' ? 'Source #2' : 'Main';
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

function preferMainSource(gxmes) {
    const preferred = new Map();
    gxmes.forEach(gxme => {
        const key = String(gxme.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const current = preferred.get(key);
        if (!current || sourcePriority(gxme) < sourcePriority(current)) {
            preferred.set(key, gxme);
        }
    });
    return [...preferred.values()];
}

function sourcePriority(gxme) {
    return gxme.source === 'Source #1' ? 1 : gxme.source === 'Source #2' ? 2 : 0;
}

function randombutton() {
    window.location.href = '/gxmes';
}