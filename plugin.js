(function() {
    // --- PARTE 1: Detector de eventos 'play' ---
    function attachListeners(root) {
        var videos = root.getElementsByTagName('video');
        for (var i = 0; i < videos.length; i++) {
            if (!videos[i]._zeusListenerAttached) {
                videos[i]._zeusListenerAttached = true;
                videos[i].addEventListener('play', function() {
                    var src = this.src ||
                        (this.querySelector('source') && this.querySelector('source').src) || '';
                    if (src && src.indexOf('blob:') !== 0) {
                        if (window.AndroidVideoBridge) {
                            window.AndroidVideoBridge.onVideoPlay(src);
                        }
                    }
                });
            }
        }
    }
    attachListeners(document);
    var playObserver = new MutationObserver(function() { attachListeners(document); });
    playObserver.observe(document.body, { childList: true, subtree: true });

    // --- PARTE 2: Escáner de URLs estáticas y reproductores ---
    if (window._zeusScannerInjected) return;
    window._zeusScannerInjected = true;

    var results = new Set();
    var extensions = ['.mp4', '.m3u8', '.mpd', '.mkv', '.webm', '.ts'];
    var isScanning = false;

    function scanForVideos() {
        if (isScanning) return;
        isScanning = true;
        try {
            var initialSize = results.size;

            // 1. Buscar en etiquetas de video nativas
            var mediaElements = document.querySelectorAll('video, source');
            mediaElements.forEach(function(el) {
                if (el.src && el.src.startsWith('http')) results.add(el.src);
            });

            // 2. Buscar en enlaces directos
            var links = document.querySelectorAll('a');
            links.forEach(function(a) {
                if (a.href) {
                    var cleanHref = a.href.toLowerCase().split('?')[0];
                    if (extensions.some(ext => cleanHref.endsWith(ext))) {
                        results.add(a.href);
                    }
                }
            });

            // 3. Interrogar reproductores famosos en memoria
            try {
                if (typeof jwplayer === 'function') {
                    var playlists = jwplayer().getPlaylist();
                    if (playlists) {
                        for (var p = 0; p < playlists.length; p++) {
                            var sources = playlists[p].sources;
                            if (sources) {
                                for (var i = 0; i < sources.length; i++) {
                                    if (sources[i].file) results.add(sources[i].file);
                                }
                            }
                        }
                    }
                }
            } catch (e) {}

            try {
                if (typeof Clappr !== 'undefined' && Clappr.PlayerInfo && Clappr.PlayerInfo._players) {
                    var players = Clappr.PlayerInfo._players;
                    for (var key in players) {
                        var source = players[key].options.source;
                        if (source) results.add(source);
                    }
                }
            } catch (e) {}

            try {
                if (window.flowplayer && typeof window.flowplayer === 'function') {
                    var fp = window.flowplayer();
                    if (fp && fp.video && fp.video.src) results.add(fp.video.src);
                }
            } catch (e) {}

            // 4. Buscar payloads ofuscados en etiquetas de video
            mediaElements.forEach(function(el) {
                if (el.dataset && el.dataset.payload) {
                    try {
                        var decoded = atob(el.dataset.payload); 
                        var regex = /https?:\/\/[^\s"'<>]+?\.(mp4|m3u8|ts)/gi;
                        var matches = decoded.match(regex);
                        if (matches) matches.forEach(m => results.add(m.replace(/\\\//g, '/')));
                    } catch(e) {}
                }
            });

            // 5. Fuerza bruta: Regex sobre todo el HTML vivo
            var htmlContent = document.documentElement.innerHTML;
            var regex = /https?:\/\/[^\s"'<>]+?\.(mp4|m3u8|mpd|mkv|webm|ts)(?:\?[^\s"'<>]*)?/gi;
            var matches = htmlContent.match(regex);
            
            if (matches) {
                matches.forEach(function(match) {
                    var cleanMatch = match.replace(/\\\//g, '/');// Limpiar escapes JSON
                    results.add(cleanMatch);
                });
            }

            // Enviar a Kotlin solo si encontramos NUEVOS enlaces
            if (results.size > initialSize && window.AndroidNextData) {
                window.AndroidNextData.onVideosExtracted(JSON.stringify(Array.from(results)));
            }
        } catch (e) {
            console.log("Zeus Scanner Error:", e);
        } finally {
            isScanning = false;
        }
    }

    // 1ra pasada: Escanear en cuanto termine de cargar la página
    scanForVideos();

    // 2da pasada: Observar si la página inyecta contenido nuevo dinámicamente
    var scanObserver = new MutationObserver(function() {
        // Temporizador (debounce) de 1.5s para no congelar el WebView si hay muchos cambios DOM
        clearTimeout(window._zeusScanTimer);
        window._zeusScanTimer = setTimeout(scanForVideos, 1500);
    });
    scanObserver.observe(document.body, { childList: true, subtree: true });
})();
