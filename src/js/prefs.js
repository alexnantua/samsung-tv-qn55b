/*
 * User settings, stored on the TV (localStorage). js/config.js only provides the defaults.
 * They survive restarts and in-place updates, but not an uninstall.
 */
(function () {
    'use strict';

    var KEY = 'arn0.prefs.v1';
    var LEGACY_WALLPAPER_KEY = 'arn0.wallpaper';

    function defaults() {
        var cfg = window.LAUNCHER_CONFIG || {};
        var theme = cfg.theme || {};
        var weather = cfg.weather || {};
        return {
            sound: {
                enabled: cfg.sound ? cfg.sound.enabled !== false : true,
                preset: cfg.sound && cfg.sound.preset || 'soft'
            },
            wallpaper: {
                mode: theme.wallpaper ? 'photo' : 'off',   // 'off' | 'photo' | 'rotate' | 'ambient'
                photo: theme.wallpaper || 'forest',
                interval: '15m',        // see Wallpaper.INTERVALS
                lastChange: 0
            },
            screensaver: {
                enabled: true,
                delay: '5m',            // see Screensaver.DELAYS
                photoEvery: '75s',      // see Screensaver.PHOTO_EVERY
                dark: '1h',             // see Screensaver.DARK_AFTER
                source: 'photos'        // 'photos' (the Background) | 'titles' (TMDB backdrops)
            },
            appearance: {
                clock: '24h',           // '24h' | '12h'
                showDate: true,
                locale: cfg.locale || 'en-GB',
                font: 'manrope',        // see Appearance.FONTS
                names: 'always',        // app names under tiles: 'always' | 'focused' | 'never'
                name: cfg.name || ''    // first name in the Home greeting; '' = the TV account's, if any
            },
            weather: {
                name: weather.name || null,
                latitude: typeof weather.latitude === 'number' ? weather.latitude : null,
                longitude: typeof weather.longitude === 'number' ? weather.longitude : null,
                unit: weather.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'
            },
            // Rows under the apps, top to bottom, and the ones switched off. See Home.ROWS.
            rows: { order: ['inputs', 'trending', 'top', 'fresh'], hidden: [] },
            home: null,                 // [{ id, label, brand }] once edited; null = config.js apps
            inputs: null                // [{ hdmi, label, brand, method, hidden }] once edited; null = config.js
        };
    }

    function merge(target, saved) {
        if (!saved) return;
        Object.keys(target).forEach(function (k) {
            if (saved[k] !== undefined) target[k] = saved[k];
        });
    }

    function load() {
        var prefs = defaults();
        try {
            var saved = JSON.parse(localStorage.getItem(KEY));
            if (saved) {
                merge(prefs.sound, saved.sound);
                merge(prefs.wallpaper, saved.wallpaper);
                merge(prefs.screensaver, saved.screensaver);
                merge(prefs.appearance, saved.appearance);
                if (saved.rows && Array.isArray(saved.rows.order)) {
                    // A row added in a later version goes at the end rather than missing.
                    var known = prefs.rows.order;
                    prefs.rows.order = saved.rows.order.filter(function (k) { return known.indexOf(k) >= 0; })
                        .concat(known.filter(function (k) { return saved.rows.order.indexOf(k) < 0; }));
                    prefs.rows.hidden = Array.isArray(saved.rows.hidden) ? saved.rows.hidden : [];
                }
                // A city chosen on the TV wins over config.js; until then the config default stands.
                if (saved.weather && typeof saved.weather.latitude === 'number') merge(prefs.weather, saved.weather);
                else if (saved.weather && saved.weather.unit) prefs.weather.unit = saved.weather.unit;
                if (Array.isArray(saved.home) && saved.home.length) prefs.home = saved.home;
                if (Array.isArray(saved.inputs)) prefs.inputs = saved.inputs;
            } else {
                var legacy = localStorage.getItem(LEGACY_WALLPAPER_KEY);
                if (legacy) prefs.wallpaper.photo = legacy;
            }
        } catch (e) {
            // Unreadable storage: run with defaults.
        }
        // "Midnight" used to be a photo; it is now what Off shows.
        if (prefs.wallpaper.photo === 'midnight') {
            if (prefs.wallpaper.mode === 'photo') prefs.wallpaper.mode = 'off';
            prefs.wallpaper.photo = 'forest';
        }
        return prefs;
    }

    var prefs = load();

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(prefs));
            return true;
        } catch (e) {
            DevLog.log('Could not save settings: ' + DevLog.errorText(e));
            return false;
        }
    }

    function reset() {
        try {
            localStorage.removeItem(KEY);
            localStorage.removeItem(LEGACY_WALLPAPER_KEY);
        } catch (e) {
            // Nothing stored, nothing to clear.
        }
        prefs = defaults();
    }

    window.Prefs = {
        get: function () { return prefs; },
        save: save,
        reset: reset
    };
})();
