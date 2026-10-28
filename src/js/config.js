/*
 * Home screen content.
 *
 * apps: each entry picks the first installed app matching it:
 *   { id: 'org.tizen.netflix-app' }   exact app id (most reliable; see "All apps", the id of
 *                                     the focused app is shown at the bottom)
 *   { match: 'netflix' }              case-insensitive regex on id or name
 *   label                             optional display name
 *   brand                             optional key from js/brands.js (otherwise guessed from the name)
 *   hidden: true                      kept here but not shown on Home; still in All apps, and
 *                                     Settings ▸ Apps on Home can add it back
 * Entries that match nothing are skipped.
 *
 * inputs: Home shows every HDMI port the TV reports as connected, and only those. An entry here
 *   just names a port ({ hdmi: 2, label: 'PlayStation 5', brand: 'playstation' }) or keeps it off
 *   Home (hidden: true); unnamed ports show as "HDMI 2". Settings ▸ Consoles edits the same list.
 */
window.LAUNCHER_CONFIG = {
    apps: [
        { match: 'tizentube|youtube', label: 'YouTube', brand: 'youtube' },
        { id: 'org.tizen.primevideo', label: 'Prime Video' },
        { match: 'spotify', label: 'Spotify' },
        { id: 'org.tizen.netflix-app', label: 'Netflix', hidden: true },
        { match: 'globoplay', label: 'Globoplay', brand: 'globoplay', hidden: true },
        { match: 'disney', label: 'Disney+', hidden: true },
        { match: '(^|\\s)max(\\s|$)|hbo', label: 'Max', brand: 'max', hidden: true },
        { id: 'com.samsung.tv.aria-video', label: 'Apple TV', hidden: true },
        { match: 'paramount', label: 'Paramount+', hidden: true },
        { match: 'crunchyroll', label: 'Crunchyroll', hidden: true },
        { match: 'twitch', label: 'Twitch', hidden: true }
    ],

    inputs: [],

    // How an input tile switches the TV. See README "HDMI inputs".
    //   'switch+viewer'  set the TV source, then open Samsung's TV viewer (default)
    //   'switch'         only set the TV source
    //   'inapp'          show the input full screen inside the launcher (Back returns)
    inputMethod: 'switch+viewer',

    locale: 'pt-BR',

    // Added to the greeting ("Boa noite, Alex"). Settings ▸ Your name changes it on the TV.
    name: '',

    // Home ▸ "Em alta nos seus apps" and its title screen, from TMDB. Put the key in
    // config.local.js, never here: either the v3 API key or the v4 read access token. The region
    // (where-to-watch data) defaults to the locale's country.
    tmdb: { key: '', region: '' },

    theme: {
        // Starting wallpaper (key from js/wallpapers.js), or null for none (plain gradient).
        // Changed from Settings → Background; the TV remembers the choice.
        wallpaper: null
    },

    /*
     * Weather on Home, the forecast screen and the screen saver, from Open-Meteo. No API key and
     * nothing to keep secret. The city is normally chosen on the TV itself (Home ▸ weather card ▸
     * Change city); these coordinates are only the default until then. Two decimals is plenty.
     */
    weather: {
        name: null,             // shown on the forecast screen, e.g. 'São Paulo'
        latitude: null,
        longitude: null,
        unit: 'celsius'         // 'celsius' | 'fahrenheit'
    },

    /*
     * EXPERIMENTAL navigation sound. Synthesised, so there is no audio file. `move` plays when
     * focus changes, `edge` when it cannot (the end of a row). Tune by ear in the browser
     * preview; `volume` is 0–1 and sits on top of the TV's own volume.
     *
     * Whether this is worth keeping depends on the TV's audio latency: run
     * "Sound: report audio latency" in the Lab screen. Set enabled to false to silence it.
     */
    sound: {
        enabled: true,
        preset: 'soft',
        volume: 0.08,
        minGapMs: 45,
        presets: {
            soft: { label: 'Soft', freq: 620, ms: 30, type: 'sine' },
            warm: { label: 'Warm', freq: 520, ms: 44, type: 'triangle' },
            bright: { label: 'Bright', freq: 1040, ms: 30, type: 'triangle' }
        },
        move: { freq: 880, ms: 38, type: 'triangle' },
        edge: { freq: 200, ms: 70, type: 'sine' },
        select: { freq: 1320, ms: 55, type: 'triangle' }
    },

    // Development only: where the Lab screen sends its logs (npm run devlog on your computer).
    // null disables it; set it to http://<your-computer-ip>:8099/log while debugging.
    devLogUrl: null
};

/*
 * Local overrides from js/config.local.js, which is gitignored and loaded just before this file.
 * That is where values specific to one TV belong — coordinates, a devlog address — so this file
 * can stay in the repository with nulls in it. Nothing to strip before a push, nothing to put
 * back before a build, and the overlay reaches the browser preview and the .wgt alike.
 *
 * Merged one level deep, so a local file can set weather.latitude without restating the rest of
 * the block. Arrays (apps, inputs) and plain values replace the default outright.
 */
(function () {
    'use strict';

    var local = window.LAUNCHER_LOCAL;
    if (!local) return;

    function plainObject(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    Object.keys(local).forEach(function (key) {
        if (plainObject(local[key]) && plainObject(window.LAUNCHER_CONFIG[key])) {
            Object.keys(local[key]).forEach(function (inner) {
                window.LAUNCHER_CONFIG[key][inner] = local[key][inner];
            });
        } else {
            window.LAUNCHER_CONFIG[key] = local[key];
        }
    });
})();
