/*
 * Films and series for Home's title rows, the title screen and search, from TMDB
 * (themoviedb.org). Needs a key in js/config.local.js — tmdb: { key: '…' } — either the v3 API
 * key or the v4 read access token; without one, nothing here makes a request and the rows stay
 * hidden.
 *
 * Every row is limited to titles that stream (flatrate, not rent or buy) in the TV's region on a
 * service whose app is installed, with four discover requests per service:
 *   trending  TMDB's popularity, mixed so no single service fills the row
 *   top       the ten most popular across those services. TMDB's popularity is worldwide, so
 *             this is "the most popular of what you can watch here", not a national chart
 *   fresh     films released in the last few months and series with an episode out this week
 * Where-to-watch data is JustWatch's, through TMDB. The rows are cached in localStorage and
 * refreshed every six hours.
 */
(function () {
    'use strict';

    var API = 'https://api.themoviedb.org/3';
    var IMAGES = 'https://image.tmdb.org/t/p/';
    var STORE_KEY = 'arn0.tmdb.v2';
    var FRESH_MS = 6 * 60 * 60 * 1000;
    var RETRY_MS = 15 * 60 * 1000;
    var TIMEOUT_MS = 8000;
    var ROW_SIZE = 24;
    var TOP_SIZE = 10;
    var FRESH_FILM_DAYS = 90;   // a film this recent on a flat-rate service has only just arrived
    var FRESH_EPISODE_DAYS = 7;
    var DAY_MS = 24 * 60 * 60 * 1000;

    /*
     * TMDB provider names per brand in js/brands.js. Matched by name because provider ids differ
     * between regions and services get renamed; "… Amazon Channel" resellers are left out.
     */
    var PROVIDERS = {
        netflix: /^netflix/i,
        primevideo: /^amazon prime video/i,
        disneyplus: /^disney ?(\+|plus)/i,
        max: /^(hbo )?max(\s|$)/i,
        globoplay: /^globoplay/i,
        appletv: /^apple tv/i,
        paramountplus: /^paramount ?(\+|plus)/i,
        crunchyroll: /^crunchyroll/i
    };

    // News and talk shows top TMDB's TV popularity every day; nobody browses for them.
    var TV_SKIP_GENRES = '10763|10767';

    var cache = null;      // { at, sig, trending, top, fresh }
    var fetching = false;
    var lastFailure = 0;
    var listeners = [];
    var details = {};      // 'movie/123' → promise of the title screen's data
    var where = {};        // 'movie/123' → promise of { names, services } for search results

    function cfg() {
        return window.LAUNCHER_CONFIG.tmdb || {};
    }

    function configured() {
        return !!cfg().key;
    }

    function supports(brandKey) {
        return !!PROVIDERS[brandKey];
    }

    function brandOf(providerName) {
        if (/channel/i.test(providerName)) return null;
        return Object.keys(PROVIDERS).find(function (k) { return PROVIDERS[k].test(providerName); }) || null;
    }

    function language() {
        return I18n.locale();
    }

    // "pt-BR" → BR. tmdb.region in the config wins, for a locale without a country.
    function region() {
        return (cfg().region || I18n.locale().split('-')[1] || 'US').toUpperCase();
    }

    // Absolute URLs pass through, so a proxy or a preview fixture can stand in for TMDB's CDN.
    function image(path, size) {
        if (!path) return '';
        return /^(https?|data):/.test(path) ? path : IMAGES + size + path;
    }

    // ---------- Requests

    function request(path, params) {
        var key = cfg().key;
        // v4 read access tokens are JWTs; v3 keys are 32 hex characters and go in the query.
        var bearer = /^eyJ/.test(key);
        var query = Object.keys(params || {}).map(function (k) {
            return k + '=' + encodeURIComponent(params[k]);
        });
        if (!bearer) query.push('api_key=' + encodeURIComponent(key));
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', API + path + '?' + query.join('&'), true);
            xhr.timeout = TIMEOUT_MS;
            if (bearer) xhr.setRequestHeader('Authorization', 'Bearer ' + key);
            xhr.onload = function () {
                if (xhr.status === 401) {
                    reject(new Error('TMDB refused the key (HTTP 401)'));
                    return;
                }
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error('TMDB HTTP ' + xhr.status));
                    return;
                }
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    reject(new Error('unreadable TMDB response'));
                }
            };
            xhr.onerror = function () { reject(new Error('TMDB request failed')); };
            xhr.ontimeout = function () { reject(new Error('TMDB request timed out')); };
            xhr.send();
        });
    }

    // { netflix: '8|1796', … } for the region: every provider id whose name matches a brand.
    function providerIds() {
        var params = { watch_region: region(), language: language() };
        return Promise.all([
            request('/watch/providers/movie', params),
            request('/watch/providers/tv', params)
        ]).then(function (lists) {
            var ids = {};
            lists.forEach(function (list) {
                (list.results || []).forEach(function (p) {
                    var key = brandOf(p.provider_name);
                    if (!key) return;
                    ids[key] = ids[key] || [];
                    if (ids[key].indexOf(p.provider_id) < 0) ids[key].push(p.provider_id);
                });
            });
            Object.keys(ids).forEach(function (k) { ids[k] = ids[k].join('|'); });
            return ids;
        });
    }

    function year(date) {
        return date ? date.slice(0, 4) : '';
    }

    function summary(r, type) {
        return {
            type: type,
            id: r.id,
            title: type === 'movie' ? r.title : r.name,
            year: year(type === 'movie' ? r.release_date : r.first_air_date),
            poster: r.poster_path || '',
            backdrop: r.backdrop_path || '',
            vote: r.vote_count >= 20 ? r.vote_average : 0,
            popularity: r.popularity || 0,
            // Two lines under the title on Home's spotlight; the title screen has the full text.
            overview: (r.overview || '').slice(0, 320),
            services: []
        };
    }

    function isoDay(ms) {
        return new Date(ms).toISOString().slice(0, 10);
    }

    // `fresh`: only what came out lately — films from the last few months, series with an
    // episode this week — instead of everything that is popular.
    function discover(type, providers, fresh) {
        var params = {
            watch_region: region(),
            with_watch_providers: providers,
            with_watch_monetization_types: 'flatrate',
            sort_by: 'popularity.desc',
            'vote_count.gte': fresh ? 0 : 10,
            include_adult: 'false',
            language: language(),
            page: 1
        };
        if (type === 'tv') params.without_genres = TV_SKIP_GENRES;
        if (fresh && type === 'movie') {
            params['primary_release_date.gte'] = isoDay(Date.now() - FRESH_FILM_DAYS * DAY_MS);
            params['primary_release_date.lte'] = isoDay(Date.now());
        } else if (fresh) {
            params['air_date.gte'] = isoDay(Date.now() - FRESH_EPISODE_DAYS * DAY_MS);
            params['air_date.lte'] = isoDay(Date.now());
        }
        return request('/discover/' + type, params).then(function (data) {
            return (data.results || []).filter(function (r) { return r.poster_path; })
                .map(function (r) { return summary(r, type); });
        });
    }

    // Per service, films and series by popularity; then one from each service in turn.
    // Takes over the summaries it is given (their `services` is set here).
    function mix(perService, size) {
        var byId = {};
        var out = [];
        var lists = perService.map(function (s) {
            return s.items.sort(function (a, b) { return b.popularity - a.popularity; });
        });
        for (var round = 0; out.length < size && lists.some(function (l) { return round < l.length; }); round++) {
            perService.forEach(function (s, i) {
                var t = lists[i][round];
                if (!t || out.length >= size) return;
                var id = t.type + '/' + t.id;
                if (byId[id]) {
                    if (byId[id].services.indexOf(s.key) < 0) byId[id].services.push(s.key);
                    return;
                }
                t.services = [s.key];
                byId[id] = t;
                out.push(t);
            });
        }
        return out;
    }

    // The most popular across every service, each title once with all the services it is on.
    // Copies, so it can run on the same lists as mix().
    function top(perService) {
        var byId = {};
        perService.forEach(function (s) {
            s.items.forEach(function (t) {
                var id = t.type + '/' + t.id;
                if (!byId[id]) byId[id] = Object.assign({}, t, { services: [] });
                if (byId[id].services.indexOf(s.key) < 0) byId[id].services.push(s.key);
            });
        });
        return Object.keys(byId).map(function (id) { return byId[id]; })
            .sort(function (a, b) { return b.popularity - a.popularity; })
            .slice(0, TOP_SIZE);
    }

    // ---------- Home rows

    function load() {
        if (cache) return;
        try {
            cache = JSON.parse(localStorage.getItem(STORE_KEY));
        } catch (e) {
            cache = null;
        }
    }

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(cache));
        } catch (e) {
            // Storage full or blocked: the row just reloads next time.
        }
    }

    function signature(services) {
        return [region(), language()].concat(services).join(',');
    }

    // 'trending' | 'top' | 'fresh'
    function list(name) {
        load();
        return configured() && cache && cache[name] || [];
    }

    // `services`: installed brand keys, in the order the row should favour them.
    function refresh(services) {
        services = (services || []).filter(supports);
        if (!configured() || !services.length || fetching) return;
        load();
        var sig = signature(services);
        if (cache && cache.sig === sig && Date.now() - cache.at < FRESH_MS) return;
        if (Date.now() - lastFailure < RETRY_MS) return;
        fetching = true;
        providerIds().then(function (ids) {
            var wanted = services.filter(function (k) { return ids[k]; });
            return Promise.all(wanted.map(function (k) {
                return Promise.all([
                    discover('movie', ids[k]), discover('tv', ids[k]),
                    discover('movie', ids[k], true), discover('tv', ids[k], true)
                ]).then(function (all) {
                    return {
                        popular: { key: k, items: all[0].concat(all[1]) },
                        fresh: { key: k, items: all[2].concat(all[3].map(function (t) { t.episode = true; return t; })) }
                    };
                });
            }));
        }).then(function (perService) {
            fetching = false;
            var popular = perService.map(function (s) { return s.popular; });
            var chart = top(popular);
            cache = {
                at: Date.now(),
                sig: sig,
                top: chart,
                trending: mix(popular, ROW_SIZE),
                fresh: mix(perService.map(function (s) { return s.fresh; }), ROW_SIZE)
            };
            save();
            DevLog.log('TMDB: ' + cache.trending.length + ' trending, ' + cache.top.length + ' top, ' +
                cache.fresh.length + ' new titles for ' + region());
            listeners.forEach(function (fn) { fn(); });
        }).catch(function (err) {
            fetching = false;
            lastFailure = Date.now();
            DevLog.log('TMDB trending failed: ' + DevLog.errorText(err));
        });
    }

    function onUpdate(fn) {
        listeners.push(fn);
    }

    // ---------- Title screen

    function names(list, n) {
        return (list || []).slice(0, n).map(function (x) { return x.name; });
    }

    // Flat-rate provider names in the region, and the brands among them.
    function streaming(results) {
        var here = (results || {})[region()] || {};
        var names = (here.flatrate || []).map(function (p) { return p.provider_name; });
        return {
            names: names,
            services: names.map(brandOf).filter(function (b, i, all) { return b && all.indexOf(b) === i; })
        };
    }

    // A YouTube trailer, preferring one in the interface language, then an official one.
    function trailer(videos) {
        var lang = language().split('-')[0];
        var score = function (v) {
            return (v.iso_639_1 === lang ? 4 : 0) + (v.type === 'Trailer' ? 2 : 0) + (v.official ? 1 : 0);
        };
        var list = ((videos || {}).results || []).filter(function (v) {
            return v.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser');
        });
        list.sort(function (a, b) { return score(b) - score(a); });
        return list.length ? list[0].key : '';
    }

    function detail(type, id) {
        var k = type + '/' + id;
        if (details[k]) return details[k];
        details[k] = request('/' + k, {
            language: language(),
            append_to_response: 'credits,watch/providers,videos',
            include_video_language: language().split('-')[0] + ',en,null'
        }).then(function (d) {
            var on = streaming((d['watch/providers'] || {}).results);
            var t = summary(d, type);
            t.tagline = d.tagline || '';
            t.genres = names(d.genres, 3);
            t.cast = names((d.credits || {}).cast, 5);
            t.runtime = type === 'movie' ? d.runtime || 0 : 0;
            t.seasons = type === 'tv' ? d.number_of_seasons || 0 : 0;
            t.overview = d.overview || '';
            t.providers = on.names;
            t.services = on.services;
            t.trailer = trailer(d.videos);
            // Plenty of titles have no Portuguese synopsis yet: English beats an empty screen.
            if (t.overview || /^en/.test(language())) return t;
            return request('/' + k, { language: 'en-US' }).then(function (en) {
                t.overview = en.overview || '';
                return t;
            }, function () { return t; });
        });
        details[k].catch(function () { delete details[k]; });
        return details[k];
    }

    // ---------- Search ("where to watch")

    function search(query) {
        return request('/search/multi', {
            query: query,
            language: language(),
            include_adult: 'false',
            page: 1
        }).then(function (data) {
            return (data.results || []).filter(function (r) {
                return (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path;
            }).slice(0, 28).map(function (r) { return summary(r, r.media_type); });
        });
    }

    // Where one search result streams; asked for a handful of results only, not the whole page.
    function providers(type, id) {
        var k = type + '/' + id;
        if (!where[k]) {
            where[k] = request('/' + k + '/watch/providers', {}).then(function (d) {
                return streaming(d.results);
            });
            where[k].catch(function () { delete where[k]; });
        }
        return where[k];
    }

    window.Tmdb = {
        configured: configured,
        supports: supports,
        image: image,
        list: list,
        refresh: refresh,
        onUpdate: onUpdate,
        detail: detail,
        search: search,
        providers: providers
    };
})();
