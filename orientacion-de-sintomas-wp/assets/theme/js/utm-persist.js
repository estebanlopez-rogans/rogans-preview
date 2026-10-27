/**
 * Persiste UTM / click IDs en navegación interna.
 * - Si la URL trae params de atribución → guarda (last-touch).
 * - Si no → reinyecta lo guardado en links same-origin.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'rogans_utm';
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

  function isAttrKey(key) {
    if (!key) return false;
    return (
      key.indexOf('utm_') === 0 ||
      key.indexOf('hsa_') === 0 ||
      key.indexOf('ctf_') === 0 ||
      key === 'gclid' ||
      key === 'fbclid' ||
      key === 'ttclid' ||
      key === 'gad_source'
    );
  }

  // Claves que SÍ se re-inyectan en los enlaces internos: solo las campañas
  // (utm_*, hsa_*, ctf_*). Los click IDs (gclid, gad_source, fbclid, ttclid) se
  // guardan en la cookie para la atribución del backend, pero NO deben ensuciar
  // los enlaces del menú/botones/tests: son de la URL de aterrizaje del anuncio.
  function isDecorateKey(key) {
    if (!key) return false;
    return (
      key.indexOf('utm_') === 0 ||
      key.indexOf('hsa_') === 0 ||
      key.indexOf('ctf_') === 0
    );
  }

  function paramsFromSearch(search) {
    var out = {};
    if (!search) return out;
    try {
      var params = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
      params.forEach(function (value, key) {
        if (value && isAttrKey(key)) {
          out[key] = value;
        }
      });
    } catch (e) {}
    return out;
  }

  function hasKeys(obj) {
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
    }
    return false;
  }

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function writeCookie(name, value) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      '; Path=/; Max-Age=' +
      COOKIE_MAX_AGE +
      '; SameSite=Lax' +
      secure;
  }

  function saveUtms(obj) {
    if (!hasKeys(obj)) return;
    var json = JSON.stringify(obj);
    try {
      sessionStorage.setItem(STORAGE_KEY, json);
    } catch (e) {}
    try {
      writeCookie(STORAGE_KEY, json);
    } catch (e) {}
  }

  function parseStored(raw) {
    if (!raw) return {};
    try {
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return {};
      var clean = {};
      for (var key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (!isAttrKey(key)) continue;
        var val = obj[key];
        if (val === null || val === undefined || val === '') continue;
        clean[key] = String(val);
      }
      return clean;
    } catch (e) {
      return {};
    }
  }

  function getStoredUtms() {
    var fromUrl = paramsFromSearch(window.location.search || '');
    if (hasKeys(fromUrl)) {
      saveUtms(fromUrl);
      return fromUrl;
    }
    // Para DECORAR enlaces solo se usa la sesión actual (sessionStorage): así la
    // atribución viaja mientras dura la visita que llegó desde el anuncio. NO se
    // usa la cookie de 30 días: si el usuario entra orgánico o vuelve días
    // después (otra sesión), los enlaces NO deben llevar los UTM viejos del
    // anuncio. La cookie sigue existiendo solo para la atribución del backend.
    try {
      var fromSession = parseStored(sessionStorage.getItem(STORAGE_KEY));
      if (hasKeys(fromSession)) return fromSession;
    } catch (e) {}
    return {};
  }

  function shouldSkipHref(href) {
    if (!href) return true;
    var lower = href.trim().toLowerCase();
    // Anclas de la misma pagina (#algo): no se tocan. Antes solo se descartaba
    // el '#' pelado, asi que un "#planes" pasaba de largo y terminaba reescrito
    // como "/?utm_source=...#planes": el boton dejaba la landing y mandaba a la
    // home. Ponerles UTM ademas no aporta nada, porque no hay navegacion que
    // rastrear.
    if (lower.charAt(0) === '#') return true;
    if (lower.indexOf('javascript:') === 0) return true;
    if (lower.indexOf('mailto:') === 0 || lower.indexOf('tel:') === 0) return true;
    if (lower.indexOf('wp-admin') !== -1 || lower.indexOf('wp-login') !== -1) return true;
    return false;
  }

  function decorateLink(a, utms) {
    if (!a || !a.getAttribute) return;
    if (a.getAttribute('data-rogans-utm') === '1') return;
    var href = a.getAttribute('href');
    if (shouldSkipHref(href)) return;

    var url;
    try {
      // La base es la pagina actual, no la raiz del sitio: asi un enlace
      // relativo se resuelve como lo hace el navegador.
      url = new URL(href, window.location.href);
    } catch (e) {
      return;
    }

    if (url.origin !== window.location.origin) return;
    if (url.pathname.indexOf('/wp-admin') === 0 || url.pathname.indexOf('/wp-login') === 0) return;

    var changed = false;
    for (var key in utms) {
      if (!Object.prototype.hasOwnProperty.call(utms, key)) continue;
      if (!isDecorateKey(key)) continue; // nunca gclid/gad_source/fbclid/ttclid en enlaces
      if (url.searchParams.has(key)) continue;
      url.searchParams.set(key, utms[key]);
      changed = true;
    }
    if (!changed) {
      a.setAttribute('data-rogans-utm', '1');
      return;
    }
    a.setAttribute('href', url.pathname + url.search + url.hash);
    a.setAttribute('data-rogans-utm', '1');
  }

  function decorateAll(root) {
    var utms = getStoredUtms();
    if (!hasKeys(utms)) return;
    var scope = root && root.querySelectorAll ? root : document;
    var links = scope.querySelectorAll ? scope.querySelectorAll('a[href]') : [];
    if (root && root.tagName === 'A') {
      decorateLink(root, utms);
    }
    for (var i = 0; i < links.length; i++) {
      decorateLink(links[i], utms);
    }
  }

  function onClickCapture(e) {
    var t = e.target;
    if (!t) return;
    var a = t.closest ? t.closest('a[href]') : null;
    if (!a) return;
    var utms = getStoredUtms();
    if (!hasKeys(utms)) return;
    decorateLink(a, utms);
  }

  // Last-touch al cargar si la URL trae params.
  getStoredUtms();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      decorateAll(document);
    });
  } else {
    decorateAll(document);
  }

  document.addEventListener('click', onClickCapture, true);

  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(function (mutations) {
      var utms = getStoredUtms();
      if (!hasKeys(utms)) return;
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === 'A') {
            decorateLink(node, utms);
          } else if (node.querySelectorAll) {
            decorateAll(node);
          }
        }
      }
    });
    function startObserver() {
      if (!document.body) return;
      obs.observe(document.body, { childList: true, subtree: true });
    }
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startObserver);
    }
  }
})();
