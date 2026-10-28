/* Home, All apps and Lab screens; app list loading, launching and HDMI inputs. */
(function () {
    'use strict';

    var CACHE_KEY = 'arn0.apps.v1';
    var REFRESH_AFTER_MS = 5 * 60 * 1000;
    var GRID_COLS = 5;

    var cfg = window.LAUNCHER_CONFIG;
    var log = DevLog.log;
    var $ = UI.$;
    var el = UI.el;
    var KEY = UI.KEY;

    var state = {
        apps: [],              // launchable apps from the TV (or the cache)
        appsSig: null,
        lastFetch: 0,
        showEverything: false, // All apps: bypass the consumer filter
        tvMode: false,         // HDMI shown inside the launcher
        hdmi: {},              // last known { port: connected }
        hdmiSig: null,
        accountName: '',       // first name from the TV's account, when the platform gives one
        launch: null,          // the open-app animation still covering the screen, see launchFx
        scrollY: 0,            // how far Home has slid up for a row near the bottom
        spot: null,            // the title whose backdrop is up behind Home, see spotlight()
        spotFront: 0,          // which of the two backdrop layers is showing
        spotToken: 0
    };

    /*
     * Rows under the apps, in the order of Settings ▸ Home rows. `tmdb` rows need a TMDB key;
     * `title` is the I18n key of the heading.
     */
    var ROWS = [
        { key: 'inputs', title: 'inputs' },
        { key: 'trending', title: 'trending', tmdb: true },
        { key: 'top', title: 'top', tmdb: true },
        { key: 'fresh', title: 'fresh', tmdb: true }
    ];

    // ---------- Tiles

    // Pre-coloured by scripts/build-marks.mjs
    function markEl(brand) {
        var m = new Image();
        m.className = 'mark';
        m.src = 'img/tiles/' + brand.key + '.svg';
        if (brand.pad) {
            m.style.top = brand.pad[0] + '%';
            m.style.height = (100 - 2 * brand.pad[0]) + '%';
            m.style.left = brand.pad[1] + '%';
            m.style.width = (100 - 2 * brand.pad[1]) + '%';
        }
        return m;
    }

    function initials(label) {
        var words = label.replace(/[^\w\s+]/g, ' ').trim().split(/\s+/);
        return (words[0] ? words[0][0] : '?') + (words[1] ? words[1][0] : '');
    }

    function hue(text) {
        var h = 0;
        for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
        return h;
    }

    // Installed apps report a native path; it may or may not be readable from a web app.
    function tryIcon(tile, mono, path) {
        var img = new Image();
        img.className = 'icon';
        img.onload = function () {
            mono.style.display = 'none';
            tile.appendChild(img);
        };
        img.src = path.charAt(0) === '/' ? 'file://' + path : path;
    }

    function rgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    }

    /*
     * Focus glow colour: the brand's own `glow`, else the most saturated colour among its
     * background and logo — Netflix glows red rather than the near-black of its tile, and a
     * brand that is only black and white glows white.
     */
    function glow(brand) {
        if (brand.glow) return brand.glow;
        var best = null;
        var bestSat = -1;
        ((brand.bg || '') + ' ' + (brand.fg || '')).replace(/#[0-9a-f]{6}\b/gi, function (hex) {
            var c = rgb(hex);
            var sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
            if (sat > bestSat) {
                bestSat = sat;
                best = hex;
            }
            return hex;
        });
        if (!best || bestSat < 40) return 'rgba(255, 255, 255, 0.28)';
        var c = rgb(best);
        return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', 0.55)';
    }

    function tileFace(item) {
        var tile = el('div', 'tile');
        if (item.brand) {
            tile.style.background = item.brand.bg;
            tile.style.setProperty('--glow', glow(item.brand));
            if (item.brand.text) {
                // Long names ("globoplay") would otherwise touch the tile's edges.
                var word = el('div', 'wordmark' + (item.brand.text.length > 6 ? ' long' : ''), item.brand.text);
                word.style.color = item.brand.fg;
                tile.appendChild(word);
            } else {
                tile.appendChild(markEl(item.brand));
            }
        } else {
            var h = hue(item.label);
            tile.style.background = 'linear-gradient(135deg, hsl(' + h + ',34%,22%), hsl(' + h + ',40%,32%))';
            tile.style.setProperty('--glow', 'hsla(' + h + ',60%,50%,0.5)');
            var mono = el('div', 'mono', initials(item.label).toUpperCase());
            tile.appendChild(mono);
            if (item.iconPath) tryIcon(tile, mono, item.iconPath);
        }
        return tile;
    }

    function appTile(item) {
        var wrap = el('div', 'app');
        wrap.appendChild(tileFace(item));
        wrap.appendChild(el('div', 'label', item.label));
        wrap._item = item;
        return wrap;
    }

    function voteText(title) {
        return title.vote ? '★ ' + title.vote.toLocaleString(I18n.locale(), { maximumFractionDigits: 1 }) : '';
    }

    // TMDB's poster, with the title on the tile until the image arrives. `sub`: the line under it.
    function posterTile(title, sub) {
        var wrap = el('div', 'poster');
        var tile = el('div', 'tile');
        tile.appendChild(el('div', 'poster-fallback', title.title));
        if (title.poster) {
            var img = new Image();
            img.className = 'poster-img';
            img.onload = function () { tile.classList.add('loaded'); };
            img.src = Tmdb.image(title.poster, 'w342');
            tile.appendChild(img);
        }
        wrap.appendChild(tile);
        wrap.appendChild(el('div', 'label', title.title));
        wrap.appendChild(el('div', 'poster-sub', sub || ''));
        wrap._item = { kind: 'title', title: title };
        return wrap;
    }

    // Top 10: the rank in outline numerals, half behind the poster.
    function rankedTile(title, rank, sub) {
        var wrap = posterTile(title, sub);
        wrap.classList.add('ranked');
        wrap.insertBefore(el('div', 'rank' + (rank > 9 ? ' wide' : ''), String(rank)), wrap.firstChild);
        return wrap;
    }

    // Small tile used in Settings lists.
    function miniTile(item) {
        var wrap = el('div', 'mini');
        wrap.appendChild(tileFace(item));
        return wrap;
    }

    function allAppsTile() {
        var wrap = el('div', 'app');
        var tile = el('div', 'tile all-tile');
        tile.innerHTML = '<svg viewBox="0 0 24 24" fill="#fff"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/>' +
            '<rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/>' +
            '<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>';
        wrap.appendChild(tile);
        wrap.appendChild(el('div', 'label', I18n.t('allApps')));
        wrap._item = { kind: 'all' };
        return wrap;
    }

    var HDMI_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linejoin="round"><path d="M2.5 8h19v4.5l-2.5 3.5H5l-2.5-3.5z"/><path d="M7 11h10"/></svg>';

    // `named` is false for a port nobody has labelled: its name is already "HDMI 2".
    function inputTile(input, named) {
        var brand = findBrand(input.brand || '') || { bg: 'linear-gradient(135deg, #252a35, #343b4a)', fg: '#fff', mark: null };
        var wrap = el('div', 'input');
        var tile = el('div', 'tile');
        tile.style.background = brand.bg;
        tile.style.setProperty('--glow', brand.mark ? glow(brand) : 'rgba(255, 255, 255, 0.22)');
        if (brand.mark) {
            tile.appendChild(markEl(brand));
        } else {
            var glyph = el('div', 'mark glyph');
            glyph.innerHTML = HDMI_GLYPH;
            tile.appendChild(glyph);
        }
        var meta = el('div', 'meta');
        meta.appendChild(el('div', 'name', input.label));
        var port = el('div', 'port');
        var dot = el('span', 'dot on');
        port.appendChild(dot);
        port.appendChild(document.createTextNode((named ? 'HDMI ' + input.hdmi + ' · ' : '') + I18n.t('connected')));
        meta.appendChild(port);
        tile.appendChild(meta);
        wrap.appendChild(tile);
        wrap._item = { kind: 'input', hdmi: input.hdmi, label: input.label, method: input.method };
        return wrap;
    }

    // Console tile for Settings lists: brand colours and logo only.
    function miniInputTile(input) {
        var brand = findBrand(input.brand || '');
        return miniTile({ label: input.label, brand: brand && { key: brand.key, bg: brand.bg, fg: brand.fg, mark: brand.mark } });
    }

    // ---------- Home content

    // Names for HDMI ports: edited list from Settings, else config.js. Not what Home shows: see
    // connectedInputs.
    function inputs() {
        return Prefs.get().inputs || cfg.inputs || [];
    }

    function setInputs(list) {
        Prefs.get().inputs = list;
        Prefs.save();
        renderHome();
    }

    // Entries shown on Home: edited list from Settings, else config.js.
    function homeEntries() {
        return (Prefs.get().home || cfg.apps || []).filter(function (e) { return !e.hidden; });
    }

    function homeItems() {
        return Apps.curated(state.apps, { apps: homeEntries() });
    }

    function setHomeItems(items) {
        Prefs.get().home = items.map(function (i) {
            var entry = { id: i.id, label: i.label };
            if (i.brand) entry.brand = i.brand.key;
            return entry;
        });
        Prefs.save();
        renderHome();
    }

    function rowPrefs() {
        return Prefs.get().rows;
    }

    function rowOn(key) {
        return rowPrefs().hidden.indexOf(key) < 0;
    }

    // Shelves follow the saved order; the apps always come first.
    function orderRows() {
        var shelves = $('apps-section').parentNode;
        rowPrefs().order.forEach(function (key) {
            var section = shelves.querySelector('[data-row="' + key + '"]');
            if (section) shelves.appendChild(section);
        });
    }

    function renderHome() {
        $('apps-title').textContent = I18n.t('apps');
        $('inputs-title').textContent = I18n.t('inputs');
        orderRows();
        $('search-btn').classList.toggle('hidden', !Tmdb.configured());
        var row = $('apps-row');
        row.innerHTML = '';
        var items = homeItems();
        if (!items.length) items = Apps.allSorted(state.apps, false).slice(0, 8);
        items.forEach(function (item) { row.appendChild(appTile(item)); });
        row.appendChild(allAppsTile());

        renderInputs();
        renderTitleRows();
        refreshTrending();
        if (UI.isVisible('home')) UI.refresh();
    }

    // Installed streaming apps TMDB knows, one per brand: configured ones first, in config
    // order, so the Home apps lead the Trending row.
    function streamingApps() {
        var seen = {};
        return Apps.curated(state.apps, { apps: cfg.apps || [] }).concat(Apps.allSorted(state.apps, false))
            .filter(function (item) {
                var key = item.brand && item.brand.key;
                if (!key || seen[key] || !Tmdb.supports(key)) return false;
                seen[key] = true;
                return true;
            });
    }

    function streamingApp(key) {
        return streamingApps().find(function (a) { return a.brand.key === key; }) || null;
    }

    // "Netflix", as the app calls itself on this TV.
    function serviceName(key) {
        var app = key && streamingApp(key);
        return app ? app.label : '';
    }

    // The line under a poster: "Netflix · ★ 7,6", or "New episode · Max" in the New row.
    function titleSub(title, fresh) {
        var service = serviceName((title.services || [])[0]);
        if (fresh && title.episode) return [I18n.t('newEpisode'), service].filter(Boolean).join('  ·  ');
        return [service, voteText(title)].filter(Boolean).join('  ·  ');
    }

    // A no-op inside six hours; see js/tmdb.js.
    function refreshTrending() {
        Tmdb.refresh(streamingApps().map(function (a) { return a.brand.key; }));
    }

    function renderTitleRow(key, tile) {
        var row = $(key + '-row');
        $(key + '-title').textContent = I18n.t(key);
        row.innerHTML = '';
        UI.resetScroll(row);
        if (rowOn(key)) {
            Tmdb.list(key).forEach(function (title, i) { row.appendChild(tile(title, i)); });
        }
        $(key + '-section').classList.toggle('hidden', !row.children.length);
    }

    function renderTitleRows() {
        renderTitleRow('trending', function (t) { return posterTile(t, titleSub(t)); });
        renderTitleRow('top', function (t, i) { return rankedTile(t, i + 1, titleSub(t)); });
        renderTitleRow('fresh', function (t) { return posterTile(t, titleSub(t, true)); });
    }

    /*
     * Rows below the apps don't all fit under the clock: Home slides up just enough to show the
     * focused row whole, and the clock and weather fade out while it is up.
     */
    var HOME_BOTTOM = 950;   // above the hint bar
    var SHELVES_TOP = 392;   // .shelves in style.css

    function scrollHome(target) {
        var shelf = target && target.closest ? target.closest('.shelf') : null;
        var y = 0;
        if (shelf && shelf.id !== 'apps-section') {
            y = Math.max(0, SHELVES_TOP + shelf.offsetTop + shelf.offsetHeight - HOME_BOTTOM);
        }
        spotlight(target, shelf);
        if (y === state.scrollY) return;
        state.scrollY = y;
        $('home-scroll').style.transform = y ? 'translateY(' + (-y) + 'px)' : '';
        $('home').classList.toggle('scrolled', y > 0);
    }

    /*
     * Spotlight: while a title row has focus, Home turns into that title — its backdrop top right,
     * its name and synopsis where the clock was — and the rows above step out of the way. The
     * text follows focus at once; the picture waits until focus rests, so sweeping along the row
     * does not start a download per poster.
     */
    var SPOT_REST_MS = 280;
    var spotTimer = null;

    function spotlight(target, shelf) {
        var item = target && target._item;
        var on = !!(item && item.kind === 'title');
        $('home').classList.toggle('spotlight', on);
        UI.children(shelf ? shelf.parentNode : $('apps-section').parentNode).forEach(function (s) {
            s.classList.toggle('above', on && s.offsetTop < shelf.offsetTop);
        });
        clearTimeout(spotTimer);
        if (!on) {
            state.spot = null;
            return;
        }
        var t = item.title;
        if (state.spot === t) return;
        state.spot = t;
        $('spot-name').textContent = t.title;
        $('spot-name').classList.toggle('long', t.title.length > 24);
        var meta = $('spot-meta');
        meta.innerHTML = '';
        if (t.vote) meta.appendChild(el('span', 'tt-vote', voteText(t)));
        meta.appendChild(document.createTextNode([t.type === 'movie' ? I18n.t('movie') : I18n.t('series'), t.year,
            serviceName((t.services || [])[0])].filter(Boolean).join('  ·  ')));
        $('spot-overview').textContent = t.overview || '';
        spotTimer = setTimeout(function () { spotBackdrop(t); }, SPOT_REST_MS);
    }

    // Decoded on the hidden layer first, then crossfaded, like the screen saver's photos.
    function spotBackdrop(t) {
        var token = ++state.spotToken;
        var layers = [$('spot-a'), $('spot-b')];
        var src = Tmdb.image(t.backdrop, 'w1280');
        if (!src) {
            layers.forEach(function (l) { l.classList.remove('on'); });
            return;
        }
        var img = new Image();
        img.onload = function () {
            if (token !== state.spotToken) return;
            var back = layers[1 - state.spotFront];
            back.src = src;
            back.classList.add('on');
            layers[state.spotFront].classList.remove('on');
            state.spotFront = 1 - state.spotFront;
        };
        img.src = src;
    }

    // One tile per HDMI port the TV reports as connected, in port order, with its name if it has
    // one. Nothing at all until the TV has answered, and the whole row goes when nothing is plugged in.
    function connectedInputs() {
        return Object.keys(state.hdmi).map(Number).sort(function (a, b) { return a - b; })
            .filter(function (n) { return state.hdmi[n]; })
            .map(function (n) {
                var named = inputs().find(function (i) { return i.hdmi === n; });
                if (named && named.hidden) return null;
                return named ? { input: named, named: true } : { input: { hdmi: n, label: 'HDMI ' + n }, named: false };
            })
            .filter(Boolean);
    }

    function renderInputs() {
        var row2 = $('inputs-row');
        row2.innerHTML = '';
        connectedInputs().forEach(function (c) { row2.appendChild(inputTile(c.input, c.named)); });
        $('inputs-section').classList.toggle('hidden', !row2.children.length || !rowOn('inputs'));
    }

    // Polled while Home is on screen, so plugging in or unplugging shows up without leaving it.
    var INPUT_POLL_MS = 10000;
    var inputTimer = null;

    function refreshInputStatus() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(function () {
            if (!document.hidden && UI.isVisible('home')) refreshInputStatus();
        }, INPUT_POLL_MS);
        Inputs.hdmiStatus().then(function (status) {
            var sig = JSON.stringify(status);
            if (sig === state.hdmiSig) return;
            state.hdmiSig = sig;
            state.hdmi = status;
            renderInputs();
            if (UI.isVisible('home')) UI.refresh();
        }).catch(function (err) {
            log('Input status unavailable: ' + DevLog.errorText(err));
        });
    }

    function renderAll() {
        var grid = $('all-grid');
        grid.innerHTML = '';
        UI.resetScroll(grid);
        var items = Apps.allSorted(state.apps, state.showEverything);
        items.forEach(function (item) { grid.appendChild(appTile(item)); });
        $('all-title').textContent = I18n.t('allApps');
        $('all-count').textContent = I18n.t('appCount', { n: items.length });
    }

    function renderLab() {
        var actions = [
            { label: 'Send installed app list to log', run: labDumpApps },
            { label: 'Read inputs', run: labReadInputs },
            { label: 'Open Samsung TV viewer only', run: function () { runLogged('Open TV viewer', Inputs.openViewer()); } }
        ];
        if (window.Sound) actions = actions.concat(Sound.actions());
        if (window.Weather) actions = actions.concat(Weather.actions());
        if (window.RenderProbe) actions = actions.concat(RenderProbe.actions());
        if (window.PlatformProbe) actions = actions.concat(PlatformProbe.actions());
        inputs().forEach(function (input) {
            var item = { kind: 'input', hdmi: input.hdmi, label: input.label };
            var name = input.label + ' (HDMI ' + input.hdmi + ')';
            actions.push({ label: name + ': switch + viewer', run: function () { openInput(item, 'switch+viewer'); } });
            actions.push({ label: name + ': switch only', run: function () { openInput(item, 'switch'); } });
            actions.push({ label: name + ': inside launcher', run: function () { openInput(item, 'inapp'); } });
        });
        var list = $('lab-list');
        list.innerHTML = '';
        actions.forEach(function (a) {
            var li = el('li', '', a.label);
            li._item = { kind: 'lab', run: a.run };
            list.appendChild(li);
        });
        DevLog.onLine(function () {
            $('lab-log').textContent = DevLog.lines().slice(-26).join('\n');
        });
    }

    // ---------- Actions

    function runLogged(what, promise) {
        log(what + '…');
        return promise.then(function (v) {
            log(what + ': ok');
            return v;
        }, function (err) {
            log(what + ': FAILED ' + DevLog.errorText(err));
            throw err;
        });
    }

    // ---------- Open and return animations

    /*
     * Opening an app: the focused tile grows to fill the screen in the app's colours and its mark
     * settles in the middle, then the app is launched underneath. Coming back, the same panel
     * shrinks into the tile it came from.
     *
     * Only transform and opacity move, each on its own layer, so the compositor runs the whole
     * thing without repainting. The panel is drawn larger than the screen with wide rounded corners:
     * shrunk to tile size the corners match the tile's, and at full size they are off-screen.
     */
    var FX_W = 2200;
    var FX_H = 1240;
    var FX_MS = 320;

    function stageRect(node) {
        var stage = $('stage').getBoundingClientRect();
        var k = stage.width / 1920;
        var r = node.getBoundingClientRect();
        return { x: (r.left - stage.left) / k, y: (r.top - stage.top) / k, w: r.width / k, h: r.height / k };
    }

    function tileTransform(r) {
        return 'translate(' + r.x + 'px,' + r.y + 'px) scale(' + (r.w / FX_W) + ',' + (r.h / FX_H) + ')';
    }

    var FULL = 'translate(' + (1920 - FX_W) / 2 + 'px,' + (1080 - FX_H) / 2 + 'px) scale(1,1)';

    function launchFx(item, tile) {
        var r = stageRect(tile);
        var fx = el('div', 'launch');
        var panel = el('div', 'launch-panel');
        panel.style.background = tile.style.background || getComputedStyle(tile).backgroundColor;
        panel.style.transform = tileTransform(r);
        var face = el('div', 'launch-face');
        face.appendChild(tileFace(item));
        fx.appendChild(panel);
        fx.appendChild(face);
        $('stage').appendChild(fx);
        // Two frames: the start position has to be on screen before the transition is set.
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                fx.classList.add('open');
                panel.style.transform = FULL;
            });
        });
        state.launch = { fx: fx, panel: panel, from: r, started: Date.now() };
    }

    function closeFx(delay) {
        var l = state.launch;
        if (!l) return;
        state.launch = null;
        setTimeout(function () {
            l.fx.classList.remove('open');
            l.fx.classList.add('closing');
            l.panel.style.transform = tileTransform(l.from);
            setTimeout(function () { l.fx.parentNode && l.fx.parentNode.removeChild(l.fx); }, FX_MS + 60);
        }, delay || 0);
    }

    // Home's content rises into place: on start-up, and when coming back without a launch to undo.
    function enterFx() {
        var home = $('home');
        home.classList.remove('entering');
        void home.offsetWidth;
        home.classList.add('entering');
        clearTimeout(enterFx.timer);
        enterFx.timer = setTimeout(function () { home.classList.remove('entering'); }, 700);
    }

    // `from`: what the opening panel grows out of; the focused app tile when not given.
    // `start`: how to launch it, when that is more than opening the app (a trailer).
    function launchApp(item, from, start) {
        if (state.launch && Date.now() - state.launch.started < 1000) return;
        var tile = from || document.querySelector('.view:not(.hidden) .app.focused .tile');
        if (tile) launchFx(item, tile);
        // Launched once the panel covers the screen, so the switch happens behind it.
        setTimeout(function () {
            runLogged('Launch ' + item.id, start ? start() : Apps.launch(item.id)).then(function () {
                // Still visible a few seconds on: the app never took over (or this is the preview).
                setTimeout(function () { if (!document.hidden) closeFx(); }, 3500);
            }, function (err) {
                closeFx();
                UI.toast('Could not open ' + item.label + ': ' + DevLog.errorText(err));
            });
        }, tile ? FX_MS - 60 : 0);
    }

    function youTube() {
        return Apps.curated(state.apps, { apps: cfg.apps || [] }).concat(Apps.allSorted(state.apps, false))
            .find(function (a) { return a.brand && a.brand.key === 'youtube'; }) || null;
    }

    function playTrailer(videoId, from) {
        var app = youTube();
        if (!app) {
            UI.toast(I18n.t('noYoutube'));
            return;
        }
        launchApp(app, from, function () { return Apps.launchVideo(app.id, videoId); });
    }

    function openInput(item, method) {
        method = method || item.method || cfg.inputMethod;
        UI.toast('Switching to ' + item.label + '…');
        runLogged('Input HDMI ' + item.hdmi + ' via ' + method, Inputs.open(item.hdmi, method)).then(function (result) {
            log('Current source now: ' + Inputs.describeSource(Inputs.current()));
            if (result === 'inapp') enterTvMode();
        }).catch(function (err) {
            UI.toast('Could not switch to ' + item.label + ': ' + DevLog.errorText(err));
        });
    }

    function enterTvMode() {
        state.tvMode = true;
        document.documentElement.classList.add('tv-mode');
    }

    function exitTvMode() {
        state.tvMode = false;
        document.documentElement.classList.remove('tv-mode');
        Inputs.hide().catch(function (err) { log('Hide input failed: ' + DevLog.errorText(err)); });
    }

    function labDumpApps() {
        runLogged('App list', Apps.getInstalledApps()).then(function (apps) {
            log('apps: ' + apps.length + ' total, ' + apps.filter(function (a) { return a.show; }).length + ' with show=true',
                apps.map(Apps.describe));
            UI.toast('Sent ' + apps.length + ' apps to the log');
        }).catch(function () {});
    }

    function labReadInputs() {
        runLogged('Inputs', Inputs.sources()).then(function (info) {
            var fmt = function (list) { return (list || []).map(Inputs.describeSource).join(', ') || 'none'; };
            log('connected: ' + fmt(info.connected));
            log('disconnected: ' + fmt(info.disconnected));
            log('current: ' + Inputs.describeSource(Inputs.current()));
        }).catch(function () {});
    }

    function nextWallpaper() {
        var w = Wallpaper.next();
        if (w) UI.toast(w.title + (w.credit ? ' · ' + w.credit : ''));
    }

    // Colour keys are hidden shortcuts; everything is also reachable from Settings.
    function colourKey(k, view) {
        if (k === KEY.RED || k === KEY.R) {
            UI.show(view === 'all' ? 'home' : 'all');
        } else if (k === KEY.GREEN || k === KEY.G) {
            if (view === 'home') nextWallpaper();
        } else if (k === KEY.BLUE || k === KEY.B) {
            UI.show(view === 'lab' ? 'home' : 'lab');
        } else if (k === KEY.YELLOW || k === KEY.Y) {
            if (view === 'all') {
                state.showEverything = !state.showEverything;
                UI.show('all', { back: true });
            } else if (view === 'home' && window.RunnerGame) {
                RunnerGame.open();
            } else return false;
        } else {
            return false;
        }
        return true;
    }

    // ---------- Weather card

    function wxSetup(title, sub, iconHtml) {
        var card = $('wx-card');
        card.className = 'wx-card wx-empty' + (card.classList.contains('focused') ? ' focused' : '');
        card.innerHTML = '';
        var icon = el('div', 'wx-icon');
        icon.innerHTML = iconHtml;
        card.appendChild(icon);
        var text = el('div', 'wx-main');
        text.appendChild(el('div', 'wx-setup-title', title));
        if (sub) text.appendChild(el('div', 'wx-setup-sub', sub));
        card.appendChild(text);
    }

    // The status bar's corner: temperature and sky, and a mark when the TV is offline.
    function renderStatus() {
        var w = Weather.current();
        var wx = $('sb-wx');
        wx.innerHTML = w ? w.icon : '';
        if (w) wx.appendChild(el('span', '', w.temp));
        $('sb-net').classList.toggle('hidden', navigator.onLine !== false);
    }

    // Redrawn on a new reading and on the clock tick, since the hour columns move with time.
    function renderWeatherCard() {
        renderStatus();
        var card = $('wx-card');
        var status = Weather.status();
        var f = Weather.forecast();
        if (!f) {
            if (status === 'off') wxSetup(I18n.t('setUpWeather'), I18n.t('chooseCity'), Weather.icon('pin'));
            else if (status === 'offline') wxSetup(I18n.t('weatherOffline'), Weather.place().name || '', Weather.icon('cloudy'));
            else wxSetup(I18n.t('weatherLoading'), Weather.place().name || '', Weather.icon('partly'));
            return;
        }
        card.className = 'wx-card' + (card.classList.contains('focused') ? ' focused' : '');
        card.innerHTML = '';

        var now = el('div', 'wx-now');
        var icon = el('div', 'wx-icon');
        icon.innerHTML = f.icon;
        now.appendChild(icon);
        var main = el('div', 'wx-main');
        main.appendChild(el('div', 'wx-temp', f.temp));
        main.appendChild(el('div', 'wx-label', f.label));
        main.appendChild(el('div', 'wx-range', '↑ ' + f.max + '   ↓ ' + f.min));
        now.appendChild(main);
        card.appendChild(now);

        var hours = el('div', 'wx-hours');
        f.hours(5).forEach(function (h) {
            var col = el('div', 'wx-hour');
            col.appendChild(el('div', 'wx-h-label', h.label));
            var hi = el('div', 'wx-h-icon');
            hi.innerHTML = h.icon;
            col.appendChild(hi);
            col.appendChild(el('div', 'wx-h-temp', h.temp));
            col.appendChild(el('div', 'wx-h-pop' + (h.pop >= 30 ? ' wet' : ''), h.pop + '%'));
            hours.appendChild(col);
        });
        card.appendChild(hours);
    }

    // ---------- Clock, data, lifecycle

    var lastHour = -1;

    function updateClock() {
        var d = new Date();
        var t = Appearance.time(d);
        $('time-main').textContent = t.time;
        $('time-suffix').textContent = t.suffix;
        $('date').textContent = Appearance.date(d);
        var name = greetingName();
        $('greeting').textContent = I18n.greeting(d) + (name ? ', ' + name : '');
        $('sb-time').textContent = t.time + (t.suffix ? ' ' + t.suffix : '');
        if (d.getHours() !== lastHour) {
            lastHour = d.getHours();
            renderWeatherCard();
        }
    }

    // ---------- Name in the greeting

    // The name typed in Settings wins; otherwise the TV account's, when the platform shares it.
    function greetingName() {
        var own = (Prefs.get().appearance.name || '').trim();
        return firstName(own) || state.accountName;
    }

    function firstName(text) {
        var word = (text || '').trim().split(/\s+/)[0] || '';
        return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
    }

    /*
     * Best effort only. tizen.account needs the account.read privilege, which config.xml does not
     * declare: an unrecognised privilege can fail the install, so it waits until the Lab probe shows
     * the API exists on the TV (see platform-probe.js). Until then this is refused and Home falls
     * back to the name in Settings. Samsung's own webapis.sso only gives partner apps a user ID.
     *
     * An email address is not a name, so an account whose user name is one is ignored.
     */
    function loadAccountName() {
        try {
            if (!window.tizen || !tizen.account || !tizen.account.getAccounts) return;
            tizen.account.getAccounts(function (accounts) {
                for (var i = 0; i < accounts.length; i++) {
                    var user = accounts[i].userName || '';
                    if (user && user.indexOf('@') < 0) {
                        state.accountName = firstName(user);
                        updateClock();
                        return;
                    }
                }
            }, function (err) {
                log('Account name unavailable: ' + DevLog.errorText(err));
            });
        } catch (e) {
            log('Account name unavailable: ' + DevLog.errorText(e));
        }
    }

    // Ticks on the minute rather than every 10 s, so the clock turns over when the minute does.
    var clockTimer = null;

    function scheduleClock() {
        clearTimeout(clockTimer);
        var d = new Date();
        clockTimer = setTimeout(function () {
            updateClock();
            scheduleClock();
        }, 60000 - d.getSeconds() * 1000 - d.getMilliseconds() + 50);
    }

    // The TV takes ~4 s to list its ~450 apps, so Home is drawn from the last list we saw
    // and only redrawn if a fresh list differs.
    function readCache() {
        try {
            return JSON.parse(localStorage.getItem(CACHE_KEY));
        } catch (e) {
            return null;
        }
    }

    function writeCache(apps) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(apps));
        } catch (e) {
            // Without the cache we only lose the fast start.
        }
    }

    var listeners = [];
    /*
     * Hidden game code: Left and Right alternating three times.
     *
     * Two properties matter on a remote. It is matched against the tail of the last few keys,
     * not with a position counter, because a held key repeats and one extra press would
     * otherwise reset progress so the code could never complete. And it alternates rather than
     * repeating a key, because both auto-repeat and sweeping along a row produce runs of the
     * same key — a code made of runs fires by accident during ordinary browsing.
     */
    var gameCode = [KEY.LEFT, KEY.RIGHT, KEY.LEFT, KEY.RIGHT, KEY.LEFT, KEY.RIGHT];
    var recentKeys = [];

    function gameCodeEntered(k) {
        recentKeys.push(k);
        if (recentKeys.length > gameCode.length) recentKeys.shift();
        if (recentKeys.length < gameCode.length) return false;
        for (var i = 0; i < gameCode.length; i++) {
            if (recentKeys[i] !== gameCode[i]) return false;
        }
        recentKeys.length = 0;
        return true;
    }

    function setApps(apps) {
        var sig = apps.map(function (a) { return a.id + '|' + a.name + '|' + a.show; }).join(',');
        if (sig === state.appsSig) return;
        state.appsSig = sig;
        state.apps = apps;
        renderHome();
        if (UI.isVisible('all')) UI.show('all', { back: true });
        listeners.forEach(function (fn) { fn(); });
    }

    function loadApps() {
        state.lastFetch = Date.now();
        return Apps.getInstalledApps().then(function (apps) {
            var list = Apps.launchable(apps).map(function (a) {
                return { id: a.id, name: a.name, show: a.show, iconPath: a.iconPath || '' };
            });
            writeCache(list);
            setApps(list);
        }).catch(function (err) {
            UI.toast('Could not list apps: ' + DevLog.errorText(err));
            log('App list failed: ' + DevLog.errorText(err));
        });
    }

    function registerKeys() {
        try {
            tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']);
        } catch (e) {
            log('Colour keys unavailable: ' + DevLog.errorText(e));
        }
    }

    function registerViews() {
        UI.register('home', {
            el: $('home'),
            startRow: 1,
            restoreRows: true,
            // Also restarts the HDMI poll, which pauses while another screen is up.
            onShow: refreshInputStatus,
            hints: function () {
                var top = [I18n.t('weather')];
                if (Tmdb.configured()) top.push(I18n.t('search'));
                top.push(I18n.t('hintSettings'));
                return [['OK', I18n.t('hintOpen')], ['▲', top.join(' · ')]];
            },
            // Top bar, then every shelf in the order it is on screen.
            rows: function () {
                var top = [$('wx-card'), $('search-btn'), $('gear')].filter(function (e) {
                    return !e.classList.contains('hidden');
                });
                return [top].concat(UI.children($('apps-section').parentNode).map(function (shelf) {
                    return shelf.classList.contains('hidden') ? [] : UI.children(shelf.querySelector('.row-track'));
                }));
            },
            onFocus: scrollHome,
            activate: function (item) {
                if (item.kind === 'app') launchApp(item);
                else if (item.kind === 'all') UI.show('all');
                else if (item.kind === 'input') openInput(item);
                else if (item.kind === 'title') Titles.open(item.title);
                else if (item.kind === 'settings') UI.show('settings');
                else if (item.kind === 'search') Search.ask();
                else if (item.kind === 'weather') {
                    if (Weather.configured()) UI.show('weather');
                    else Forecast.changeCity();
                }
            },
            // Home is the root: Back does nothing.
            onBack: function () { return true; }
        });
        $('gear')._item = { kind: 'settings' };
        $('search-btn')._item = { kind: 'search' };
        $('wx-card')._item = { kind: 'weather' };

        UI.register('all', {
            el: $('all'),
            rows: function () { return UI.chunk(UI.children($('all-grid')), GRID_COLS); },
            onShow: renderAll,
            activate: function (item) { launchApp(item); },
            hints: function () { return [['OK', I18n.t('hintOpen')], ['Back', I18n.t('hintHome')]]; }
        });

        UI.register('lab', {
            el: $('lab'),
            rows: function () { return UI.children($('lab-list')).map(function (li) { return [li]; }); },
            activate: function (item) { item.run(); },
            hints: [['OK', 'Run'], ['Back', 'Home']]
        });
    }

    function init() {
        registerKeys();
        registerViews();
        UI.setColourKey(colourKey);
        UI.setKeyHook(function (k) {
            if (state.tvMode) {
                if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) exitTvMode();
                return true;
            }
            if (!UI.isVisible('home')) { recentKeys.length = 0; return false; }
            if (gameCodeEntered(k)) {
                if (window.RunnerGame) RunnerGame.open(true);
                return true;
            }
            return false;
        });
        Appearance.apply();
        updateClock();
        scheduleClock();
        Weather.onUpdate(renderWeatherCard);
        Tmdb.onUpdate(function () {
            renderTitleRows();
            if (UI.isVisible('home')) UI.refresh();
        });
        $('spot-shade').src = Ambient.shade();
        window.addEventListener('online', renderStatus);
        window.addEventListener('offline', renderStatus);
        renderLab();
        var cached = readCache();
        if (cached && cached.length) setApps(cached);
        else renderHome();
        UI.show('home');
        enterFx();
        loadAccountName();
        Wallpaper.start();

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (state.tvMode) exitTvMode();
                return;
            }
            updateClock();
            scheduleClock();
            renderWeatherCard();
            // Back from an app: undo the opening animation, or let Home rise in if there is none.
            if (state.launch) closeFx(80);
            else if (UI.isVisible('home')) enterFx();
            refreshInputStatus();
            refreshTrending();
            if (UI.isVisible('home')) Wallpaper.homeShown();
            if (Date.now() - state.lastFetch > REFRESH_AFTER_MS) setTimeout(loadApps, 1500);
        });
        // With a cache, let the first frames and key presses through before the slow app list.
        setTimeout(loadApps, cached ? 2000 : 0);
        log('Launcher started');
    }

    window.Home = {
        init: init,
        apps: function () { return state.apps; },
        homeItems: homeItems,
        setHomeItems: setHomeItems,
        inputs: inputs,
        setInputs: setInputs,
        hdmiStatus: function () { return state.hdmi; },
        // An HDMI input shown inside the launcher: no screen saver over it.
        tvMode: function () { return state.tvMode; },
        refreshInputStatus: refreshInputStatus,
        renderLab: renderLab,
        updateClock: updateClock,
        greetingName: greetingName,
        // After a language or clock change: every string Home draws itself.
        relabel: function () {
            updateClock();
            renderWeatherCard();
            renderHome();
        },
        reloadApps: loadApps,
        miniTile: miniTile,
        miniInputTile: miniInputTile,
        launchApp: launchApp,
        posterTile: posterTile,
        playTrailer: playTrailer,
        streamingApp: streamingApp,
        serviceName: serviceName,
        titleSub: titleSub,
        ROWS: ROWS,
        rowLabel: function (key) {
            var row = ROWS.find(function (r) { return r.key === key; });
            return row ? I18n.t(row.title) : key;
        },
        onAppsChanged: function (fn) { listeners.push(fn); }
    };
})();
