/*
 * Painted backgrounds. Gradients are drawn once into a small canvas and used as an image, never
 * as live CSS gradient layers: the render probe measured those at 4.6 fps on this hardware (see
 * the top of css/style.css). A 640x360 bitmap stretched to the screen is smooth enough for a
 * gradient and costs nothing per frame.
 *
 * Two uses:
 *   image()  the Background's "Time & weather" mode: colours follow the hour, and a grey or
 *            rainy sky outside mutes them. Repainted only when the period or the sky changes.
 *   shade()  the scrim that fades a title's backdrop into the page (Home's spotlight, the title
 *            screen), as a transparent PNG.
 */
(function () {
    'use strict';

    var W = 640;
    var H = 360;

    // Sky colours top to bottom, and a soft glow where the sun or moon would be (x, y, radius in
    // fractions of the width; colour with its alpha).
    var PERIODS = [
        { key: 'night', from: 21, to: 5, top: '#060a16', bottom: '#121b36', glow: [0.78, 0.2, 0.32, 'rgba(120, 150, 230, 0.22)'] },
        { key: 'dawn', from: 5, to: 8, top: '#1a2146', bottom: '#c97a6a', glow: [0.7, 0.92, 0.55, 'rgba(255, 170, 120, 0.5)'] },
        { key: 'day', from: 8, to: 16, top: '#163f78', bottom: '#5f93c7', glow: [0.82, 0.1, 0.45, 'rgba(255, 240, 205, 0.4)'] },
        { key: 'golden', from: 16, to: 18, top: '#26336a', bottom: '#d18a52', glow: [0.75, 0.86, 0.55, 'rgba(255, 190, 110, 0.55)'] },
        { key: 'dusk', from: 18, to: 21, top: '#11163a', bottom: '#6d3a66', glow: [0.72, 0.95, 0.5, 'rgba(255, 120, 130, 0.35)'] }
    ];

    // Weather.current().sky → how far the colours move towards a grey, and how much glow is left.
    var SKIES = {
        partly: { grey: '#3a4352', mix: 0.15, glow: 0.8 },
        cloudy: { grey: '#363e4b', mix: 0.42, glow: 0.45 },
        fog: { grey: '#454c57', mix: 0.5, glow: 0.35 },
        drizzle: { grey: '#26303d', mix: 0.5, glow: 0.3 },
        rain: { grey: '#1f2935', mix: 0.58, glow: 0.2 },
        showers: { grey: '#1f2935', mix: 0.55, glow: 0.25 },
        storm: { grey: '#161c26', mix: 0.65, glow: 0.12 },
        snow: { grey: '#8794a8', mix: 0.32, glow: 0.4 }
    };

    var painted = { key: null, file: '' };
    var shadeFile = '';

    function canvas(w, h) {
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    function rgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    }

    function mix(hex, toward, amount) {
        var a = rgb(hex);
        var b = rgb(toward);
        return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * amount); }).join(',') + ')';
    }

    function period(hour) {
        return PERIODS.find(function (p) {
            return p.from < p.to ? hour >= p.from && hour < p.to : hour >= p.from || hour < p.to;
        });
    }

    function sky() {
        var now = window.Weather && Weather.current();
        return now && now.sky || 'clear';
    }

    function key() {
        return period(new Date().getHours()).key + '/' + sky();
    }

    function paint(p, weather) {
        var c = canvas(W, H);
        var g = c.getContext('2d');
        var s = SKIES[weather] || { grey: '#000000', mix: 0, glow: 1 };

        var base = g.createLinearGradient(0, 0, 0, H);
        base.addColorStop(0, mix(p.top, s.grey, s.mix));
        base.addColorStop(1, mix(p.bottom, s.grey, s.mix));
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);

        var x = p.glow[0] * W;
        var y = p.glow[1] * H;
        var glow = g.createRadialGradient(x, y, 0, x, y, p.glow[2] * W);
        g.globalAlpha = s.glow;
        glow.addColorStop(0, p.glow[3]);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;

        // The readability scrim scripts/prepare-wallpapers.mjs burns into the photos: darker on
        // the left, under the clock, and along the bottom, under the rows.
        var left = g.createLinearGradient(0, 0, W, 0);
        left.addColorStop(0, 'rgba(4, 6, 10, 0.55)');
        left.addColorStop(0.6, 'rgba(4, 6, 10, 0.1)');
        left.addColorStop(1, 'rgba(4, 6, 10, 0.1)');
        g.fillStyle = left;
        g.fillRect(0, 0, W, H);
        var bottom = g.createLinearGradient(0, H, 0, 0);
        bottom.addColorStop(0, 'rgba(4, 6, 10, 0.65)');
        bottom.addColorStop(0.55, 'rgba(4, 6, 10, 0)');
        g.fillStyle = bottom;
        g.fillRect(0, 0, W, H);

        return c.toDataURL('image/jpeg', 0.92);
    }

    function image() {
        var k = key();
        if (painted.key !== k) {
            painted = { key: k, file: paint(period(new Date().getHours()), sky()) };
        }
        return { key: 'ambient', file: painted.file, title: '' };
    }

    // Matches the page colour (--bg): opaque on the left and along the bottom, clear top right.
    function shade() {
        if (shadeFile) return shadeFile;
        var w = 480;
        var h = 270;
        var c = canvas(w, h);
        var g = c.getContext('2d');
        var across = g.createLinearGradient(0, 0, w, 0);
        across.addColorStop(0.22, 'rgba(7, 9, 14, 1)');
        across.addColorStop(0.42, 'rgba(7, 9, 14, 0.82)');
        across.addColorStop(0.72, 'rgba(7, 9, 14, 0)');
        g.fillStyle = across;
        g.fillRect(0, 0, w, h);
        var up = g.createLinearGradient(0, h, 0, 0);
        up.addColorStop(0.26, 'rgba(7, 9, 14, 1)');
        up.addColorStop(0.56, 'rgba(7, 9, 14, 0)');
        g.fillStyle = up;
        g.fillRect(0, 0, w, h);
        shadeFile = c.toDataURL('image/png');
        return shadeFile;
    }

    window.Ambient = {
        image: image,
        key: key,
        shade: shade
    };
})();
