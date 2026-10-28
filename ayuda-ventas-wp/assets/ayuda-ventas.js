/**
 * Ayuda Ventas — navegación de las 14 pantallas (deslizar, flechas, teclado).
 * Los videos no se piden hasta que se abren. Sin service worker: un SW en
 * rogansya.com cachearía el sitio entero. "Guardar videos" usa la Cache API
 * y, al reproducir, sirve el blob guardado.
 */
(function () {
  'use strict';

  function init() {
    var app = document.getElementById('ayuda-ventas');
    var track = document.getElementById('av-track');
    if (!app || !track) return;

    var slides = [].slice.call(track.querySelectorAll('.av-slide'));
    var N = slides.length;
    var cur = 0;
    var chip = document.getElementById('av-chip');
    var pn = document.getElementById('av-pn');
    var logo = document.getElementById('av-logo');
    var prev = document.getElementById('av-prev');
    var next = document.getElementById('av-next');
    var dots = document.getElementById('av-dots');
    var toc = document.getElementById('av-toc');
    var base = app.getAttribute('data-base') || '';
    var logoDark = app.getAttribute('data-logo-dark') || '';
    var logoLight = app.getAttribute('data-logo-light') || '';
    var lastFocus = null;

    slides.forEach(function (s, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.id = 'NAV-ROGANS-AYUDAVENTAS-V1-PUNTO-' + (i + 1);
      d.setAttribute('aria-label', 'Ir a ' + (s.getAttribute('data-chip') || ('sección ' + (i + 1))));
      d.dataset.go = String(i + 1);
      dots.appendChild(d);

      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'NAV-ROGANS-AYUDAVENTAS-V1-INDICE-' + (i + 1);
      b.dataset.go = String(i + 1);
      b.dataset.closeall = '';
      b.innerHTML = '<i>' + (i + 1) + '</i>' + (s.getAttribute('data-chip') || '');
      li.appendChild(b);
      toc.appendChild(li);
    });

    function fit() {
      var sub = document.querySelector('.sub-header');
      var header = document.querySelector('.main-header');
      var taken = 0;
      if (sub) taken += sub.offsetHeight;
      if (header) taken += header.offsetHeight;
      var h = Math.max(280, window.innerHeight - taken);
      app.style.height = h + 'px';
    }

    function go(n, opts) {
      opts = opts || {};
      n = Math.max(0, Math.min(N - 1, n));
      var leaving = slides[cur];
      cur = n;
      if (opts.instant) track.classList.add('is-drag');
      track.style.transform = 'translate3d(' + (-n * 100) + '%,0,0)';
      if (opts.instant) {
        track.offsetHeight;
        track.classList.remove('is-drag');
      }
      var s = slides[n];
      if (chip) chip.textContent = s.getAttribute('data-chip') || '';
      if (pn) pn.textContent = (n + 1) + ' / ' + N;
      var progress = document.getElementById('av-progress');
      if (progress) progress.style.width = (((n + 1) / N) * 100) + '%';
      var dockLabel = document.getElementById('av-dock-label');
      if (dockLabel) dockLabel.textContent = (s.getAttribute('data-chip') || '') + ' · ' + (n + 1) + ' / ' + N;
      var dockCta = document.getElementById('CTA-ROGANS-AYUDAVENTAS-V1-BARRA-AGENDAR');
      if (dockCta) dockCta.textContent = (n === N - 1) ? (dockCta.getAttribute('data-label-last') || 'Separar mi cupo') : (dockCta.getAttribute('data-label') || 'Agendar valoración');
      var dockPrev = document.getElementById('NAV-ROGANS-AYUDAVENTAS-V1-BARRA-ANTERIOR');
      var dockNext = document.getElementById('NAV-ROGANS-AYUDAVENTAS-V1-BARRA-SIGUIENTE');
      if (dockPrev) dockPrev.disabled = n === 0;
      if (dockNext) dockNext.disabled = n === N - 1;
      var dark = s.classList.contains('av-dark');
      app.classList.toggle('is-dark', dark);
      app.classList.toggle('is-mint', s.classList.contains('av-mint'));
      app.classList.toggle('is-cover', n === 0);
      if (logo) logo.src = dark ? logoDark : logoLight;
      prev.disabled = n === 0;
      next.disabled = n === N - 1;
      [].forEach.call(dots.children, function (d, i) {
        var on = i === n;
        d.classList.toggle('is-on', on);
        if (on) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      [].forEach.call(toc.querySelectorAll('button'), function (d, i) {
        var on = i === n;
        d.classList.toggle('is-on', on);
        if (on) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      slides.forEach(function (slide, i) {
        var active = i === n;
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        if (active) slide.removeAttribute('inert');
        else slide.setAttribute('inert', '');
      });
      if (leaving !== s) s.scrollTop = 0;
      var hash = '#' + (n + 1);
      if (location.hash !== hash) history.replaceState(null, '', hash);
      if (opts.focus) {
        s.setAttribute('tabindex', '-1');
        s.focus({ preventScroll: true });
      }
    }

    function overlayOpen() {
      return !!document.querySelector('.av-ov:not([hidden])');
    }

    function show(id) {
      var o = document.getElementById(id);
      if (!o) return;
      lastFocus = document.activeElement;
      o.hidden = false;
      var btn = o.querySelector('[data-close]');
      if (btn) btn.focus();
      var opener = document.getElementById('av-menu-btn');
      if (id === 'av-menu' && opener) opener.setAttribute('aria-expanded', 'true');
    }

    function closeAll() {
      [].forEach.call(document.querySelectorAll('.av-ov'), function (o) { o.hidden = true; });
      var v = document.getElementById('av-vplayer');
      if (v && !v.paused) v.pause();
      var opener = document.getElementById('av-menu-btn');
      if (opener) opener.setAttribute('aria-expanded', 'false');
      if (lastFocus && typeof lastFocus.focus === 'function') {
        lastFocus.focus({ preventScroll: true });
        lastFocus = null;
      }
    }

    var lastDrag = 0;
    document.addEventListener('click', function (e) {
      if (Date.now() - lastDrag < 350) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var t = e.target.closest('[data-go],[data-open],[data-close],[data-video]');
      if (!t || !app.contains(t)) return;
      if (t.hasAttribute('data-video')) {
        openVideo(t.getAttribute('data-video'), t.getAttribute('data-title'));
        return;
      }
      if (t.hasAttribute('data-open')) {
        show(t.getAttribute('data-open'));
        return;
      }
      if (t.hasAttribute('data-close')) {
        closeAll();
        return;
      }
      if (t.hasAttribute('data-go')) {
        if (t.hasAttribute('data-closeall') || t.closest('.av-ov')) closeAll();
        go(parseInt(t.getAttribute('data-go'), 10) - 1, { focus: true });
      }
    }, true);

    prev.addEventListener('click', function () { go(cur - 1, { focus: true }); });
    next.addEventListener('click', function () { go(cur + 1, { focus: true }); });
    var dockPrevBtn = document.getElementById('NAV-ROGANS-AYUDAVENTAS-V1-BARRA-ANTERIOR');
    var dockNextBtn = document.getElementById('NAV-ROGANS-AYUDAVENTAS-V1-BARRA-SIGUIENTE');
    if (dockPrevBtn) dockPrevBtn.addEventListener('click', function () { go(cur - 1, { focus: true }); });
    if (dockNextBtn) dockNextBtn.addEventListener('click', function () { go(cur + 1, { focus: true }); });
    document.getElementById('av-home').addEventListener('click', function () { closeAll(); go(1, { focus: true }); });
    document.getElementById('av-menu-btn').addEventListener('click', function () { show('av-menu'); });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'VIDEO') return;
      if (e.key === 'Escape') {
        if (overlayOpen()) { e.preventDefault(); closeAll(); }
        return;
      }
      if (overlayOpen()) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1, { focus: true }); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1, { focus: true }); }
    });

    [].forEach.call(document.querySelectorAll('.av-ov'), function (o) {
      o.addEventListener('click', function (e) { if (e.target === o) closeAll(); });
    });

    var blobUrl = null;
    function openVideo(id, title) {
      var v = document.getElementById('av-vplayer');
      var titleEl = document.getElementById('av-vtitle');
      var note = document.getElementById('av-vnote');
      if (titleEl) titleEl.textContent = title || 'Video';
      if (note) note.hidden = false;
      v.poster = base + 'cover-' + id + '.webp';
      var url = base + 'video/' + id + '.mp4';
      var start = function (src) {
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
        v.src = src;
        show('av-vmodal');
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      };
      if (!('caches' in window)) { start(url); return; }
      caches.open('rogans-ayuda-ventas-videos-v1').then(function (c) {
        return c.match(url);
      }).then(function (match) {
        if (!match) { start(url); return; }
        return match.blob().then(function (blob) {
          blobUrl = URL.createObjectURL(blob);
          start(blobUrl);
        });
      }).catch(function () { start(url); });
    }

    document.getElementById('av-vplayer').addEventListener('error', function () {
      var note = document.getElementById('av-vnote');
      if (!note) return;
      note.hidden = false;
      note.innerHTML = 'No se pudo cargar el video (¿sin internet?). <a href="https://rogansya.com/cuidado-capilar/" target="_blank" rel="noopener">Ver en rogansya.com</a>';
    });

    var sx = 0, sy = 0, dx = 0, dragging = false, decided = false, moved = false, pid = null, t0 = 0;
    track.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.av-compare,video,input,a,.av-tablewrap')) return;
      sx = e.clientX; sy = e.clientY; dx = 0; dragging = true; decided = false; moved = false; pid = e.pointerId; t0 = Date.now();
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pid) return;
      var mx = e.clientX - sx, my = e.clientY - sy;
      if (!decided) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        decided = true;
        if (Math.abs(my) > Math.abs(mx)) { dragging = false; return; }
        track.classList.add('is-drag');
      }
      dx = mx; moved = true;
      var edge = (cur === 0 && dx > 0) || (cur === N - 1 && dx < 0) ? 0.3 : 1;
      track.style.transform = 'translate3d(calc(' + (-cur * 100) + '% + ' + (dx * edge) + 'px),0,0)';
    });
    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pid)) return;
      dragging = false;
      track.classList.remove('is-drag');
      if (!moved) return;
      var v = Math.abs(dx) / Math.max(1, Date.now() - t0);
      if (dx < -60 || (dx < -20 && v > 0.5)) go(cur + 1);
      else if (dx > 60 || (dx > 20 && v > 0.5)) go(cur - 1);
      else go(cur);
      lastDrag = Date.now();
      moved = false;
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', function (e) {
      if (dragging && e.pointerId === pid) {
        if (moved) endDrag(e);
        else dragging = false;
      }
    });

    var cmp = document.getElementById('av-cmp');
    if (cmp) {
      var before = cmp.querySelector('.av-cmp-before');
      var handle = cmp.querySelector('.av-cmp-handle');
      var active = false;
      function setPos(clientX) {
        var r = cmp.getBoundingClientRect();
        var p = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100;
        before.style.clipPath = 'inset(0 ' + (100 - p) + '% 0 0)';
        handle.style.left = p + '%';
        cmp.setAttribute('aria-valuenow', String(Math.round(p)));
      }
      cmp.addEventListener('pointerdown', function (e) {
        active = true;
        cmp.setPointerCapture(e.pointerId);
        setPos(e.clientX);
        e.stopPropagation();
      });
      cmp.addEventListener('pointermove', function (e) { if (active) setPos(e.clientX); });
      cmp.addEventListener('pointerup', function () { active = false; });
      cmp.addEventListener('pointercancel', function () { active = false; });
      cmp.addEventListener('keydown', function (e) {
        var now = parseFloat(cmp.getAttribute('aria-valuenow') || '50');
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setPos(cmp.getBoundingClientRect().left + ((now - 5) / 100) * cmp.getBoundingClientRect().width); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setPos(cmp.getBoundingClientRect().left + ((now + 5) / 100) * cmp.getBoundingClientRect().width); }
      });
    }

    var btnCache = document.getElementById('CTA-ROGANS-AYUDAVENTAS-V1-GUARDAR-VIDEOS');
    var cacheMsg = document.getElementById('av-cache-msg');
    var VIDS = ['pirry', 'mauricio-cujar', 'santiago-giraldo', 'edduin-leon', 'faber-ramirez', 'carlos-morales', 'henry-sanchez'];
    if (btnCache) {
      btnCache.addEventListener('click', function () {
        if (!('caches' in window)) { cacheMsg.textContent = 'Este navegador no permite guardar videos.'; return; }
        var done = 0;
        cacheMsg.textContent = 'Guardando 0 / ' + VIDS.length + '…';
        caches.open('rogans-ayuda-ventas-videos-v1').then(function (c) {
          return VIDS.reduce(function (p, id) {
            return p.then(function () {
              return c.add(base + 'video/' + id + '.mp4').then(function () {
                done += 1;
                cacheMsg.textContent = 'Guardando ' + done + ' / ' + VIDS.length + '…';
              });
            });
          }, Promise.resolve());
        }).then(function () {
          cacheMsg.textContent = 'Listo: los videos funcionan sin internet.';
        }).catch(function () {
          cacheMsg.textContent = 'No se pudieron guardar todos los videos. Intenta con internet.';
        });
      });
    }

    function fromHash(focus) {
      var n = parseInt((location.hash || '').replace('#', ''), 10);
      if (!(n >= 1 && n <= N)) n = 1;
      go(n - 1, { instant: !focus, focus: !!focus });
    }
    var lines = app.querySelector('[data-av-lines]');
    if (lines) {
      lines.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-av-line]');
        if (!btn || !lines.contains(btn)) return;
        var id = btn.getAttribute('data-av-line');
        [].forEach.call(lines.querySelectorAll('[data-av-line]'), function (b) {
          var on = b === btn;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        [].forEach.call(lines.querySelectorAll('[data-av-panel]'), function (p) {
          p.hidden = p.getAttribute('data-av-panel') !== id;
        });
      });
    }

    fit();
    fromHash(false);
    window.addEventListener('hashchange', function () { fromHash(false); });
    window.addEventListener('resize', function () { fit(); go(cur, { instant: true }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
