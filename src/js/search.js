/*
 * Where to watch (Home ▸ the magnifier): a film or series typed on Samsung's keyboard, searched on
 * TMDB, and under each poster the app on this TV that streams it — or that none does. OK opens the
 * title screen. Data from js/tmdb.js.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;
    var t = I18n.t;

    var COLS = 8;   // .poster-grid in style.css
    var LOOKUPS_AT_ONCE = 4;   // the providers of each result are one request apiece

    var state = {
        query: '',
        results: [],
        token: 0
    };

    function ask() {
        Settings.prompt(t('searchPrompt'), state.query, run);
    }

    function head(text, sub) {
        $('search-title').textContent = text;
        $('search-sub').textContent = sub || '';
    }

    function run(query) {
        var token = ++state.token;
        state.query = query;
        state.results = [];
        UI.show('search');
        head(t('searchFor', { q: query }), t('checking'));
        renderGrid();
        Tmdb.search(query).then(function (results) {
            if (token !== state.token) return;
            state.results = results;
            head(t(results.length ? 'searchFor' : 'noResults', { q: query }), '');
            renderGrid();
            if (UI.isVisible('search')) UI.focusOn($('search-grid').firstChild || $('search-actions').firstChild);
            lookUp(results, token);
        }, function (err) {
            if (token !== state.token) return;
            DevLog.log('TMDB search failed: ' + DevLog.errorText(err));
            head(t('searchFor', { q: query }), t('searchFailed'));
        });
    }

    function sub(title) {
        return [title.type === 'movie' ? t('movie') : t('series'), title.year].filter(Boolean).join('  ·  ');
    }

    function renderGrid() {
        var grid = $('search-grid');
        grid.innerHTML = '';
        UI.resetScroll(grid);
        state.results.forEach(function (title) {
            var tile = Home.posterTile(title, sub(title));
            title._tile = tile;
            grid.appendChild(tile);
        });
        var actions = $('search-actions');
        actions.innerHTML = '';
        var again = el('div', 'chip', t('newSearch'));
        again._item = { kind: 'again' };
        actions.appendChild(again);
    }

    // A few at a time, in the order they show; each answer lands under its poster.
    function lookUp(results, token) {
        var queue = results.slice();
        function next() {
            var title = queue.shift();
            if (!title || token !== state.token) return null;
            return Tmdb.providers(title.type, title.id).then(function (where) {
                if (token !== state.token) return;
                title.services = where.services;
                var line = title._tile.querySelector('.poster-sub');
                var app = Home.serviceName(where.services[0]);
                line.textContent = app || t('notOnYourApps');
                title._tile.classList.toggle('elsewhere', !app);
            }, function () {}).then(next);
        }
        for (var i = 0; i < LOOKUPS_AT_ONCE; i++) next();
    }

    function init() {
        UI.register('search', {
            el: $('search'),
            rows: function () {
                return [UI.children($('search-actions'))].concat(UI.chunk(UI.children($('search-grid')), COLS));
            },
            startRow: 1,
            restoreRows: true,
            activate: function (item) {
                if (item.kind === 'again') ask();
                else if (item.kind === 'title') Titles.open(item.title);
            },
            hints: function () {
                return [['OK', t('hintDetails')], ['Back', t('hintHome')]];
            }
        });
    }

    window.Search = {
        init: init,
        ask: ask
    };
})();
