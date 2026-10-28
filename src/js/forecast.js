/*
 * Forecast screen (Home ▸ weather card): now, the next 12 hours and the next 7 days, plus the
 * city search. Drawing only — the data and its refresh rules live in js/weather.js.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;
    var t = I18n.t;

    function iconEl(className, html) {
        var e = el('div', className);
        e.innerHTML = html;
        return e;
    }

    function stat(label, value) {
        var cell = el('div', 'fc-stat');
        cell.appendChild(el('div', 'fc-stat-label', label));
        cell.appendChild(el('div', 'fc-stat-value', value));
        return cell;
    }

    function section(title) {
        var s = el('div', 'fc-section');
        s.appendChild(el('h2', '', title));
        return s;
    }

    function renderNow(body, f) {
        var top = el('div', 'fc-top');

        var now = el('div', 'fc-now');
        now.appendChild(iconEl('fc-now-icon', f.icon));
        var main = el('div', 'fc-now-main');
        main.appendChild(el('div', 'fc-now-temp', f.temp));
        main.appendChild(el('div', 'fc-now-label', f.label));
        main.appendChild(el('div', 'fc-now-sub', f.feels + '  ·  ↑ ' + f.max + '  ↓ ' + f.min));
        now.appendChild(main);
        top.appendChild(now);

        var stats = el('div', 'fc-stats');
        stats.appendChild(stat(t('rainChance'), f.pop + '%'));
        stats.appendChild(stat(t('humidity'), f.humidity));
        stats.appendChild(stat(t('wind'), f.wind));
        stats.appendChild(stat(t('uv'), f.uv));
        stats.appendChild(stat(t('sunrise'), f.sunrise));
        stats.appendChild(stat(t('sunset'), f.sunset));
        top.appendChild(stats);

        body.appendChild(top);
    }

    function renderHours(body, f) {
        var s = section(t('nextHours'));
        var strip = el('div', 'fc-hours');
        f.hours(12).forEach(function (h) {
            var col = el('div', 'fc-hour');
            col.appendChild(el('div', 'fc-hour-label', h.label));
            col.appendChild(iconEl('fc-hour-icon', h.icon));
            col.appendChild(el('div', 'fc-hour-temp', h.temp));
            col.appendChild(el('div', 'fc-pop' + (h.pop >= 30 ? ' wet' : ''), h.pop + '%'));
            strip.appendChild(col);
        });
        s.appendChild(strip);
        body.appendChild(s);
    }

    function renderDays(body, f) {
        var s = section(t('nextDays'));
        var row = el('div', 'fc-days');
        f.days().forEach(function (d) {
            var card = el('div', 'fc-day');
            var head = el('div', 'fc-day-head');
            head.appendChild(el('div', 'fc-day-label', d.label));
            head.appendChild(el('div', 'fc-pop' + (d.pop >= 30 ? ' wet' : ''), d.pop + '%'));
            card.appendChild(head);
            card.appendChild(iconEl('fc-day-icon', d.icon));
            var temps = el('div', 'fc-day-temps');
            temps.appendChild(el('span', 'fc-day-max', d.max));
            temps.appendChild(el('span', 'fc-day-min', d.min));
            card.appendChild(temps);
            // The day's range within the week's: a flat bar, no gradient (see style.css).
            var bar = el('div', 'fc-range');
            var fill = el('div', 'fc-range-fill');
            fill.style.left = Math.round(d.from * 100) + '%';
            fill.style.width = Math.max(6, Math.round((d.to - d.from) * 100)) + '%';
            bar.appendChild(fill);
            card.appendChild(bar);
            row.appendChild(card);
        });
        s.appendChild(row);
        body.appendChild(s);
    }

    function renderMessage(body, title, sub) {
        var box = el('div', 'fc-message');
        box.appendChild(iconEl('fc-message-icon', Weather.icon(Weather.configured() ? 'cloudy' : 'pin')));
        box.appendChild(el('div', 'fc-message-title', title));
        if (sub) box.appendChild(el('div', 'fc-message-sub', sub));
        body.appendChild(box);
    }

    function renderActions() {
        var bar = $('fc-actions');
        bar.innerHTML = '';
        var chip = function (label, item, on) {
            var c = el('div', 'chip' + (on ? ' on' : ''), label);
            c._item = item;
            bar.appendChild(c);
        };
        chip(t('changeCity'), { kind: 'city' });
        if (Weather.configured()) chip(t('refresh'), { kind: 'refresh' });
        chip('°C', { kind: 'unit', value: 'celsius' }, Weather.unit() === 'celsius');
        chip('°F', { kind: 'unit', value: 'fahrenheit' }, Weather.unit() === 'fahrenheit');
    }

    function render() {
        var p = Weather.place();
        var f = Weather.forecast();
        $('fc-title').textContent = p && p.name ? t('weatherFor', { city: p.name }) : t('weather');
        $('fc-updated').textContent = f ? f.updated : '';
        renderActions();

        var body = $('fc-body');
        body.innerHTML = '';
        var status = Weather.status();
        if (f) {
            renderNow(body, f);
            renderHours(body, f);
            renderDays(body, f);
        } else if (status === 'off') {
            renderMessage(body, t('setUpWeather'), t('chooseCity'));
        } else if (status === 'offline') {
            renderMessage(body, t('weatherOffline'), '');
        } else {
            renderMessage(body, t('weatherLoading'), '');
        }
    }

    // Keyboard → Open-Meteo geocoder → a pick list when the name is ambiguous.
    function changeCity() {
        Settings.prompt(t('cityPrompt'), '', function (query) {
            UI.toast(t('searching', { q: query }));
            Weather.search(query).then(function (results) {
                if (!results.length) {
                    UI.toast(t('noCity', { q: query }));
                    return;
                }
                var choose = function (r) {
                    Weather.setPlace(r);
                    UI.toast(t('weatherFor', { city: r.name }));
                };
                if (results.length === 1) {
                    choose(results[0]);
                    return;
                }
                UI.menu(t('pickCity'), results.map(function (r) {
                    return { label: r.name + (r.detail ? ' · ' + r.detail : ''), run: function () { choose(r); } };
                }));
            }, function (err) {
                DevLog.log('City search failed: ' + DevLog.errorText(err));
                UI.toast(t('searchFailed'));
            });
        });
    }

    function activate(item) {
        if (item.kind === 'city') changeCity();
        else if (item.kind === 'refresh') {
            Weather.refresh(true);
            render();
            UI.refresh();
        } else if (item.kind === 'unit' && item.value !== Weather.unit()) {
            Weather.setUnit(item.value);
        }
    }

    function init() {
        UI.register('weather', {
            el: $('weather'),
            rows: function () { return [UI.children($('fc-actions'))]; },
            onShow: function () {
                render();
                Weather.refresh();
            },
            activate: activate,
            hints: function () { return [['OK', I18n.t('hintSelect')], ['Back', I18n.t('hintHome')]]; }
        });
        Weather.onUpdate(function () {
            if (UI.isVisible('weather')) {
                render();
                UI.refresh();
            }
        });
    }

    window.Forecast = {
        init: init,
        changeCity: changeCity
    };
})();
