/*
 * Title screen (Home ▸ Trending ▸ a poster): backdrop, synopsis, cast and a button per installed
 * app the title streams on. Samsung's apps take no deep link from a third-party launcher, so a
 * button opens the app itself, not the title. Data from js/tmdb.js.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;
    var t = I18n.t;

    var shown = null;   // the summary from the row; the details replace it when they arrive

    function number(v) {
        return v.toLocaleString(I18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    function length(d) {
        if (d.runtime) {
            var h = Math.floor(d.runtime / 60);
            var m = d.runtime % 60;
            return (h ? h + 'h ' : '') + (m ? m + 'min' : '');
        }
        if (d.seasons) return t(d.seasons === 1 ? 'oneSeason' : 'seasons', { n: d.seasons });
        return '';
    }

    function meta(d) {
        var parts = [d.type === 'movie' ? t('movie') : t('series')];
        if (d.year) parts.push(d.year);
        if (length(d)) parts.push(length(d));
        if (d.genres && d.genres.length) parts.push(d.genres.join(', '));
        var line = $('tt-meta');
        line.innerHTML = '';
        if (d.vote) line.appendChild(el('span', 'tt-vote', '★ ' + number(d.vote)));
        line.appendChild(document.createTextNode(parts.join('  ·  ')));
    }

    function watchButton(app) {
        var b = app.brand;
        var btn = el('div', 'tt-watch');
        btn.style.background = b.bg;
        btn.style.color = b.fg;
        btn.appendChild(el('span', 'tt-play', '▶'));
        if (b.mark) {
            var logo = new Image();
            logo.className = 'tt-logo';
            logo.src = 'img/tiles/' + b.key + '.svg';
            btn.appendChild(logo);
        } else {
            btn.appendChild(el('span', 'tt-word', b.text || app.label));
        }
        btn._item = { kind: 'watch', app: app };
        return btn;
    }

    // On YouTube, after the apps: watching is what this screen is for.
    function trailerButton(key) {
        var btn = el('div', 'tt-watch tt-trailer');
        btn.appendChild(el('span', 'tt-play', '▶'));
        btn.appendChild(el('span', 'tt-word', t('trailer')));
        btn._item = { kind: 'trailer', key: key };
        return btn;
    }

    function renderActions(d) {
        var bar = $('tt-actions');
        bar.innerHTML = '';
        var apps = (d.services || []).map(Home.streamingApp).filter(Boolean);
        apps.forEach(function (app) { bar.appendChild(watchButton(app)); });
        if (d.trailer) bar.appendChild(trailerButton(d.trailer));
        var note = $('tt-note');
        if (apps.length) note.textContent = '';
        else if (d.providers && d.providers.length) note.textContent = t('streamsOn', { list: d.providers.slice(0, 4).join(', ') });
        else note.textContent = d.providers ? t('notStreaming') : '';
    }

    function render(d) {
        var img = $('tt-backdrop');
        var src = Tmdb.image(d.backdrop, 'w1280');
        if (img._src !== src) {
            img._src = src;
            img.classList.remove('loaded');
            img.onload = function () { img.classList.add('loaded'); };
            if (src) img.src = src;
            else img.removeAttribute('src');
        }
        $('tt-name').textContent = d.title;
        $('tt-name').classList.toggle('long', d.title.length > 28);
        meta(d);
        $('tt-tagline').textContent = d.tagline || '';
        // A row's summary has no cast: until the details arrive, an empty synopsis may yet come.
        $('tt-overview').textContent = d.overview || (d.cast ? t('noOverview') : '');
        $('tt-cast').textContent = d.cast && d.cast.length ? t('starring') + ' ' + d.cast.join(', ') : '';
        renderActions(d);
    }

    // Opens straight away with what the row already knows; the rest fills in.
    function open(summary) {
        shown = summary;
        UI.show('title');
        Tmdb.detail(summary.type, summary.id).then(function (d) {
            if (shown !== summary || !UI.isVisible('title')) return;
            render(d);
            UI.refresh();
        }, function (err) {
            DevLog.log('TMDB details failed: ' + DevLog.errorText(err));
            if (shown === summary) $('tt-note').textContent = t('titleOffline');
        });
    }

    function init() {
        $('tt-shade').src = Ambient.shade();
        UI.register('title', {
            el: $('title'),
            rows: function () { return [UI.children($('tt-actions'))]; },
            onShow: function (opts) {
                if (opts.back || !shown) return;
                $('tt-note').textContent = '';
                render(shown);
            },
            activate: function (item, node) {
                if (item.kind === 'watch') Home.launchApp(item.app, node);
                else if (item.kind === 'trailer') Home.playTrailer(item.key, node);
            },
            hints: function () { return [['OK', t('hintWatch')], ['Back', t('hintHome')]]; }
        });
    }

    window.Titles = {
        init: init,
        open: open
    };
})();
