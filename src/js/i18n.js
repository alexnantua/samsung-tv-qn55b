/*
 * Interface strings for Home, All apps and the weather screens, in the same languages as the
 * date (Settings ▸ Appearance ▸ Language). Anything missing from a language falls back to English.
 *
 * {name} in a string is replaced from the second argument of I18n.t.
 */
(function () {
    'use strict';

    var STRINGS = {
        en: {
            morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night',
            apps: 'Apps', inputs: 'Connected to the TV', allApps: 'All apps', appCount: '{n} apps',
            connected: 'Connected', disconnected: 'Not connected',
            weather: 'Weather', now: 'Now', today: 'Today',
            setUpWeather: 'Set up weather', chooseCity: 'Choose your city',
            weatherLoading: 'Loading the forecast…', weatherOffline: 'Forecast unavailable',
            feelsLike: 'Feels like {t}', humidity: 'Humidity', wind: 'Wind', rainChance: 'Chance of rain',
            uv: 'UV index', sunrise: 'Sunrise', sunset: 'Sunset',
            nextHours: 'Next hours', nextDays: 'Next 7 days', updatedAt: 'Updated {time}',
            changeCity: 'Change city', refresh: 'Refresh', units: 'Units',
            cityPrompt: 'City', searching: 'Searching for {q}…', noCity: 'No city called {q}',
            searchFailed: 'Could not search: check the connection', pickCity: 'Which one?',
            weatherFor: 'Weather for {city}',
            hintOpen: 'Open', hintSettings: 'Settings', hintHome: 'Home', hintSelect: 'Select',
            hintWeather: 'Forecast', hintWatch: 'Watch',
            trending: 'Trending on your apps', movie: 'Film', series: 'Series',
            seasons: '{n} seasons', oneSeason: '1 season', starring: 'Starring',
            noOverview: 'No synopsis yet.', streamsOn: 'Streams on {list}: no app for it on this TV',
            notStreaming: 'Not streaming in your region right now', titleOffline: 'Could not load the details',
            top: 'Top 10 on your apps', fresh: 'New on your apps', newEpisode: 'New episode',
            search: 'Search', searchPrompt: 'Film or series', searchFor: 'Results for “{q}”',
            noResults: 'Nothing found for “{q}”', newSearch: 'New search', hintDetails: 'Details',
            trailer: 'Trailer', noYoutube: 'YouTube is not installed', notOnYourApps: 'Not on your apps',
            checking: 'Checking…', offline: 'Offline',
            uvLow: 'Low', uvModerate: 'Moderate', uvHigh: 'High', uvVeryHigh: 'Very high', uvExtreme: 'Extreme'
        },
        pt: {
            morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite', night: 'Boa noite',
            apps: 'Apps', inputs: 'Conectados à TV', allApps: 'Todos os apps', appCount: '{n} apps',
            connected: 'Conectado', disconnected: 'Desconectado',
            weather: 'Clima', now: 'Agora', today: 'Hoje',
            setUpWeather: 'Configurar clima', chooseCity: 'Escolha sua cidade',
            weatherLoading: 'Carregando a previsão…', weatherOffline: 'Previsão indisponível',
            feelsLike: 'Sensação de {t}', humidity: 'Umidade', wind: 'Vento', rainChance: 'Chance de chuva',
            uv: 'Índice UV', sunrise: 'Nascer do sol', sunset: 'Pôr do sol',
            nextHours: 'Próximas horas', nextDays: 'Próximos 7 dias', updatedAt: 'Atualizado às {time}',
            changeCity: 'Mudar cidade', refresh: 'Atualizar', units: 'Unidade',
            cityPrompt: 'Cidade', searching: 'Procurando {q}…', noCity: 'Nenhuma cidade chamada {q}',
            searchFailed: 'Não foi possível buscar: verifique a conexão', pickCity: 'Qual delas?',
            weatherFor: 'Clima em {city}',
            hintOpen: 'Abrir', hintSettings: 'Ajustes', hintHome: 'Início', hintSelect: 'Selecionar',
            hintWeather: 'Previsão', hintWatch: 'Assistir',
            trending: 'Em alta nos seus apps', movie: 'Filme', series: 'Série',
            seasons: '{n} temporadas', oneSeason: '1 temporada', starring: 'Com',
            noOverview: 'Ainda sem sinopse.', streamsOn: 'Disponível em {list}: nenhum desses apps está nesta TV',
            notStreaming: 'Fora do streaming na sua região agora', titleOffline: 'Não foi possível carregar os detalhes',
            top: 'Top 10 nos seus apps', fresh: 'Novidades nos seus apps', newEpisode: 'Novo episódio',
            search: 'Busca', searchPrompt: 'Filme ou série', searchFor: 'Resultados para “{q}”',
            noResults: 'Nada encontrado para “{q}”', newSearch: 'Nova busca', hintDetails: 'Detalhes',
            trailer: 'Trailer', noYoutube: 'O YouTube não está instalado', notOnYourApps: 'Fora dos seus apps',
            checking: 'Verificando…', offline: 'Sem internet',
            uvLow: 'Baixo', uvModerate: 'Moderado', uvHigh: 'Alto', uvVeryHigh: 'Muito alto', uvExtreme: 'Extremo'
        },
        es: {
            morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches', night: 'Buenas noches',
            apps: 'Apps', inputs: 'Conectados a la TV', allApps: 'Todas las apps', appCount: '{n} apps',
            connected: 'Conectada', disconnected: 'Desconectada',
            weather: 'Tiempo', now: 'Ahora', today: 'Hoy',
            feelsLike: 'Sensación de {t}', humidity: 'Humedad', wind: 'Viento', rainChance: 'Prob. de lluvia',
            sunrise: 'Amanecer', sunset: 'Atardecer', nextHours: 'Próximas horas', nextDays: 'Próximos 7 días',
            changeCity: 'Cambiar ciudad', refresh: 'Actualizar', hintOpen: 'Abrir', hintSettings: 'Ajustes',
            hintHome: 'Inicio', hintWeather: 'Previsión', hintWatch: 'Ver',
            trending: 'Tendencias en tus apps', movie: 'Película', series: 'Serie',
            top: 'Top 10 en tus apps', fresh: 'Novedades en tus apps', newEpisode: 'Nuevo episodio',
            search: 'Buscar', searchPrompt: 'Película o serie', searchFor: 'Resultados para “{q}”',
            noResults: 'Nada para “{q}”', newSearch: 'Nueva búsqueda', hintDetails: 'Detalles',
            notOnYourApps: 'No está en tus apps',
            seasons: '{n} temporadas', oneSeason: '1 temporada', starring: 'Con'
        },
        fr: {
            morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir', night: 'Bonne nuit',
            apps: 'Apps', inputs: 'Branchés sur la TV', allApps: 'Toutes les apps', appCount: '{n} apps',
            connected: 'Connectée', disconnected: 'Déconnectée',
            weather: 'Météo', now: 'Maint.', today: 'Auj.',
            feelsLike: 'Ressenti {t}', humidity: 'Humidité', wind: 'Vent', rainChance: 'Risque de pluie',
            sunrise: 'Lever', sunset: 'Coucher', nextHours: 'Prochaines heures', nextDays: '7 prochains jours',
            changeCity: 'Changer de ville', refresh: 'Actualiser', hintOpen: 'Ouvrir', hintSettings: 'Réglages',
            hintHome: 'Accueil', hintWeather: 'Prévisions', hintWatch: 'Regarder',
            trending: 'Tendances sur vos apps', movie: 'Film', series: 'Série',
            top: 'Top 10 sur vos apps', fresh: 'Nouveautés sur vos apps', newEpisode: 'Nouvel épisode',
            search: 'Recherche', searchPrompt: 'Film ou série', searchFor: 'Résultats pour « {q} »',
            noResults: 'Rien pour « {q} »', newSearch: 'Nouvelle recherche', hintDetails: 'Détails',
            notOnYourApps: 'Pas sur vos apps',
            seasons: '{n} saisons', oneSeason: '1 saison', starring: 'Avec'
        }
    };

    function locale() {
        return (window.Prefs && Prefs.get().appearance.locale) || 'en-GB';
    }

    function lang() {
        return locale().split('-')[0];
    }

    function t(key, vars) {
        var table = STRINGS[lang()] || STRINGS.en;
        var text = table[key] !== undefined ? table[key] : STRINGS.en[key];
        if (text === undefined) return key;
        if (vars) {
            Object.keys(vars).forEach(function (k) { text = text.replace('{' + k + '}', vars[k]); });
        }
        return text;
    }

    function greeting(d) {
        var h = d.getHours();
        if (h >= 5 && h < 12) return t('morning');
        if (h >= 12 && h < 18) return t('afternoon');
        if (h >= 18 && h < 23) return t('evening');
        return t('night');
    }

    // "23h" reads naturally in Portuguese and French; elsewhere the hour keeps its minutes.
    function hour(d) {
        if (Prefs.get().appearance.clock === '12h') {
            return (d.getHours() % 12 || 12) + (d.getHours() < 12 ? ' AM' : ' PM');
        }
        var h = String(d.getHours()).padStart(2, '0');
        return lang() === 'pt' || lang() === 'fr' ? h + 'h' : h + ':00';
    }

    // "Qui", "Thu": the locale's short weekday without its trailing full stop.
    function weekday(d) {
        try {
            var text = d.toLocaleDateString(locale(), { weekday: 'short' }).replace(/\.$/, '');
            return text.charAt(0).toUpperCase() + text.slice(1);
        } catch (e) {
            return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
        }
    }

    window.I18n = {
        t: t,
        lang: lang,
        locale: locale,
        greeting: greeting,
        hour: hour,
        weekday: weekday
    };
})();
