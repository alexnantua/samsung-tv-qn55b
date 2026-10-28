/*
 * Weather for Home, the forecast screen and the screen saver, from Open-Meteo. No API key, free
 * for non-commercial use.
 *
 * The place is chosen on the TV (Home ▸ weather card ▸ Change city, which searches Open-Meteo's
 * geocoder) and kept in Prefs.weather. Coordinates in js/config.js (or config.local.js) are only
 * the default; with neither, Home shows a "Set up weather" card instead.
 *
 * One request fetches everything: current conditions, 48 hours and 7 days. The reading is
 * refreshed when something is about to show it and never more than once an hour; a light
 * 15-minute check while the launcher is visible only turns into a request once that hour is up.
 * The last reading is cached in localStorage so Home opens with real numbers, even after the TV
 * has been off.
 */
(function () {
    'use strict';

    var STORE_KEY = 'arn0.weather.v2';
    var ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
    var GEOCODER = 'https://geocoding-api.open-meteo.com/v1/search';
    var FRESH_MS = 60 * 60 * 1000;          // inside the hour, the cached reading will do
    var USABLE_MS = 3 * 60 * 60 * 1000;     // older than this counts as no reading at all
    var TIMEOUT_MS = 8000;
    var RETRY_MS = 10 * 60 * 1000;          // quiet period after a failed attempt
    var CHECK_MS = 15 * 60 * 1000;

    /*
     * Open-Meteo returns 25 WMO codes. They collapse to the nine that are worth a different
     * icon at a glance from a sofa.
     */
    function group(code) {
        if (code === 0) return 'clear';
        if (code <= 2) return 'partly';
        if (code === 3) return 'cloudy';
        if (code <= 48) return 'fog';
        if (code <= 57) return 'drizzle';
        if (code <= 67) return 'rain';
        if (code <= 77) return 'snow';
        if (code <= 82) return 'showers';
        if (code <= 86) return 'snow';
        return 'storm';
    }

    var LABELS = {
        en: {
            clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', drizzle: 'Drizzle',
            rain: 'Rain', showers: 'Showers', snow: 'Snow', storm: 'Thunderstorm'
        },
        pt: {
            clear: 'Céu limpo', partly: 'Parcialmente nublado', cloudy: 'Nublado', fog: 'Neblina',
            drizzle: 'Garoa', rain: 'Chuva', showers: 'Pancadas de chuva', snow: 'Neve', storm: 'Tempestade'
        },
        es: {
            clear: 'Despejado', partly: 'Poco nuboso', cloudy: 'Nublado', fog: 'Niebla', drizzle: 'Llovizna',
            rain: 'Lluvia', showers: 'Chubascos', snow: 'Nieve', storm: 'Tormenta'
        },
        fr: {
            clear: 'Dégagé', partly: 'Éclaircies', cloudy: 'Nuageux', fog: 'Brouillard', drizzle: 'Bruine',
            rain: 'Pluie', showers: 'Averses', snow: 'Neige', storm: 'Orage'
        }
    };

    function label(name) {
        return (LABELS[I18n.lang()] || LABELS.en)[name];
    }

    /*
     * Filled, coloured icons on a 32x32 grid. Shapes are drawn back to front, so a cloud simply
     * covers the sun behind it — no masks, no clipping. The cloud is a union of three circles and
     * a rounded bar in one colour, which reads as one shape.
     */
    var SUN_C = '#ffc53d';
    var MOON_C = '#dfe5ff';
    var CLOUD_C = '#eef2f8';
    var DARK_CLOUD_C = '#aab4c4';
    var RAIN_C = '#6ec1ff';

    function cloud(fill, dx, dy) {
        return '<g fill="' + fill + '" transform="translate(' + dx + ' ' + dy + ')">' +
            '<circle cx="11" cy="20" r="5"/><circle cx="17.5" cy="16.5" r="7"/>' +
            '<circle cx="23.5" cy="20.5" r="4.5"/><rect x="6" y="20" width="22" height="5" rx="2.5"/></g>';
    }

    function sun(cx, cy, r, inner, outer) {
        var rays = '';
        for (var i = 0; i < 8; i++) {
            var a = i * Math.PI / 4;
            var c = Math.cos(a);
            var s = Math.sin(a);
            rays += 'M' + (cx + inner * c).toFixed(2) + ' ' + (cy + inner * s).toFixed(2) +
                'L' + (cx + outer * c).toFixed(2) + ' ' + (cy + outer * s).toFixed(2);
        }
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + SUN_C + '"/>' +
            '<path d="' + rays + '" stroke="' + SUN_C + '" stroke-width="2.2" stroke-linecap="round"/>';
    }

    var MOON = '<path fill="' + MOON_C + '" d="M14.29 7.02A10 10 0 1 0 24.98 17.71A8 8 0 0 1 14.29 7.02Z"/>';
    var SMALL_MOON = '<path fill="' + MOON_C + '" d="M11.48 6.02A7 7 0 1 0 18.98 13.52A5.6 5.6 0 0 1 11.48 6.02Z"/>';

    function lines(d, colour) {
        return '<path d="' + d + '" stroke="' + colour + '" stroke-width="2.2" stroke-linecap="round"/>';
    }

    var ICONS = {
        clear: function (day) { return day ? sun(16, 16, 6.5, 9.5, 13) : MOON; },
        partly: function (day) {
            return (day ? sun(11.5, 11.5, 4.6, 6.8, 9.2) : SMALL_MOON) + cloud(CLOUD_C, 2, 2);
        },
        cloudy: function () { return cloud('#c3ccd9', -3, -3) + cloud(CLOUD_C, 1, 1); },
        fog: function () {
            return cloud(CLOUD_C, 0, -4) + lines('M5 25.5H22M10 29H27', '#c9d1dc');
        },
        drizzle: function () {
            return cloud(CLOUD_C, 0, -5) + lines('M12 24.5L11.2 26.5M19 24.5L18.2 26.5M15.5 28L14.7 30', RAIN_C);
        },
        rain: function () {
            return cloud(DARK_CLOUD_C, 0, -5) + lines('M11 24L9.4 28.5M16.5 24L14.9 28.5M22 24L20.4 28.5', RAIN_C);
        },
        showers: function (day) {
            return (day ? sun(10, 9, 4.2, 6.2, 8.4) : SMALL_MOON) + cloud(CLOUD_C, 1, -3) +
                lines('M12 26L10.6 29.5M17.5 26L16.1 29.5M23 26L21.6 29.5', RAIN_C);
        },
        snow: function () {
            return cloud(CLOUD_C, 0, -5) + '<g fill="#ffffff"><circle cx="11" cy="25.5" r="1.6"/>' +
                '<circle cx="17" cy="27.5" r="1.6"/><circle cx="23" cy="25.5" r="1.6"/>' +
                '<circle cx="14" cy="30" r="1.4"/><circle cx="20" cy="30" r="1.4"/></g>';
        },
        storm: function () {
            return cloud(DARK_CLOUD_C, 0, -5) +
                '<path fill="' + SUN_C + '" d="M17.5 19.5L12 26.5H15.8L13.8 31.5L20.5 23.8H16.6L18.8 19.5Z"/>';
        },
        pin: function () {
            return '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" ' +
                'd="M16 29s-9-8.2-9-15a9 9 0 0 1 18 0c0 6.8-9 15-9 15z"/>' +
                '<circle cx="16" cy="14" r="3.4" fill="none" stroke="currentColor" stroke-width="2.2"/>';
        }
    };

    function icon(name, isDay) {
        var draw = ICONS[name] || ICONS.cloudy;
        return '<svg viewBox="0 0 32 32">' + draw(isDay !== false) + '</svg>';
    }

    // ---------- Place

    function place() {
        var p = Prefs.get().weather;
        if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return null;
        return p;
    }

    function configured() {
        return !!place();
    }

    // ---------- Cache

    var reading = null;
    var fetching = false;
    var lastFailure = 0;
    var listeners = [];

    function notify() {
        listeners.slice().forEach(function (fn) { fn(); });
    }

    function load() {
        try {
            reading = JSON.parse(localStorage.getItem(STORE_KEY));
        } catch (e) {
            reading = null;
        }
    }

    function store() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(reading));
        } catch (e) {
            // Without the cache we only lose the instant first paint.
        }
    }

    // A reading taken for another city, or in other units, is no reading at all.
    function matches(r) {
        var p = place();
        return !!(r && p && r.lat === p.latitude && r.lon === p.longitude && r.unit === unit());
    }

    function age() {
        return matches(reading) && reading.at ? Date.now() - reading.at : Infinity;
    }

    /*
     * A stale reading is worse than none: an unattended screen showing yesterday's temperature as
     * if it were now is a confidently wrong answer, so past USABLE_MS everything hides.
     */
    function usable() {
        return configured() && age() <= USABLE_MS ? reading : null;
    }

    function unit() {
        return Prefs.get().weather.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    }

    function deg(v) {
        return Math.round(v) + '°';
    }

    // ---------- What the screens show

    // Screen saver corner and Home's status bar: one line, monochrome-friendly.
    function current() {
        var r = usable();
        if (!r) return null;
        var name = group(r.now.code);
        var today = r.daily[0] || {};
        return {
            temp: deg(r.now.temp),
            detail: label(name) + ' · ' + deg(today.max) + ' / ' + deg(today.min),
            icon: icon(name, r.now.isDay),
            sky: name               // for the "Time & weather" background (js/ambient.js)
        };
    }

    function hours(r, n) {
        var from = Date.now() - 60 * 60 * 1000;
        return r.hourly.filter(function (h) { return h.t > from; }).slice(0, n).map(function (h, i) {
            var name = group(h.code);
            return {
                label: i === 0 ? I18n.t('now') : I18n.hour(new Date(h.t)),
                icon: icon(name, h.isDay),
                temp: deg(h.temp),
                pop: h.pop
            };
        });
    }

    function days(r) {
        var lo = Infinity;
        var hi = -Infinity;
        r.daily.forEach(function (d) {
            lo = Math.min(lo, d.min);
            hi = Math.max(hi, d.max);
        });
        var span = Math.max(1, hi - lo);
        return r.daily.map(function (d, i) {
            return {
                label: i === 0 ? I18n.t('today') : I18n.weekday(new Date(d.t)),
                icon: icon(group(d.code), true),
                max: deg(d.max),
                min: deg(d.min),
                pop: d.pop,
                // Where this day's range sits within the week's, as fractions for the bar.
                from: (d.min - lo) / span,
                to: (d.max - lo) / span
            };
        });
    }

    function uvLabel(uv) {
        if (uv < 3) return I18n.t('uvLow');
        if (uv < 6) return I18n.t('uvModerate');
        if (uv < 8) return I18n.t('uvHigh');
        if (uv < 11) return I18n.t('uvVeryHigh');
        return I18n.t('uvExtreme');
    }

    function clock(ms) {
        var t = Appearance.time(new Date(ms));
        return t.time + (t.suffix ? ' ' + t.suffix : '');
    }

    // Everything Home and the forecast screen draw, or null with `status` explaining why.
    function forecast() {
        var r = usable();
        if (!r) return null;
        var name = group(r.now.code);
        var today = r.daily[0] || {};
        return {
            place: place().name || '',
            temp: deg(r.now.temp),
            label: label(name),
            icon: icon(name, r.now.isDay),
            feels: I18n.t('feelsLike', { t: deg(r.now.feels) }),
            max: deg(today.max),
            min: deg(today.min),
            pop: today.pop,
            humidity: Math.round(r.now.humidity) + '%',
            wind: Math.round(r.now.wind) + (unit() === 'fahrenheit' ? ' mph' : ' km/h'),
            uv: Math.round(today.uv) + ' · ' + uvLabel(today.uv),
            sunrise: today.sunrise ? clock(today.sunrise) : '–',
            sunset: today.sunset ? clock(today.sunset) : '–',
            updated: I18n.t('updatedAt', { time: clock(r.at) }),
            hours: function (n) { return hours(r, n); },
            days: function () { return days(r); }
        };
    }

    // 'off' (no place), 'loading' (first request in flight), 'offline' (it failed), or 'ok'.
    function status() {
        if (!configured()) return 'off';
        if (usable()) return 'ok';
        return fetching ? 'loading' : (lastFailure ? 'offline' : 'loading');
    }

    // ---------- Fetching

    function getJSON(url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = TIMEOUT_MS;
            xhr.onload = function () {
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error('HTTP ' + xhr.status));
                    return;
                }
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    reject(new Error('unreadable response'));
                }
            };
            xhr.onerror = function () { reject(new Error('request failed')); };
            xhr.ontimeout = function () { reject(new Error('request timed out')); };
            xhr.send();
        });
    }

    function url(p) {
        var f = unit() === 'fahrenheit';
        return ENDPOINT +
            '?latitude=' + encodeURIComponent(p.latitude) +
            '&longitude=' + encodeURIComponent(p.longitude) +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
            '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,' +
            'sunrise,sunset,uv_index_max' +
            '&forecast_days=7&forecast_hours=48&timezone=auto&timeformat=unixtime' +
            (f ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
    }

    function column(block, key, i, fallback) {
        var v = block[key] && block[key][i];
        return typeof v === 'number' ? v : fallback;
    }

    function parse(data, p) {
        var now = data && data.current;
        var h = data && data.hourly;
        var d = data && data.daily;
        if (!now || !h || !d || typeof now.temperature_2m !== 'number') return null;
        return {
            at: Date.now(),
            lat: p.latitude,
            lon: p.longitude,
            unit: unit(),
            now: {
                temp: now.temperature_2m,
                feels: typeof now.apparent_temperature === 'number' ? now.apparent_temperature : now.temperature_2m,
                humidity: typeof now.relative_humidity_2m === 'number' ? now.relative_humidity_2m : 0,
                wind: typeof now.wind_speed_10m === 'number' ? now.wind_speed_10m : 0,
                code: typeof now.weather_code === 'number' ? now.weather_code : 3,
                isDay: now.is_day !== 0
            },
            hourly: (h.time || []).map(function (t, i) {
                return {
                    t: t * 1000,
                    temp: column(h, 'temperature_2m', i, 0),
                    code: column(h, 'weather_code', i, 3),
                    pop: column(h, 'precipitation_probability', i, 0),
                    isDay: column(h, 'is_day', i, 1) !== 0
                };
            }),
            daily: (d.time || []).map(function (t, i) {
                return {
                    t: t * 1000,
                    code: column(d, 'weather_code', i, 3),
                    max: column(d, 'temperature_2m_max', i, 0),
                    min: column(d, 'temperature_2m_min', i, 0),
                    pop: column(d, 'precipitation_probability_max', i, 0),
                    sunrise: column(d, 'sunrise', i, 0) * 1000,
                    sunset: column(d, 'sunset', i, 0) * 1000,
                    uv: column(d, 'uv_index_max', i, 0)
                };
            })
        };
    }

    /*
     * The hourly rule is keyed on the last *successful* reading, so on its own it does not slow
     * down retries: while the API is unreachable every trigger would ask again. A failed attempt
     * therefore buys ten minutes of quiet.
     */
    function refresh(force) {
        var p = place();
        if (!p || fetching) return;
        if (!force && age() < FRESH_MS) return;
        if (!force && Date.now() - lastFailure < RETRY_MS) return;
        fetching = true;
        notify();
        getJSON(url(p)).then(function (data) {
            var r = parse(data, p);
            if (!r) throw new Error('unusable response');
            fetching = false;
            lastFailure = 0;
            // The place may have changed while this was in flight; then this answer is for the old one.
            if (!matches(r)) return;
            reading = r;
            store();
            notify();
        }).catch(function (err) {
            fetching = false;
            lastFailure = Date.now();
            DevLog.log('Weather: ' + DevLog.errorText(err));
            notify();
        });
    }

    // ---------- Choosing a place

    function search(query) {
        var lang = I18n.lang();
        return getJSON(GEOCODER + '?name=' + encodeURIComponent(query) + '&count=8&format=json' +
            '&language=' + encodeURIComponent(lang)).then(function (data) {
            return (data && data.results || []).map(function (r) {
                return {
                    name: r.name,
                    detail: [r.admin1, r.country].filter(Boolean).join(', '),
                    latitude: Math.round(r.latitude * 100) / 100,
                    longitude: Math.round(r.longitude * 100) / 100
                };
            });
        });
    }

    function setPlace(p) {
        var w = Prefs.get().weather;
        w.name = p.name;
        w.latitude = p.latitude;
        w.longitude = p.longitude;
        Prefs.save();
        lastFailure = 0;
        notify();
        refresh(true);
    }

    function setUnit(u) {
        Prefs.get().weather.unit = u;
        Prefs.save();
        lastFailure = 0;
        notify();
        refresh(true);
    }

    function start() {
        load();
        if (!configured()) {
            DevLog.log('Weather off: choose a city on Home, or set weather coordinates in js/config.js');
        }
        refresh();
        setInterval(function () {
            if (!document.hidden) refresh();
        }, CHECK_MS);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refresh();
        });
    }

    window.Weather = {
        start: start,
        refresh: refresh,
        current: current,
        forecast: forecast,
        status: status,
        configured: configured,
        place: place,
        search: search,
        setPlace: setPlace,
        setUnit: setUnit,
        unit: unit,
        icon: icon,
        group: group,
        onUpdate: function (fn) { listeners.push(fn); },
        actions: function () {
            return [{
                label: 'Weather: fetch now and log the reading',
                run: function () {
                    var p = place();
                    if (!p) {
                        UI.toast('No city chosen yet');
                        return;
                    }
                    DevLog.log('Weather: requesting ' + url(p));
                    var once = function () {
                        if (fetching) return;
                        listeners.splice(listeners.indexOf(once), 1);
                        DevLog.log('Weather: ' + JSON.stringify(reading && reading.now));
                        UI.toast(lastFailure ? 'Weather request failed' : 'Weather updated');
                    };
                    listeners.push(once);
                    refresh(true);
                }
            }];
        }
    };
})();
