/**
 * Orientación de síntomas — chat Perplexity-like (v3).
 * Determinista, sin LLM. Historia clínica se recolecta para Clinova pero NO se muestra al paciente.
 */
(function () {
  'use strict';
  var D = window.ROGANS_OS_DATOS || {};
  var C = window.ROGANS_OS_CFG || {};
  var root = document.getElementById('os-app');
  if (!root || !D.categorias) return;

  var RANK = { baja: 0, media: 1, prioritaria: 2 };
  var T = D.chat || {};
  var MAX_FILE = 5 * 1024 * 1024; // 5 MB
  var OK_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'application/pdf': 1 };

  var S, msgs, inputMode, busy, focusHtml, currentQ;

  function uid() {
    return 'os-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function catById(id) {
    for (var i = 0; i < D.categorias.length; i++) if (D.categorias[i].id === id) return D.categorias[i];
    return null;
  }
  function citasCfg() {
    return (window.ROGANS_CITAS_CFG && window.ROGANS_CITAS_CFG.especialidades) || {};
  }
  function track(paso) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'os_paso', os_paso: paso });
    } catch (e) {}
  }
  function seguridadIds() {
    var out = S.antecedentes.filter(function (x) { return x !== 'ninguna'; });
    if (S.gineco.indexOf('embarazo') !== -1 || S.gineco.indexOf('lactancia') !== -1) {
      if (out.indexOf('embarazo') === -1) out.push('embarazo');
    }
    return out;
  }
  function evaluar() {
    var cat = S.cat;
    var nivel = cat.nivel, esp = cat.especialidad, espN = -1, causas = [];
    cat.preguntas.forEach(function (p) {
      var sel = [].concat(S.resp[p.id] || []);
      p.opciones.forEach(function (o) {
        if (sel.indexOf(o.v) === -1) return;
        (o.causas || []).forEach(function (k) { if (causas.indexOf(k) === -1) causas.push(k); });
        if (o.nivel && RANK[o.nivel] > RANK[nivel]) nivel = o.nivel;
        var n = o.nivel ? RANK[o.nivel] : 0;
        if (o.especialidad && n >= espN) { esp = o.especialidad; espN = n; }
        else if (!o.especialidad && n === 2 && n > espN) { esp = cat.especialidad; espN = n; }
      });
    });
    var seg = seguridadIds();
    var embarazo = seg.indexOf('embarazo') !== -1;
    var otc = [];
    if (nivel !== 'prioritaria' && !embarazo) {
      Object.keys(cat.otc || {}).forEach(function (k) {
        var prod = D.otc[k];
        if (!prod) return;
        var aplica = cat.otc[k].some(function (c) { return causas.indexOf(c) !== -1; });
        var excluido = (prod.excluir_si || []).some(function (x) { return seg.indexOf(x) !== -1; });
        if (aplica && !excluido) otc.push(prod);
      });
    }
    var examenes = [];
    var exMap = cat.examenes || {};
    causas.forEach(function (k) {
      (exMap[k] || []).forEach(function (e) { if (examenes.indexOf(e) === -1) examenes.push(e); });
    });
    // Con fórmula médica: solo nombre + uso (sin dosis); el CTA es la consulta.
    // En embarazo/lactancia no se listan (muchos están contraindicados).
    var rx = [];
    if (!embarazo) {
      Object.keys(cat.rx || {}).forEach(function (k) {
        var prod = (D.rx || {})[k];
        if (!prod) return;
        if (cat.rx[k].some(function (c) { return causas.indexOf(c) !== -1; })) rx.push(prod);
      });
    }
    return { nivel: nivel, esp: esp, causas: causas, otc: otc, rx: rx, embarazo: embarazo, examenes: examenes };
  }
  function espInfo(key) {
    var e = D.especialidades[key] || D.especialidades.general;
    var cfg = e.especialidad ? citasCfg()[e.especialidad] : null;
    return {
      key: key,
      nombre: e.nombre,
      especialidad: e.especialidad,
      url: e.url,
      modalidades: (cfg && cfg.modalidades) || e.modalidades || ['presencial'],
      precios: (cfg && cfg.precios) || {}
    };
  }
  function farmaciaUrl(term, content) {
    var f = D.farmacia || {};
    var base = (f.url || 'https://farminova24.com').replace(/\/+$/, '');
    var utm = f.utm || 'utm_source=rogansya&utm_medium=orientacion&utm_campaign=sintomas';
    if (content) utm += '&utm_content=' + encodeURIComponent(content);
    if (f.buscar && term) return base + f.buscar + encodeURIComponent(term) + '&' + utm;
    return base + '/?' + utm;
  }
  // v9 — enlace general de exámenes (ROGANS_OS_FARMACIA_EXAMENES_URL o home de la farmacia).
  function farmaciaExamenesUrl() {
    var f = D.farmacia || {};
    var utm = (f.utm || 'utm_source=rogansya&utm_medium=orientacion&utm_campaign=sintomas') + '&utm_content=examenes';
    if (f.examenes) return f.examenes + (f.examenes.indexOf('?') >= 0 ? '&' : '?') + utm;
    return farmaciaUrl('', 'examenes');
  }
  // v9 — término de búsqueda para un examen; null = no enlazable (valoraciones, «según…»).
  function examenBusqueda(name) {
    var n = normTxt(name);
    var map = D.examenesBusqueda || [];
    for (var i = 0; i < map.length; i++) {
      if (n.indexOf(normTxt(map[i][0])) === 0) return map[i][1];
    }
    return null;
  }
  // «PCR o VSG si el médico lo considera» → nombre «PCR o VSG», detalle «si el médico lo considera».
  function examenPartes(name) {
    var m = String(name).match(/^(.*?)\s+((?:si|solo si)\s.*)$/i);
    return m ? { nombre: m[1], det: m[2] } : { nombre: String(name), det: '' };
  }
  function cardCtaHtml(src, label) {
    var pr = precioPromo();
    return '<div class="os-card-cta-wrap"><button type="button" class="os-card-cta" data-os="agendar" data-src="' + esc(src) + '">' +
      '<i data-lucide="calendar-check" class="os-cta-ico" aria-hidden="true"></i><span>' + esc(label) + '</span></button>' +
      '<p class="os-card-cta-sub">Consulta de seguimiento a <strong>' + esc(pr.promoCop) + '</strong> con código ' + esc(pr.code) + ' · el médico recibe tus respuestas.</p></div>';
  }
  function farmaciaNombre() {
    return (D.farmacia && D.farmacia.nombre) || 'la farmacia';
  }
  function fmtCop(n) {
    return '$' + Number(n).toLocaleString('es-CO') + ' COP';
  }
  function fmtUsd(n) {
    var x = Number(n);
    var opts = (Math.abs(x - Math.round(x)) < 0.001)
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return 'USD ' + x.toLocaleString('es-CO', opts);
  }
  function precioParts(cop, usd) {
    var parts = [];
    if (cop != null) parts.push(fmtCop(cop));
    if (usd != null) parts.push(fmtUsd(usd));
    return parts.join(' · ');
  }
  function precioHtml() {
    var p = C.precio || D.precio || {};
    if (p.cop == null && p.usd == null) {
      return '<p class="os-precio">Consulta de seguimiento: <em>Precio por confirmar</em> (COP / USD)</p>';
    }
    var pct = p.cupon_pct != null ? Number(p.cupon_pct) : 50;
    var copPromo = p.cop_promo != null ? p.cop_promo : (p.cop != null ? Math.round(Number(p.cop) * (100 - pct) / 100) : null);
    var usdPromo = p.usd_promo != null ? p.usd_promo : (p.usd != null ? Math.round(Number(p.usd) * (100 - pct)) / 100 : null);
    var regular = precioParts(p.cop, p.usd);
    var promo = precioParts(copPromo, usdPromo);
    return '<p class="os-precio">Consulta de seguimiento: <s class="os-precio-old">' + esc(regular) + '</s> <span class="os-precio-promo">' + esc(promo) + '</span> con código <strong>' + esc(p.cupon || C.cupon || '50%') + '</strong></p>';
  }
  function promoHint() {
    var code = C.cupon || (C.precio && C.precio.cupon) || '50%';
    return '<p class="os-legal-sm">Promo: usa el código <strong>' + esc(code) + '</strong> en el checkout y paga la mitad.</p>';
  }

  function reset() {
    S = {
      id: uid(), fase: 'inicio', history: [],
      edad: '', pais: '', sexo: '', relato: '',
      alarmas: [], qi: 0, resp: {},
      antecedentes: [], quirurgicos: '', toxicos: [], gineco: [], familiares: '',
      alergias: '', medicamentos: '',
      tratamientos: '', tratResultado: '', tratDetalle: '',
      adjuntos: [], consAdjuntos: false,
      entiende: true, // soft disclaimer only; no blocking step
      cat: null, modalidad: '', compartir: true, consDatos: false, consTele: false,
      enviado: false
    };
    msgs = [];
    inputMode = null;
    busy = false;
    focusHtml = '';
    setResultMode(false);
  }

  function setResultMode(on) {
    var shell = document.getElementById('os-shell');
    if (!shell) return;
    if (on) shell.classList.add('is-result');
    else {
      shell.classList.remove('is-result');
      removeSticky();
    }
  }

  // Barra fija inferior (solo móvil, vía CSS) con el CTA de agendar en el resultado.
  function removeSticky() {
    var s = document.getElementById('os-sticky-book');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    document.body.classList.remove('os-has-sticky');
  }
  function mountSticky() {
    removeSticky();
    var pr = precioPromo();
    var el = document.createElement('div');
    el.id = 'os-sticky-book';
    el.className = 'os-sticky-book';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Agendar consulta de seguimiento');
    el.innerHTML = '<div class="os-sticky-price"><s>' + esc(pr.regularCop) + '</s> <strong>' + esc(pr.promoCop) + '</strong>' +
      '<span class="os-sticky-code">código ' + esc(pr.code) + '</span></div>' +
      '<button type="button" class="os-sticky-cta" data-os="agendar" data-src="sticky" id="OS_CTA_AGENDAR_STICKY">Agendar consulta de seguimiento</button>';
    root.appendChild(el);
    document.body.classList.add('os-has-sticky');
  }

  function refreshIcons() {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
      }
    } catch (e) {}
  }

  function shellHtml() {
    return '<div class="os-chat-shell" id="os-shell">' +
      '<div class="os-progress" aria-hidden="true"><span id="os-prog" style="width:4%"></span></div>' +
      '<div class="os-stage">' +
        '<div class="os-scroll" id="os-scroll">' +
          '<p class="os-hist-hint" id="os-hist-hint">↑ Ver respuestas anteriores</p>' +
          '<div class="os-history" id="os-history" role="log" aria-relevant="additions"></div>' +
          '<div class="os-focus" id="os-focus"><p class="os-focus-q" id="os-focus-q">…</p><p class="os-focus-sub" id="os-focus-sub" hidden></p></div>' +
          '<div class="os-options" id="os-options"></div>' +
          '<div class="os-spacer" id="os-spacer" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="os-composer" id="os-composer"></div>' +
      '</div>' +
      '</div>';
  }

  function scrollToCurrentQuestion() {
    var sc = document.getElementById('os-scroll');
    var focus = document.getElementById('os-focus');
    var spacer = document.getElementById('os-spacer');
    var shell = document.getElementById('os-shell');
    if (!sc || !focus) return;
    // Result mode: no Perplexity spacer — content must stay fully visible.
    if (shell && shell.classList.contains('is-result')) {
      if (spacer) spacer.style.height = '0px';
      return;
    }
    // Spacer pins focus to top. When options sit under the question, cap the
    // spacer so tablet/iPad don't show a tall empty band above the footer.
    if (spacer) {
      var optsEl = document.getElementById('os-options');
      var optsH = (optsEl && optsEl.innerHTML && optsEl.offsetHeight) ? optsEl.offsetHeight : 0;
      var need = Math.max(0, sc.clientHeight - focus.offsetHeight - optsH - 24);
      if (optsH > 0) need = Math.min(need, 48);
      spacer.style.height = need + 'px';
    }
    // Measure relative to scrollport (offsetTop is unreliable with nested wrappers).
    var scRect = sc.getBoundingClientRect();
    var foRect = focus.getBoundingClientRect();
    var top = sc.scrollTop + (foRect.top - scRect.top) - 8;
    if (top < 0) top = 0;
    sc.scrollTop = top;
  }

  function progressPct() {
    var order = ['inicio','pais','sexo','motivo','categoria','alarmas','tratamientos','trat_resultado','trat_detalle','pregunta','antecedentes','quirurgicos','toxicos','alergias','medicamentos','gineco','familiares','evidencia','resultado','agendar'];
    var i = order.indexOf(S.fase);
    if (i < 0) i = 0;
    return Math.min(96, Math.round(((i + 1) / order.length) * 100));
  }

  function renderChrome() {
    var prog = document.getElementById('os-prog');
    if (prog) prog.style.width = progressPct() + '%';
  }

  function paintMessages() {
    var hist = document.getElementById('os-history');
    var hint = document.getElementById('os-hist-hint');
    var fq = document.getElementById('os-focus-q');
    var fs = document.getElementById('os-focus-sub');
    if (!hist) return;

    // Last bot message becomes focus; earlier go to history (above, out of view until scroll up)
    var focusIdx = -1;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'bot' && !msgs[i].typing) { focusIdx = i; break; }
    }
    var html = '';
    var histCount = 0;
    msgs.forEach(function (m, idx) {
      if (idx === focusIdx && !m.typing) return; // shown in focus
      if (m.typing) {
        html += '<div class="os-row"><div class="os-avatar" aria-hidden="true">R</div><div class="os-bubble os-bubble-bot os-typing"><span></span><span></span><span></span></div></div>';
        return;
      }
      histCount++;
      if (m.role === 'user') {
        html += '<div class="os-row os-row-user"><div class="os-bubble os-bubble-user">' + m.html + '</div></div>';
      } else {
        html += '<div class="os-row"><div class="os-avatar" aria-hidden="true">R</div><div class="os-bubble os-bubble-bot">' + m.html + '</div></div>';
      }
    });
    hist.innerHTML = html;
    if (hint) {
      if (histCount > 0) hint.classList.add('is-on');
      else hint.classList.remove('is-on');
    }

    if (fq) {
      if (currentQ) {
        fq.innerHTML = esc(stripTags(currentQ));
      } else if (focusIdx >= 0) {
        var plain = msgs[focusIdx].plain || stripTags(msgs[focusIdx].html);
        fq.innerHTML = msgs[focusIdx].focusHtml || esc(plain);
      } else {
        fq.textContent = '…';
      }
    }
    if (fs) {
      if (focusHtml) { fs.hidden = false; fs.innerHTML = focusHtml; }
      else { fs.hidden = true; fs.innerHTML = ''; }
    }

    // After layout, pin current question to top of the box
    requestAnimationFrame(function () { scrollToCurrentQuestion(); });
  }

  function stripTags(h) {
    var d = document.createElement('div');
    d.innerHTML = h;
    return (d.textContent || '').trim();
  }

  function paintComposer() {
    var el = document.getElementById('os-composer');
    var opts = document.getElementById('os-options');
    if (!el) return;
    if (!inputMode) {
      el.innerHTML = '';
      if (opts) opts.innerHTML = '';
      return;
    }
    var m = inputMode;
    var foot = '<div class="os-composer-inner">';
    if (S.history.length) {
      foot += '<button type="button" class="os-back" data-os="atras">← Atrás</button>';
    }
    var optionsHtml = '';

    if (m.tipo === 'chips' || m.tipo === 'confirm') {
      // Few chips → keep in sticky footer for one-tap; many → scrollable options
      var n = (m.opciones || []).length;
      var chips = '<div class="os-chips' + (n > 4 ? ' os-chips-stack' : '') + '" role="group">';
      (m.opciones || []).forEach(function (o) {
        chips += '<button type="button" class="os-chip' + (o.primary ? ' os-chip-primary' : '') + (o.sugerido ? ' is-sugerido' : '') + '" data-os="chip" data-v="' + esc(o.v) + '">' + esc(o.t) +
          (o.sugerido ? ' <span class="os-tag-sug">Sugerido</span>' : '') + '</button>';
      });
      chips += '</div>';
      if (n > 4) {
        optionsHtml = chips;
      } else {
        foot += chips;
      }
    } else if (m.tipo === 'chips_multi') {
      // Long lists (alarmas) scroll above; exclusiva + Continuar sticky in footer
      var scrollOps = [];
      var exclOps = [];
      (m.opciones || []).forEach(function (o) {
        if (o.exclusiva) exclOps.push(o);
        else scrollOps.push(o);
      });
      optionsHtml = '<div class="os-chips os-chips-stack" role="group">';
      scrollOps.forEach(function (o) {
        var on = (m.selected || []).indexOf(o.v) !== -1;
        optionsHtml += '<button type="button" class="os-chip' + (on ? ' is-on' : '') + '" data-os="chip" data-v="' + esc(o.v) + '" data-excl="0">' + esc(o.t) + '</button>';
      });
      optionsHtml += '</div>';
      foot += '<div class="os-composer-actions">';
      exclOps.forEach(function (o) {
        var on = (m.selected || []).indexOf(o.v) !== -1;
        foot += '<button type="button" class="os-chip' + (on ? ' is-on' : '') + '" data-os="chip" data-v="' + esc(o.v) + '" data-excl="1">' + esc(o.t) + '</button>';
      });
      foot += '<button type="button" class="os-chip os-chip-primary" data-os="multi-ok"' + ((m.selected || []).length ? '' : ' disabled') + '>Continuar</button></div>';
    } else if (m.tipo === 'text' || m.tipo === 'text_optional') {
      foot += '<form data-os="text-form" class="os-text-form">' +
        '<label class="sr-only" for="os-text">Tu respuesta</label>' +
        '<textarea id="os-text" class="os-text" rows="2" maxlength="' + (m.max || 500) + '" placeholder="' + esc(m.placeholder || '') + '">' + esc(m.value || '') + '</textarea>' +
        '<button type="submit" class="os-chip os-chip-primary os-send">' + (m.tipo === 'text_optional' ? 'Continuar' : 'Enviar') + '</button></form>';
    } else if (m.tipo === 'upload') {
      // Adjuntos 100% opcionales: el consentimiento solo aparece (y solo es
      // obligatorio) si el paciente eligió archivos.
      var hasFiles = S.adjuntos.length > 0;
      optionsHtml = '<div class="os-upload">' +
        '<p class="os-upload-opt"><span class="os-tag-opt">Opcional</span> Puedes continuar sin adjuntar nada.</p>' +
        '<label class="os-file-btn" for="os-files">' +
        '<span class="os-file-btn-icon" aria-hidden="true">📎</span>' +
        '<span class="os-file-btn-text">' + (hasFiles ? 'Agregar más fotos o exámenes' : 'Subir fotos o exámenes') + '</span></label>' +
        '<input type="file" id="os-files" class="os-file-input" multiple accept="image/jpeg,image/png,image/webp,application/pdf">' +
        '<p class="os-legal-sm mt-2">JPG, PNG, WebP o PDF · máx. 5 MB c/u · no se guardan en el sitio; solo se envían si agendas.</p>' +
        '<div class="os-previews" id="os-previews"></div>' +
        (hasFiles ? '<label class="os-check' + (S.consAdjuntos ? ' is-on' : '') + '"><input type="checkbox" data-os="cons-adj"' + (S.consAdjuntos ? ' checked' : '') + '><span>Autorizo el tratamiento de estas fotos/exámenes (datos sensibles de salud) solo para mi consulta de seguimiento. <small class="text-error-600">*</small></span></label>' : '') +
        '</div>';
      foot += '<div class="os-composer-actions os-upload-actions">' +
        '<button type="button" class="os-chip os-chip-primary os-skip-upload" data-os="skip-upload">' + esc(T.evidencia_skip || 'Continuar sin adjuntos') + '</button>' +
        (hasFiles ? '<button type="button" class="os-chip os-chip-primary" data-os="ok-upload"' + (S.consAdjuntos ? '' : ' disabled') + '>Adjuntar y continuar</button>' : '') +
        '</div>';
    } else if (m.tipo === 'result_actions' || m.tipo === 'agendar_ui') {
      // Results can be long — put body in scroll, keep actions in footer when possible
      optionsHtml = m.html || '';
    }
    foot += '</div>';

    if (opts) opts.innerHTML = optionsHtml;
    el.innerHTML = foot;

    if (m.tipo === 'text' || m.tipo === 'text_optional') {
      var ta = el.querySelector('#os-text');
      if (ta) { try { ta.focus(); } catch (e) {} }
    }
    if (m.tipo === 'upload') {
      renderPreviews();
      var fi = document.querySelector('#os-files');
      if (fi) fi.addEventListener('change', onFilesPicked);
    }
    if (m.tipo === 'result_actions' || m.tipo === 'agendar_ui') {
      refreshIcons();
    }
    requestAnimationFrame(function () { scrollToCurrentQuestion(); });
  }

  function say(html, opts) {
    opts = opts || {};
    var plain = opts.plain || stripTags(html);
    if (!opts.keepQ) currentQ = plain;
    msgs.push({ role: 'bot', html: html, plain: plain, focusHtml: opts.focusHtml || null });
    paintMessages();
    renderChrome();
  }
  function sayUser(text) {
    msgs.push({ role: 'user', html: esc(text) });
    paintMessages();
  }
  function typing(on) {
    if (on) {
      msgs.push({ role: 'bot', typing: true });
    } else {
      msgs = msgs.filter(function (m) { return !m.typing; });
    }
    paintMessages();
  }
  function clearComposer() {
    inputMode = null;
    paintComposer();
  }
  function botThen(html, cb, opts) {
    busy = true;
    clearComposer();
    typing(true);
    setTimeout(function () {
      typing(false);
      say(html, opts);
      busy = false;
      if (cb) cb();
    }, 280);
  }
  function ask(mode) {
    inputMode = mode;
    if (mode && mode.q) currentQ = mode.q;
    paintComposer();
    paintMessages();
  }
  function pushHist() {
    S.history.push({
      fase: S.fase, edad: S.edad, pais: S.pais, sexo: S.sexo, relato: S.relato,
      alarmas: S.alarmas.slice(), qi: S.qi, resp: JSON.parse(JSON.stringify(S.resp)),
      antecedentes: S.antecedentes.slice(), quirurgicos: S.quirurgicos,
      toxicos: S.toxicos.slice(), gineco: S.gineco.slice(), familiares: S.familiares,
      alergias: S.alergias, medicamentos: S.medicamentos,
      tratamientos: S.tratamientos, tratResultado: S.tratResultado, tratDetalle: S.tratDetalle,
      catId: S.cat ? S.cat.id : null
    });
  }

  // ---------- Flow ----------
  function start() {
    root.innerHTML = shellHtml();
    track('inicio');
    S.fase = 'inicio';
    focusHtml = '';
    currentQ = '';
    botThen('<p class="m-0">' + esc(T.bienvenida || '') + '</p>', function () {
      say(esc(T.edad || '¿Tienes 18 años o más?'), { plain: T.edad });
      ask({
        tipo: 'confirm',
        opciones: [
          { v: 'adulto', t: 'Sí, 18 o más', primary: true },
          { v: 'menor', t: 'Menor de 18' }
        ]
      });
    }, { plain: T.bienvenida });
  }

  function afterEdad(v) {
    pushHist();
    sayUser(v === 'adulto' ? 'Sí, 18 o más' : 'Menor de 18');
    if (v === 'menor') {
      S.fase = 'bloqueado';
      botThen('<p class="m-0 os-alerta">Esta orientación es solo para mayores de 18 años. Consulta a un pediatra o médico.</p>', function () {
        ask({ tipo: 'chips', opciones: [{ v: 'reiniciar', t: 'Empezar de nuevo' }] });
      });
      return;
    }
    S.edad = 'adulto';
    askPais();
  }

  function askPais() {
    S.fase = 'pais';
    track('pais');
    botThen(esc(T.pais || '¿En qué país estás?'), function () {
      ask({
        tipo: 'chips',
        opciones: (D.paises || []).map(function (o) { return { v: o.v, t: o.t }; })
      });
    });
  }

  function afterPais(v) {
    pushHist();
    var lab = ((D.paises || []).filter(function (p) { return p.v === v; })[0] || {}).t || v;
    sayUser(lab);
    S.pais = v;
    askSexo();
  }

  function askSexo() {
    S.fase = 'sexo';
    track('sexo');
    botThen(esc(T.sexo || ''), function () {
      ask({ tipo: 'chips', opciones: (D.sexo || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    });
  }

  function afterSexo(v) {
    pushHist();
    var lab = ((D.sexo || []).filter(function (o) { return o.v === v; })[0] || {}).t || v;
    sayUser(lab);
    S.sexo = v;
    askMotivo();
  }

  function askMotivo() {
    S.fase = 'motivo';
    track('motivo');
    focusHtml = esc(T.motivo_hint || '');
    botThen(esc(T.motivo || ''), function () {
      ask({ tipo: 'text', max: 1000, placeholder: 'Escribe qué te pasa…' });
    });
  }

  function afterMotivo(text) {
    pushHist();
    sayUser(text);
    S.relato = text;
    focusHtml = '';
    askCategoria();
  }

  function normTxt(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  // Área más probable según las palabras del relato (o '' si nada coincide).
  function sugerirCategoria(texto) {
    var txt = ' ' + normTxt(texto).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
    var best = '', bestN = 0;
    D.categorias.forEach(function (c) {
      var n = 0;
      (c.palabras || []).forEach(function (w) {
        if (txt.indexOf(' ' + normTxt(w)) !== -1) n++;
      });
      if (n > bestN) { best = c.id; bestN = n; }
    });
    return best;
  }
  function categoriaOpciones() {
    var sug = sugerirCategoria(S.relato);
    var list = D.categorias.slice();
    if (sug) {
      var i = -1;
      list.forEach(function (c, j) { if (c.id === sug) i = j; });
      if (i > 0) list.unshift(list.splice(i, 1)[0]);
      // Medicina general sigue de segunda (si no es la sugerida).
      if (sug !== 'medicina_general') {
        var k = -1;
        list.forEach(function (c, j) { if (c.id === 'medicina_general') k = j; });
        if (k > 1) list.splice(1, 0, list.splice(k, 1)[0]);
      }
    }
    return list.map(function (c) { return { v: c.id, t: c.titulo, sugerido: c.id === sug }; });
  }

  function askCategoria() {
    S.fase = 'categoria';
    track('categoria');
    botThen(esc(T.categoria || ''), function () {
      ask({ tipo: 'chips', q: T.categoria || '', opciones: categoriaOpciones() });
    });
  }

  function afterCategoria(id) {
    pushHist();
    var c = catById(id);
    if (!c) return;
    sayUser(c.titulo);
    S.cat = c;
    askAlarmas();
  }

  function askAlarmas() {
    S.fase = 'alarmas';
    track('alarmas');
    botThen(esc(T.alarmas || ''), function () {
      var ops = (D.alarmas || []).map(function (a) { return { v: a.id, t: a.texto }; });
      ops.push({ v: 'ninguna', t: 'Ninguna de estas', exclusiva: true });
      ask({ tipo: 'chips_multi', q: T.alarmas || '', selected: [], opciones: ops });
    });
  }

  function afterAlarmas(sel) {
    pushHist();
    sayUser(sel.map(function (id) {
      if (id === 'ninguna') return 'Ninguna de estas';
      var a = (D.alarmas || []).filter(function (x) { return x.id === id; })[0];
      return a ? a.texto : id;
    }).join(', '));
    S.alarmas = sel.filter(function (x) { return x !== 'ninguna'; });
    if (S.alarmas.length) {
      S.fase = 'urgencia';
      var urg = T.urgencia_intl || 'Si es una emergencia, llama a tu línea de emergencias local (en Colombia: 123) o ve a urgencias.';
      botThen('<p class="m-0 os-alerta"><strong>Por lo que marcaste, te recomendamos atención urgente.</strong> ' + esc(urg) + '</p><p class="os-legal-sm">Esta herramienta no reemplaza urgencias.</p>', function () {
        ask({
          tipo: 'chips',
          opciones: [
            { v: 'alarma_error', t: 'Marqué por error, continuar' },
            { v: 'reiniciar', t: 'Empezar de nuevo' }
          ]
        });
      });
      return;
    }
    botThen(esc(T.alarmas_ok || 'Perfecto.'), function () {
      askTratamientos();
    });
  }

  function askTratamientos() {
    S.fase = 'tratamientos';
    track('tratamientos');
    focusHtml = esc(T.tratamientos_hint || '');
    botThen(esc(T.tratamientos || ''), function () {
      ask({ tipo: 'text_optional', max: 400, placeholder: 'Ej. ibuprofeno 400 mg por 3 días…' });
    });
  }

  function afterTratamientos(text) {
    pushHist();
    var t = (text || '').trim() || 'Nada';
    sayUser(t);
    S.tratamientos = t;
    focusHtml = '';
    var nada = /^(nada|ninguno|ninguna|no)(\b|[.!?,\s]|$)/i.test(t.trim());
    if (nada) {
      S.tratResultado = 'nada';
      askSemiologia();
      return;
    }
    askTratResultado();
  }

  function askTratResultado() {
    S.fase = 'trat_resultado';
    track('trat_resultado');
    botThen(esc(T.trat_resultado || '¿Cómo te fue con eso?'), function () {
      ask({
        tipo: 'chips',
        opciones: (D.tratResultado || []).map(function (o) { return { v: o.v, t: o.t }; })
      });
    });
  }

  function afterTratResultado(v) {
    pushHist();
    var lab = ((D.tratResultado || []).filter(function (o) { return o.v === v; })[0] || {}).t || v;
    sayUser(lab);
    S.tratResultado = v;
    askTratDetalle();
  }

  function askTratDetalle() {
    S.fase = 'trat_detalle';
    botThen(esc(T.trat_detalle || '¿Tiempo y dosis aproximada? (opcional)'), function () {
      ask({ tipo: 'text_optional', max: 200, placeholder: 'Ej. 400 mg cada 8 h por 3 días' });
    });
  }

  function afterTratDetalle(text) {
    pushHist();
    var t = (text || '').trim() || 'Sin detalle';
    sayUser(t);
    S.tratDetalle = t === 'Sin detalle' ? '' : t;
    askSemiologia();
  }

  function askSemiologia() {
    S.qi = 0;
    S.fase = 'pregunta';
    track('semiologia');
    botThen(esc(T.semiologia || ''), function () {
      askPregunta();
    });
  }

  function askPregunta() {
    var qs = (S.cat && S.cat.preguntas) || [];
    if (S.qi >= qs.length) {
      askAntecedentes();
      return;
    }
    S.fase = 'pregunta';
    var p = qs[S.qi];
    botThen(esc(p.texto), function () {
      var isMulti = !!(p.multi || p.tipo === 'multi');
      if (isMulti) {
        var ops = p.opciones.map(function (o) { return { v: o.v, t: o.t, exclusiva: !!o.exclusiva }; });
        ask({ tipo: 'chips_multi', q: p.texto, selected: [], opciones: ops });
      } else {
        ask({ tipo: 'chips', q: p.texto, opciones: p.opciones.map(function (o) { return { v: o.v, t: o.t }; }) });
      }
    });
  }

  function afterPregunta(val) {
    pushHist();
    var qs = S.cat.preguntas;
    var p = qs[S.qi];
    var sel = [].concat(val);
    S.resp[p.id] = sel;
    var labels = sel.map(function (v) {
      var o = p.opciones.filter(function (x) { return x.v === v; })[0];
      return o ? o.t : v;
    });
    sayUser(labels.join(', '));
    S.qi++;
    askPregunta();
  }

  function askAntecedentes() {
    S.fase = 'antecedentes';
    track('antecedentes');
    botThen(esc(T.antecedentes || ''), function () {
      ask({
        tipo: 'chips_multi',
        selected: [],
        opciones: (D.antecedentes || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; })
      });
    });
  }

  function afterAntecedentes(sel) {
    pushHist();
    sayUser(sel.map(function (id) {
      var a = (D.antecedentes || []).filter(function (x) { return x.id === id; })[0];
      return a ? a.texto : id;
    }).join(', '));
    S.antecedentes = sel;
    askQuirurgicos();
  }

  function askQuirurgicos() {
    S.fase = 'quirurgicos';
    botThen(esc(T.quirurgicos || ''), function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Cirugías o “No”' });
    });
  }
  function afterQuirurgicos(text) {
    pushHist();
    var t = (text || '').trim() || 'No';
    sayUser(t);
    S.quirurgicos = t;
    askToxicos();
  }

  function askToxicos() {
    S.fase = 'toxicos';
    botThen(esc(T.toxicos || ''), function () {
      ask({
        tipo: 'chips_multi',
        selected: [],
        opciones: (D.toxicos || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; })
      });
    });
  }
  function afterToxicos(sel) {
    pushHist();
    sayUser(sel.map(function (id) {
      var a = (D.toxicos || []).filter(function (x) { return x.id === id; })[0];
      return a ? a.texto : id;
    }).join(', '));
    S.toxicos = sel;
    askAlergias();
  }

  function askAlergias() {
    S.fase = 'alergias';
    botThen(esc(T.alergias || ''), function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Alergias o “Ninguna”' });
    });
  }
  function afterAlergias(text) {
    pushHist();
    var t = (text || '').trim() || 'Ninguna';
    sayUser(t);
    S.alergias = t;
    askMedicamentos();
  }

  function askMedicamentos() {
    S.fase = 'medicamentos';
    botThen(esc(T.medicamentos || ''), function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Medicamentos actuales o “Ninguno”' });
    });
  }
  function afterMedicamentos(text) {
    pushHist();
    var t = (text || '').trim() || 'Ninguno';
    sayUser(t);
    S.medicamentos = t;
    goGinecoOrFamiliares();
  }

  function goGinecoOrFamiliares() {
    var needG = S.sexo === 'mujer' || S.sexo === 'otro';
    if (needG) askGineco();
    else {
      S.gineco = [];
      askFamiliares();
    }
  }

  function askGineco() {
    S.fase = 'gineco';
    botThen(esc(T.gineco || ''), function () {
      ask({
        tipo: 'chips_multi',
        selected: [],
        opciones: (D.gineco || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; })
      });
    });
  }
  function afterGineco(sel) {
    pushHist();
    sayUser(sel.map(function (id) {
      var a = (D.gineco || []).filter(function (x) { return x.id === id; })[0];
      return a ? a.texto : id;
    }).join(', '));
    S.gineco = sel;
    askFamiliares();
  }

  function askFamiliares() {
    S.fase = 'familiares';
    botThen(esc(T.familiares || ''), function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Antecedentes familiares o “Ninguno”' });
    });
  }
  function afterFamiliares(text) {
    pushHist();
    var t = (text || '').trim() || 'Ninguno';
    sayUser(t);
    S.familiares = t;
    askEvidencia();
  }

  function askEvidencia() {
    S.fase = 'evidencia';
    track('evidencia');
    botThen(esc(T.evidencia || ''), function () {
      ask({ tipo: 'upload', q: T.evidencia || '' });
    });
  }

  function renderPreviews() {
    var box = document.getElementById('os-previews');
    if (!box) return;
    box.innerHTML = S.adjuntos.map(function (a) {
      if (a.kind === 'image' && a.dataUrl) {
        return '<img class="os-prev" src="' + a.dataUrl + '" alt="' + esc(a.name) + '">';
      }
      return '<span class="os-prev-file" title="' + esc(a.name) + '">' + esc(a.name) + '</span>';
    }).join('');
  }

  function onFilesPicked(ev) {
    var files = Array.prototype.slice.call(ev.target.files || []);
    files.forEach(function (f) {
      if (!OK_TYPES[f.type]) { alert('Tipo no permitido: ' + f.name); return; }
      if (f.size > MAX_FILE) { alert('Archivo muy grande (máx. 5 MB): ' + f.name); return; }
      var reader = new FileReader();
      reader.onload = function () {
        S.adjuntos.push({
          name: f.name,
          type: f.type,
          size: f.size,
          kind: f.type.indexOf('image/') === 0 ? 'image' : 'file',
          dataUrl: f.type.indexOf('image/') === 0 ? reader.result : null
          // Preview only: production Clinova payload will use attachments[] metadata; A/B disabled for storage
        });
        renderPreviews();
        paintComposer();
      };
      if (f.type.indexOf('image/') === 0) reader.readAsDataURL(f);
      else {
        S.adjuntos.push({ name: f.name, type: f.type, size: f.size, kind: 'file', dataUrl: null });
        renderPreviews();
        paintComposer();
      }
    });
    ev.target.value = '';
  }

  function finishUpload(keep) {
    if (!keep) S.adjuntos = [];
    sayUser(keep && S.adjuntos.length ? (S.adjuntos.length + ' archivo(s) adjunto(s)') : 'Sin adjuntos');
    showResultado();
  }

  function causaLabel(k) {
    var c = S.cat && S.cat.causas && S.cat.causas[k];
    if (c) {
      if (typeof c === 'string') return c;
      return c.t || k;
    }
    return (D.causas && D.causas[k]) || k;
  }

  function causaDesc(k) {
    var c = S.cat && S.cat.causas && S.cat.causas[k];
    if (c && typeof c === 'object') return c.d || '';
    return '';
  }

  function likeliChip(i) {
    if (i === 0) return { t: 'Más frecuente', cls: 'os-chip-likeli-hi' };
    if (i === 1) return { t: 'Posible', cls: 'os-chip-likeli-mid' };
    return { t: 'A considerar', cls: 'os-chip-likeli-lo' };
  }

  function tratResultadoLabel(v) {
    var list = D.tratResultado || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].v === v) return list[i].t;
    }
    return v || '';
  }

  function keySymptomRows() {
    var rows = [];
    if (!S.cat) return rows;
    (S.cat.preguntas || []).forEach(function (p) {
      var sel = [].concat(S.resp[p.id] || []);
      if (!sel.length) return;
      var labels = [];
      (p.opciones || []).forEach(function (o) {
        if (sel.indexOf(o.v) !== -1) labels.push(o.t);
      });
      if (!labels.length) return;
      rows.push({ q: p.texto || p.t || p.id, a: labels.join('; ') });
    });
    return rows;
  }

  function iconHtml(name) {
    return '<span class="os-card-ico" aria-hidden="true"><i data-lucide="' + esc(name) + '" class="w-4 h-4"></i></span>';
  }

  function respLabels(pid) {
    if (!S.cat) return [];
    var out = [];
    (S.cat.preguntas || []).forEach(function (p) {
      if (p.id !== pid) return;
      var sel = [].concat(S.resp[p.id] || []);
      (p.opciones || []).forEach(function (o) { if (sel.indexOf(o.v) !== -1) out.push({ v: o.v, t: o.t }); });
    });
    return out;
  }
  function lc1(s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }
  function relatoCorto() {
    var s = String(S.relato || '').trim().split(/[.\n]/)[0].trim();
    if (s.length > 80) s = s.slice(0, 77).replace(/\s+\S*$/, '') + '…';
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  // Titular concreto con las palabras del paciente: motivo + duración + intensidad + asociados + lo que probó.
  function headlineParts() {
    var parts = [];
    var mot = relatoCorto();
    if (mot) parts.push(mot);
    var dur = respLabels('desde').concat(respLabels('inicio'));
    dur.forEach(function (d) { parts.push(lc1(d.t)); });
    var inten = respLabels('intensidad')[0];
    if (inten) {
      var nivelTxt = { '0-3': 'leve', '4-6': 'moderada', '7-10': 'fuerte' }[inten.v];
      parts.push('intensidad ' + (nivelTxt || lc1(inten.t)));
    }
    var loc = respLabels('localizacion')[0];
    var yaDicho = { abdomen: /barriga|estomag|panza|abdom|vientre|colico/, cabeza: /cabeza|migra/, pecho: /pecho/, espalda: /espalda|lumbar/, urinario: /orin|urin|vejiga/ };
    if (loc && !/generalizado|otro_sitio/.test(loc.v) && !(yaDicho[loc.v] && yaDicho[loc.v].test(normTxt(mot))) &&
        normTxt(mot).indexOf(normTxt(loc.t).split(' ')[0]) === -1) parts.push('en ' + lc1(loc.t));
    var asoc = respLabels('asociados').concat(respLabels('ademas'));
    var asocReal = asoc.filter(function (a) { return a.v !== 'ninguna'; });
    if (asocReal.length) parts.push('con ' + asocReal.map(function (a) { return lc1(a.t); }).join(', '));
    else if (asoc.length) parts.push('sin otros síntomas de alarma');
    if (S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      var tr = 'probaste ' + S.tratamientos;
      if (S.tratResultado) tr += ' (' + lc1(tratResultadoLabel(S.tratResultado)) + ')';
      parts.push(tr);
    }
    return parts;
  }
  function esIndefinido(r) {
    var gen = D.causasGenericas || [];
    return !r.causas.length || gen.indexOf(r.causas[0]) !== -1;
  }
  function posiblesGenerales(r) {
    var out = [];
    var gen = D.causasGenericas || [];
    r.causas.forEach(function (k) { if (gen.indexOf(k) === -1) out.push(causaLabel(k)); });
    var pos = (S.cat && S.cat.posibles) || {};
    Object.keys(pos).forEach(function (pid) {
      respLabels(pid).forEach(function (o) {
        (pos[pid][o.v] || []).forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); });
      });
    });
    return out.slice(0, 3);
  }

  function contasteCardHtml(r) {
    var parts = headlineParts();
    var html = '<section class="os-card os-card-contaste">';
    html += '<header class="os-card-head">' + iconHtml('message-square-text') + '<div><p class="os-card-kicker">Tu caso</p><h3 class="os-card-title">Lo que nos contaste</h3></div></header>';
    html += '<p class="os-contaste-head">' + esc(parts.join(', ')) + '.</p>';
    var rows = keySymptomRows();
    if (rows.length) {
      html += '<ul class="os-mini-list">';
      rows.slice(0, 6).forEach(function (x) { html += '<li><span class="os-mini-q">' + esc(x.q) + '</span> ' + esc(x.a) + '</li>'; });
      html += '</ul>';
    }
    var pos = posiblesGenerales(r);
    if (pos.length) {
      html += '<h4 class="os-med-sub">Posibilidades generales que el médico revisará</h4><ul class="os-causa-list">';
      pos.forEach(function (x) { html += '<li class="os-causa-item"><div class="os-causa-top"><strong>' + esc(x) + '</strong></div></li>'; });
      html += '</ul>';
    }
    html += '<p class="os-card-note">Con tus respuestas no hay una causa única clara. Un médico revisa tu caso y define el diagnóstico en la consulta de seguimiento.</p>';
    html += cardCtaHtml('resumen', 'Agendar cita médica con este resumen');
    html += '</section>';
    return html;
  }

  function summaryCardHtml() {
    var html = '<section class="os-card os-card-summary">';
    html += '<header class="os-card-head">' + iconHtml('clipboard-list') + '<div><p class="os-card-kicker">Tu relato</p><h3 class="os-card-title">Resumen de lo que contaste</h3></div></header>';
    html += '<dl class="os-dl">';
    if (S.relato) {
      html += '<div><dt>Motivo</dt><dd>' + esc(S.relato) + '</dd></div>';
    }
    if (S.cat) {
      html += '<div><dt>Área</dt><dd>' + esc(S.cat.titulo) + '</dd></div>';
    }
    var rows = keySymptomRows();
    if (rows.length) {
      html += '<div><dt>Síntomas clave</dt><dd><ul class="os-mini-list">';
      rows.slice(0, 6).forEach(function (r) {
        html += '<li><span class="os-mini-q">' + esc(r.q) + '</span> ' + esc(r.a) + '</li>';
      });
      html += '</ul></dd></div>';
    }
    if (S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      html += '<div><dt>Lo que has probado</dt><dd>' + esc(S.tratamientos);
      if (S.tratResultado) html += ' · <em>' + esc(tratResultadoLabel(S.tratResultado)) + '</em>';
      if (S.tratDetalle) html += '<br><span class="os-muted">' + esc(S.tratDetalle) + '</span>';
      html += '</dd></div>';
    } else {
      html += '<div><dt>Lo que has probado</dt><dd>Nada todavía</dd></div>';
    }
    html += '</dl>';
    html += cardCtaHtml('resumen', 'Agendar cita médica con este resumen');
    html += '</section>';
    return html;
  }

  function causasCardHtml(r) {
    if (!r.causas.length) return '';
    var html = '<section class="os-card os-card-causas">';
    html += '<header class="os-card-head">' + iconHtml('stethoscope') + '<div><p class="os-card-kicker">Orientación</p><h3 class="os-card-title">Posibles causas / diagnósticos probables</h3></div></header>';
    html += '<ul class="os-causa-list">';
    r.causas.slice(0, 5).forEach(function (k, i) {
      var chip = likeliChip(i);
      var desc = causaDesc(k);
      html += '<li class="os-causa-item"><div class="os-causa-top"><strong>' + esc(causaLabel(k)) + '</strong>';
      html += '<span class="os-likeli ' + chip.cls + '">' + esc(chip.t) + '</span></div>';
      if (desc) html += '<p class="os-causa-desc">' + esc(desc) + '</p>';
      html += '</li>';
    });
    html += '</ul>';
    html += '<p class="os-card-note">El médico confirma el diagnóstico en la consulta. Esta lista es orientación general según tus respuestas.</p>';
    html += '</section>';
    return html;
  }

  function medsCardHtml(r) {
    var html = '<section class="os-card os-card-meds">';
    html += '<header class="os-card-head">' + iconHtml('pill') + '<div><p class="os-card-kicker">Cuidados</p><h3 class="os-card-title">Medicamentos sugeridos</h3></div></header>';
    html += '<div class="os-meds-consult"><p><i data-lucide="stethoscope" class="w-4 h-4" aria-hidden="true"></i> <span>Te sugerimos <strong>consultar con un médico antes de tomar cualquier medicamento</strong>.</span></p>' +
      '<button type="button" class="os-meds-consult-cta" data-os="agendar" data-src="meds">Agendar consulta de seguimiento</button></div>';

    if (S.tratResultado === 'funciono' && S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      html += '<p class="os-card-lead">Como te funcionó <strong>' + esc(S.tratamientos) + '</strong>' +
        (S.tratDetalle ? ' (' + esc(S.tratDetalle) + ')' : '') +
        ', si es de venta libre y te resulta seguro según la etiqueta, puedes continuar usándolo respetando dosis y tiempo máximo.</p>';
    } else if (S.tratResultado === 'efectos') {
      html += '<p class="os-card-lead">Por los efectos adversos que mencionaste con <strong>' + esc(S.tratamientos) + '</strong>, no sugerimos repetirlo. Revisa opciones de venta libre abajo o consulta al médico.</p>';
    } else if ((S.tratResultado === 'no' || S.tratResultado === 'parcial') && !r.embarazo && r.otc.length) {
      html += '<p class="os-card-lead">Como lo anterior no resolvió del todo tu molestia, aquí van alternativas de venta libre:</p>';
    }

    if (r.embarazo) {
      html += '<p class="os-card-lead">En embarazo o lactancia no sugerimos automedicación: tu médico te orientará.</p>';
    } else if (r.otc.length) {
      html += '<h4 class="os-med-sub">De venta libre</h4>';
      html += '<div class="os-med-grid">';
      r.otc.forEach(function (p) {
        var avisos = p.advertencias || p.avisos || [];
        html += '<article class="os-otc"><p class="os-otc-name">' + esc(p.nombre) + '</p>';
        html += '<span class="os-badge-otc">Venta libre</span>';
        if (p.uso) html += '<p class="os-otc-uso">' + esc(p.uso) + '</p>';
        if (avisos.length) {
          html += '<ul class="os-otc-dose">';
          avisos.forEach(function (a) { html += '<li>' + esc(a) + '</li>'; });
          html += '</ul>';
        }
        html += '<a class="os-pharm-link" data-os-farmacia="otc" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaUrl(p.busqueda || p.nombre)) + '">' +
          '<i data-lucide="shopping-bag" class="w-3.5 h-3.5" aria-hidden="true"></i> Comprar en farmacia</a>';
        html += '</article>';
      });
      html += '</div>';
      if (D.otcAvisos && D.otcAvisos.length) {
        html += '<div class="os-warn"><ul class="m-0 pl-4">' +
          D.otcAvisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
      }
    } else if (r.nivel !== 'prioritaria') {
      html += '<p class="os-card-lead">No hay una sugerencia clara de venta libre para tu combinación de respuestas.</p>';
    }

    if (r.rx && r.rx.length) {
      html += '<h4 class="os-med-sub">Con fórmula médica</h4>';
      html += '<p class="os-rx-lead">Solo un médico puede indicarlos y definir la dosis. En la consulta de seguimiento te los formula si aplican.</p>';
      html += '<div class="os-med-grid">';
      r.rx.forEach(function (p) {
        html += '<article class="os-rx" data-os-rx="1"><p class="os-otc-name">' + esc(p.nombre) + '</p>';
        html += '<span class="os-badge-rx"><i data-lucide="file-signature" class="w-3 h-3" aria-hidden="true"></i> Requiere fórmula médica</span>';
        if (p.uso) html += '<p class="os-otc-uso">' + esc(p.uso) + '</p>';
        html += '<button type="button" class="os-rx-cta" data-os="agendar" data-src="rx">Obtener fórmula en consulta de seguimiento</button>';
        html += '<a class="os-pharm-link is-secondary" data-os-farmacia="rx" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaUrl(p.busqueda || p.nombre)) + '">Ver en farmacia (con fórmula)</a>';
        html += '</article>';
      });
      html += '</div>';
    } else {
      html += '<div class="os-rx-note"><strong>Con fórmula médica</strong> — si necesitas un medicamento formulado, el médico lo indica en la consulta de seguimiento (también incapacidad y órdenes).</div>';
    }
    if (!r.embarazo && (r.otc.length || (r.rx && r.rx.length))) {
      html += '<p class="os-card-note">Enlaces a ' + esc(farmaciaNombre()) + ', farmacia externa. Los medicamentos con fórmula solo se dispensan presentando la fórmula médica. No es publicidad de medicamentos de venta bajo fórmula.</p>';
    }
    html += '</section>';
    return html;
  }

  function examsCardHtml(r) {
    if (!r.examenes.length) return '';
    var html = '<section class="os-card os-card-exams">';
    html += '<header class="os-card-head">' + iconHtml('flask-conical') + '<div><p class="os-card-kicker">Estudios</p><h3 class="os-card-title">Exámenes médicos sugeridos</h3></div></header>';
    var fn = farmaciaNombre();
    html += '<ul class="os-exam-rows">';
    r.examenes.forEach(function (x) {
      var q = examenBusqueda(x);
      var pt = examenPartes(x);
      var inner = '<span class="os-exam-txt"><span class="os-exam-name">' + esc(pt.nombre) + '</span>' +
        (pt.det ? '<span class="os-exam-det">' + esc(pt.det) + '</span>' : '') + '</span>';
      if (q) {
        html += '<li><a class="os-exam-link" data-os-farmacia="examenes" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaUrl(q, 'examenes')) + '" aria-label="' + esc(pt.nombre + ' en ' + fn + ' (abre en otra pestaña)') + '">' +
          '<i data-lucide="flask-conical" class="os-exam-ico" aria-hidden="true"></i>' + inner +
          '<span class="os-exam-go">' + esc(fn) + '<i data-lucide="external-link" class="os-ext-ico" aria-hidden="true"></i></span></a></li>';
      } else {
        html += '<li><div class="os-exam-row is-plain"><i data-lucide="stethoscope" class="os-exam-ico" aria-hidden="true"></i>' + inner + '</div></li>';
      }
    });
    html += '</ul>';
    html += '<a class="os-exam-all" data-os-farmacia="examenes-todos" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaExamenesUrl()) + '">Ver exámenes en ' + esc(fn) + '<i data-lucide="external-link" class="os-ext-ico" aria-hidden="true"></i></a>';
    html += '<p class="os-card-note">El médico decide cuáles ordenar según la valoración. Algunos laboratorios piden orden médica: te la pueden dar en la consulta de seguimiento.</p>';
    html += '</section>';
    return html;
  }

  function referralCardHtml(e) {
    var html = '<section class="os-card os-card-ref">';
    html += '<header class="os-card-head">' + iconHtml('user-round') + '<div><p class="os-card-kicker">Remisión</p><h3 class="os-card-title">Especialista sugerido</h3></div></header>';
    html += '<p class="os-card-lead"><strong>' + esc(e.nombre) + '</strong></p>';
    html += '<p class="os-muted">Te orientamos hacia esta especialidad según tus respuestas. El médico de seguimiento puede confirmar o ajustar la remisión.</p>';
    html += cardCtaHtml('remision', 'Agendar cita con ' + e.nombre);
    html += '</section>';
    return html;
  }

  function warningCardHtml(r) {
    var html = '<section class="os-card os-card-warn">';
    html += '<header class="os-card-head">' + iconHtml('triangle-alert') + '<div><p class="os-card-kicker">Vigilancia</p><h3 class="os-card-title">Señales de alarma a vigilar</h3></div></header>';
    if (r.nivel === 'prioritaria') {
      html += '<p class="os-card-lead os-alerta">Por lo que marcaste, no te sugerimos automedicarte. Busca valoración pronto o acude a urgencias si empeoras.</p>';
    } else {
      html += '<p class="os-card-lead">Consulta de inmediato (Colombia 123 / urgencias) si aparece:</p>';
    }
    html += '<ul class="os-warn-list">';
    (D.alarmas || []).slice(0, 6).forEach(function (a) {
      html += '<li>' + esc(a.texto || a.t || '') + '</li>';
    });
    html += '</ul></section>';
    return html;
  }

  function precioPromo() {
    var p = C.precio || D.precio || {};
    var pct = p.cupon_pct != null ? Number(p.cupon_pct) : 50;
    var copPromo = p.cop_promo != null ? p.cop_promo : (p.cop != null ? Math.round(Number(p.cop) * (100 - pct) / 100) : null);
    var usdPromo = p.usd_promo != null ? p.usd_promo : (p.usd != null ? Math.round(Number(p.usd) * (100 - pct)) / 100 : null);
    return {
      regular: precioParts(p.cop, p.usd) || '$50.000 COP · USD 15',
      promo: precioParts(copPromo, usdPromo) || '$25.000 COP · USD 7,50',
      regularCop: p.cop != null ? fmtCop(p.cop) : '$50.000 COP',
      promoCop: copPromo != null ? fmtCop(copPromo) : '$25.000 COP',
      code: p.cupon || C.cupon || '50%'
    };
  }

  function modDefault(e) {
    var mods = e.modalidades || [];
    if (S.modalidad && mods.indexOf(S.modalidad) !== -1) return S.modalidad;
    if (mods.indexOf('telemedicina') !== -1) return 'telemedicina';
    return mods[0] || 'presencial';
  }

  // Tarjeta principal de agendamiento: arriba del resultado.
  function bookingHeroHtml(e, indef) {
    var pr = precioPromo();
    var mods = e.modalidades && e.modalidades.length ? e.modalidades : ['presencial'];
    S.modalidad = modDefault(e);
    var labels = { telemedicina: 'Virtual', presencial: 'Presencial (Bogotá)' };

    var html = '<section class="os-card os-card-book os-book-hero" id="os-booking">';
    html += '<header class="os-card-head">' + iconHtml('calendar-check') + '<div><p class="os-card-kicker">Siguiente paso recomendado</p><h3 class="os-card-title">' + (indef ? 'Un médico revisa tu caso y define el diagnóstico' : 'Que un médico revise tu caso y te formule') + '</h3></div></header>';
    html += '<p class="os-book-esp">Consulta de seguimiento con <strong>' + esc(e.nombre) + '</strong></p>';
    html += '<div class="os-book-toggle" role="group" aria-label="Modalidad de la consulta">';
    mods.forEach(function (m) {
      var on = S.modalidad === m;
      html += '<button type="button" class="os-book-mod' + (on ? ' is-on' : '') + '" data-os="mod-hero" data-v="' + esc(m) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<i data-lucide="' + (m === 'telemedicina' ? 'video' : 'map-pin') + '" class="w-3.5 h-3.5" aria-hidden="true"></i> ' + esc(labels[m] || m) + '</button>';
    });
    html += '</div>';
    html += '<div class="os-book-price"><s class="os-precio-old">' + esc(pr.regular) + '</s>';
    html += '<span class="os-precio-promo">' + esc(pr.promo) + '</span>';
    html += '<span class="os-book-code">código <strong>' + esc(pr.code) + '</strong></span></div>';
    html += '<ul class="os-book-perks">';
    html += '<li><i data-lucide="stethoscope" class="w-3.5 h-3.5" aria-hidden="true"></i> Diagnóstico médico</li>';
    html += '<li><i data-lucide="pill" class="w-3.5 h-3.5" aria-hidden="true"></i> Fórmula para tus medicamentos</li>';
    html += '<li><i data-lucide="flask-conical" class="w-3.5 h-3.5" aria-hidden="true"></i> Órdenes de exámenes</li>';
    html += '<li><i data-lucide="file-text" class="w-3.5 h-3.5" aria-hidden="true"></i> Incapacidad si aplica</li>';
    html += '<li><i data-lucide="message-square-text" class="w-3.5 h-3.5" aria-hidden="true"></i> Usa lo que ya respondiste</li>';
    html += '</ul>';
    html += '<button type="button" class="os-book-cta os-book-cta-xl" data-os="agendar" data-src="hero" id="OS_CTA_AGENDAR">Agendar consulta de seguimiento <i data-lucide="arrow-right" class="w-4 h-4" aria-hidden="true"></i></button>';
    html += '<p class="os-book-trust"><i data-lucide="shield-check" class="w-3.5 h-3.5" aria-hidden="true"></i> Médicos colombianos registrados · fórmula válida en Colombia</p>';
    html += '</section>';
    return html;
  }

  // Repetición compacta al final del resultado.
  function bookingCardHtml(e) {
    var pr = precioPromo();
    var html = '<section class="os-card os-card-book os-book-end" id="os-booking-end">';
    html += '<header class="os-card-head">' + iconHtml('calendar-check') + '<div><p class="os-card-kicker">¿Listo?</p><h3 class="os-card-title">Agenda tu consulta de seguimiento</h3></div></header>';
    html += '<div class="os-book-price"><s class="os-precio-old">' + esc(pr.regular) + '</s>';
    html += '<span class="os-precio-promo">' + esc(pr.promo) + '</span>';
    html += '<span class="os-book-code">código <strong>' + esc(pr.code) + '</strong></span></div>';
    html += '<div class="os-book-actions">';
    html += '<button type="button" class="os-chip os-chip-primary os-book-cta" data-os="agendar" data-src="final" id="OS_CTA_AGENDAR_FIN">Agendar consulta de seguimiento</button>';
    if (e.url) html += '<a class="os-chip" href="' + esc(e.url) + '">Conocer el servicio</a>';
    html += '<button type="button" class="os-chip" data-os="reiniciar">Nueva orientación</button>';
    html += '</div>';
    html += '<p class="os-legal-sm">Al agendar puedes autorizar el envío de tus respuestas (y adjuntos) al profesional.</p>';
    html += '</section>';
    return html;
  }

  function briefHtml(r, indef) {
    var mot = relatoCorto();
    var dur = respLabels('desde')[0];
    if (indef) {
      return '<p class="os-result-brief">Con lo que nos contaste no hay una causa única clara. <strong>Un médico revisa tu caso y define el diagnóstico</strong>; ya tiene tus respuestas.</p>';
    }
    var area = S.cat ? S.cat.titulo : '';
    var top = r.causas.length ? causaLabel(r.causas[0]) : '';
    var txt = mot ? 'Nos contaste: «' + esc(mot) + '»' + (dur ? ' (' + esc(lc1(dur.t)) + ')' : '') + '. ' : '';
    txt += 'Según tus respuestas' + (area ? ' sobre <strong>' + esc(area) + '</strong>' : '');
    txt += top ? ', lo más probable es <strong>' + esc(top) + '</strong>.' : '.';
    txt += ' Un médico puede confirmarlo y formularte en la consulta de seguimiento.';
    return '<p class="os-result-brief">' + txt + '</p>';
  }

  function buildResultHtml(r, e) {
    var html = '<div class="os-result" id="os-result-panel" data-os-result="1">';
    var indef = esIndefinido(r);
    var titulo = indef ? headlineParts().slice(0, 4).join(', ') : 'Recomendaciones y próximos pasos';
    html += '<h2 class="os-result-hero-title' + (indef ? ' is-relato' : '') + '">' + esc(titulo || 'Recomendaciones y próximos pasos') + '</h2>';
    html += briefHtml(r, indef);
    if (r.nivel === 'prioritaria') html += warningCardHtml(r);
    html += bookingHeroHtml(e, indef);
    html += indef ? contasteCardHtml(r) : causasCardHtml(r);
    html += medsCardHtml(r);
    html += examsCardHtml(r);
    if (!indef) html += summaryCardHtml();
    html += referralCardHtml(e);
    if (r.nivel !== 'prioritaria') html += warningCardHtml(r);
    html += bookingCardHtml(e);
    html += '<p class="os-result-disc">Orientación general basada en tus respuestas. El diagnóstico y las fórmulas las emite el profesional en consulta. Urgencias: línea local (Colombia 123).</p>';
    html += '</div>';
    return html;
  }

  function showResultado() {
    S.fase = 'resultado';
    track('resultado');
    setResultMode(true);
    var r = evaluar();
    var e = espInfo(r.esp);
    botThen(esc(T.cierre || 'Listo. Aquí van tus recomendaciones y próximos pasos…'), function () {
      say(esc('Tu orientación'), { plain: 'Tu orientación' });
      ask({
        tipo: 'result_actions',
        html: buildResultHtml(r, e)
      });
      mountSticky();
      requestAnimationFrame(function () {
        var panel = document.getElementById('os-result-panel');
        if (panel) {
          try { panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) {}
        }
      });
    });
  }

  function showAgendar() {
    S.fase = 'agendar';
    track('agendar');
    removeSticky();
    setResultMode(true);
    var r = evaluar();
    var e = espInfo(r.esp);
    if (!e.especialidad) {
      var msg = 'Hola, hice la orientación de síntomas en la web y quiero agendar una cita de medicina general.';
      botThen('<p class="m-0">Para <strong>medicina general</strong> te atendemos por WhatsApp. El mensaje no incluye tus síntomas.</p>', function () {
        ask({
          tipo: 'result_actions',
          html: '<div class="os-chips"><a class="os-chip os-chip-primary" id="OS_CTA_WHATSAPP" target="_blank" rel="noopener" href="' + esc(C.whatsapp + encodeURIComponent(msg)) + '">Agendar por WhatsApp</a><button type="button" class="os-chip" data-os="atras-resultado">Volver</button></div>'
        });
      });
      return;
    }
    if (e.modalidades.indexOf(S.modalidad) === -1) S.modalidad = e.modalidades.length === 1 ? e.modalidades[0] : '';
    var nombresMod = { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (internacional)' };
    botThen('<p class="m-0">Agenda tu consulta de <strong>' + esc(e.nombre) + '</strong>. Elige modalidad:</p>' + precioHtml() + promoHint(), function () {
      paintAgendarForm(e, nombresMod);
    });
  }

  function paintAgendarForm(e, nombresMod) {
    var html = '<div class="os-agendar">';
    html += '<div class="os-chips" role="group" aria-label="Modalidad">';
    e.modalidades.forEach(function (m) {
      var precio = e.precios[m] ? ' · ' + e.precios[m] : '';
      html += '<button type="button" class="os-chip' + (S.modalidad === m ? ' is-on' : '') + '" data-os="mod" data-v="' + esc(m) + '">' + esc(nombresMod[m] + precio) + '</button>';
    });
    html += '</div>';
    if (S.modalidad === 'telemedicina') {
      html += '<label class="os-check' + (S.consTele ? ' is-on' : '') + '"><input type="checkbox" data-os="cons-tele"' + (S.consTele ? ' checked' : '') + '><span>' + esc(C.txtTele) + ' <small class="text-error-600">*</small></span></label>';
    }
    html += '<label class="os-check' + (S.compartir ? ' is-on' : '') + '"><input type="checkbox" data-os="compartir"' + (S.compartir ? ' checked' : '') + '><span><strong>Compartir mi información con el profesional</strong> (recomendado). Llega como previa pendiente de validación médica.</span></label>';
    if (S.compartir) {
      html += '<label class="os-check' + (S.consDatos ? ' is-on' : '') + '"><input type="checkbox" data-os="cons-datos"' + (S.consDatos ? ' checked' : '') + '><span>' + esc(C.txtDatos) + ' <a class="text-primary-600 underline" target="_blank" rel="noopener" href="' + esc(C.privacidad) + '">Política de privacidad</a>. <small class="text-error-600">*</small></span></label>';
    }
    var ok = S.modalidad && (S.modalidad !== 'telemedicina' || S.consTele) && (!S.compartir || S.consDatos);
    html += '<div class="os-chips mt-2"><button type="button" class="os-chip" data-os="atras-resultado">Volver</button>' +
      '<button type="button" class="os-chip os-chip-primary" data-os="abrir-agenda" id="OS_CTA_FECHA"' + (ok ? '' : ' disabled') + '>Elegir fecha y hora</button></div>';
    html += '<p class="os-hint">' + (S.compartir ? 'Tus respuestas (y adjuntos) se envían solo al confirmar la cita.' : 'Si no marcas compartir, tus respuestas no salen de tu navegador.') + '</p>';
    html += '<p class="os-legal-sm">Fórmulas emitidas por médicos licenciados en Colombia; validez fuera de Colombia según normas locales.</p></div>';
    ask({ tipo: 'agendar_ui', html: html });
  }

  // ---------- Events ----------
  function toggleMulti(list, v, exclusiva) {
    var i = list.indexOf(v);
    if (i !== -1) { list.splice(i, 1); return list; }
    if (exclusiva) return [v];
    return list.filter(function (x) {
      var opt = (inputMode.opciones || []).filter(function (o) { return o.v === x; })[0];
      return !(opt && opt.exclusiva);
    }).concat(v);
  }

  function goBack() {
    if (!S.history.length || busy) return;
    var snap = S.history.pop();
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { msgs = msgs.slice(0, i); break; }
    }
    S.fase = snap.fase;
    S.edad = snap.edad; S.pais = snap.pais; S.sexo = snap.sexo; S.relato = snap.relato;
    S.alarmas = snap.alarmas; S.qi = snap.qi; S.resp = snap.resp;
    S.antecedentes = snap.antecedentes; S.quirurgicos = snap.quirurgicos;
    S.toxicos = snap.toxicos; S.gineco = snap.gineco; S.familiares = snap.familiares;
    S.alergias = snap.alergias; S.medicamentos = snap.medicamentos;
    S.tratamientos = snap.tratamientos; S.tratResultado = snap.tratResultado; S.tratDetalle = snap.tratDetalle;
    S.cat = snap.catId ? catById(snap.catId) : null;
    inputMode = null;
    if (S.fase !== 'resultado' && S.fase !== 'agendar') setResultMode(false);
    renderChrome();
    reaskCurrent();
  }

  function reaskCurrent() {
    var f = S.fase;
    // Title + options always from the same step (fixes stale #os-focus-q after Atrás).
    if (f === 'inicio') {
      ask({ tipo: 'confirm', q: T.edad || '¿Tienes 18 años o más?', opciones: [{ v: 'adulto', t: 'Sí, 18 o más', primary: true }, { v: 'menor', t: 'Menor de 18' }] });
    } else if (f === 'pais') {
      ask({ tipo: 'chips', q: T.pais || '¿Desde qué país nos escribes?', opciones: (D.paises || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'sexo') {
      ask({ tipo: 'chips', q: T.sexo || '¿Cuál es tu sexo biológico?', opciones: (D.sexo || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'motivo') {
      ask({ tipo: 'text', q: T.motivo || '¿Qué te trae por aquí?', max: 1000, placeholder: '…', value: S.relato });
    } else if (f === 'categoria') {
      ask({ tipo: 'chips', q: T.categoria || '', opciones: categoriaOpciones() });
    } else if (f === 'alarmas') {
      var ops = (D.alarmas || []).map(function (a) { return { v: a.id, t: a.texto }; });
      ops.push({ v: 'ninguna', t: 'Ninguna de estas', exclusiva: true });
      ask({ tipo: 'chips_multi', q: T.alarmas || '', selected: [], opciones: ops });
    } else if (f === 'tratamientos') {
      ask({ tipo: 'text_optional', q: T.tratamientos || '', max: 400, value: S.tratamientos });
    } else if (f === 'trat_resultado') {
      ask({ tipo: 'chips', q: T.trat_resultado || '¿Cómo te fue con eso?', opciones: (D.tratResultado || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'trat_detalle') {
      ask({ tipo: 'text_optional', q: T.trat_detalle || '¿Tiempo y dosis aproximada? (opcional)', max: 200, value: S.tratDetalle });
    } else if (f === 'pregunta') {
      var qs = (S.cat && S.cat.preguntas) || [];
      var p = qs[S.qi];
      if (!p) { askAntecedentes(); return; }
      var isMulti = !!(p.multi || p.tipo === 'multi');
      if (isMulti) {
        ask({ tipo: 'chips_multi', q: p.texto, selected: [], opciones: p.opciones.map(function (o) { return { v: o.v, t: o.t, exclusiva: !!o.exclusiva }; }) });
      } else {
        ask({ tipo: 'chips', q: p.texto, opciones: p.opciones.map(function (o) { return { v: o.v, t: o.t }; }) });
      }
    } else if (f === 'antecedentes') {
      ask({ tipo: 'chips_multi', q: T.antecedentes || '', selected: [], opciones: (D.antecedentes || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'quirurgicos') {
      ask({ tipo: 'text_optional', q: T.quirurgicos || '', max: 300, value: S.quirurgicos });
    } else if (f === 'toxicos') {
      ask({ tipo: 'chips_multi', q: T.toxicos || '', selected: [], opciones: (D.toxicos || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'alergias') {
      ask({ tipo: 'text_optional', q: T.alergias || '', max: 300, value: S.alergias });
    } else if (f === 'medicamentos') {
      ask({ tipo: 'text_optional', q: T.medicamentos || '', max: 300, value: S.medicamentos });
    } else if (f === 'gineco') {
      ask({ tipo: 'chips_multi', q: T.gineco || '', selected: [], opciones: (D.gineco || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'familiares') {
      ask({ tipo: 'text_optional', q: T.familiares || '', max: 300, value: S.familiares });
    } else if (f === 'evidencia') {
      ask({ tipo: 'upload', q: T.evidencia || '' });
    } else if (f === 'resultado') {
      showResultado();
    } else {
      start();
    }
  }

  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-os]');
    if (!b || b.disabled || busy) return;
    var a = b.getAttribute('data-os');

    if (a === 'atras') { goBack(); return; }
    if (a === 'reiniciar') { reset(); start(); return; }
    if (a === 'agendar') {
      var src = b.getAttribute('data-src');
      if (src) track('agendar_' + src);
      showAgendar();
      return;
    }
    if (a === 'mod-hero') {
      S.modalidad = b.getAttribute('data-v');
      [].forEach.call(root.querySelectorAll('[data-os="mod-hero"]'), function (x) {
        var on = x.getAttribute('data-v') === S.modalidad;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      return;
    }
    if (a === 'atras-resultado') { S.fase = 'resultado'; showResultado(); return; }
    if (a === 'abrir-agenda') { abrirAgenda(); return; }
    if (a === 'skip-upload') { finishUpload(false); return; }
    if (a === 'ok-upload') {
      if (!S.consAdjuntos || !S.adjuntos.length) return;
      finishUpload(true);
      return;
    }
    if (a === 'mod') {
      S.modalidad = b.getAttribute('data-v');
      paintAgendarForm(espInfo(evaluar().esp), { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (internacional)' });
      return;
    }
    if (a === 'chip') {
      var v = b.getAttribute('data-v');
      if (!inputMode) return;
      if (inputMode.tipo === 'chips_multi') {
        var exclusiva = b.getAttribute('data-excl') === '1';
        inputMode.selected = toggleMulti(inputMode.selected || [], v, exclusiva);
        paintComposer();
        return;
      }
      clearComposer();
      handleSingle(v);
      return;
    }
    if (a === 'multi-ok') {
      if (!inputMode || !(inputMode.selected || []).length) return;
      var sel = inputMode.selected.slice();
      clearComposer();
      handleMulti(sel);
    }
  });

  root.addEventListener('change', function (ev) {
    var t = ev.target;
    var a = t.getAttribute('data-os');
    if (a === 'cons-tele') S.consTele = t.checked;
    else if (a === 'compartir') S.compartir = t.checked;
    else if (a === 'cons-datos') S.consDatos = t.checked;
    else if (a === 'cons-adj') {
      S.consAdjuntos = t.checked;
      paintComposer();
      return;
    } else return;
    if (S.fase === 'agendar') {
      paintAgendarForm(espInfo(evaluar().esp), { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (internacional)' });
    }
  });

  root.addEventListener('submit', function (ev) {
    var form = ev.target.closest('[data-os="text-form"]');
    if (!form) return;
    ev.preventDefault();
    if (busy || !inputMode) return;
    var ta = form.querySelector('#os-text');
    var text = (ta && ta.value || '').trim();
    if (inputMode.tipo === 'text' && text.length < 3) { ta.focus(); return; }
    clearComposer();
    handleText(text);
  });

  function handleSingle(v) {
    if (v === 'reiniciar') { reset(); start(); return; }
    if (v === 'alarma_error') { goBack(); return; }
    if (S.fase === 'inicio') { afterEdad(v); return; }
    if (S.fase === 'pais') { afterPais(v); return; }
    if (S.fase === 'sexo') { afterSexo(v); return; }
    if (S.fase === 'categoria') { afterCategoria(v); return; }
    if (S.fase === 'trat_resultado') { afterTratResultado(v); return; }
    if (S.fase === 'pregunta') { afterPregunta(v); return; }
    if (S.fase === 'urgencia' && (v === 'adulto' || v === 'menor')) { afterEdad(v); return; }
  }

  function handleMulti(sel) {
    if (S.fase === 'alarmas') { afterAlarmas(sel); return; }
    if (S.fase === 'pregunta') { afterPregunta(sel); return; }
    if (S.fase === 'antecedentes') { afterAntecedentes(sel); return; }
    if (S.fase === 'toxicos') { afterToxicos(sel); return; }
    if (S.fase === 'gineco') { afterGineco(sel); return; }
  }

  function handleText(text) {
    if (S.fase === 'motivo') { afterMotivo(text); return; }
    if (S.fase === 'tratamientos') { afterTratamientos(text); return; }
    if (S.fase === 'trat_detalle') { afterTratDetalle(text); return; }
    if (S.fase === 'quirurgicos') { afterQuirurgicos(text); return; }
    if (S.fase === 'alergias') { afterAlergias(text); return; }
    if (S.fase === 'medicamentos') { afterMedicamentos(text); return; }
    if (S.fase === 'familiares') { afterFamiliares(text); return; }
  }

  // ---------- Sidebar booking ----------
  var $ = window.jQuery;

  function abrirAgenda() {
    var e = espInfo(evaluar().esp);
    var abridor = document.createElement('button');
    abridor.type = 'button';
    abridor.className = 'open-sidebar-appointment-general hidden';
    document.body.appendChild(abridor);
    abridor.click();
    abridor.remove();
    if ($) {
      var $sel = $('#specialtyAppointment');
      if ($sel.length && e.especialidad) {
        var hasOpt = $sel.find('option').filter(function () { return this.value === e.especialidad; }).length > 0;
        if (hasOpt && $sel.val() !== e.especialidad) {
          $sel.val(e.especialidad).trigger('change');
          if ($.fn.niceSelect) $sel.niceSelect('update');
        }
      }
      var id = S.modalidad === 'telemedicina' ? '#modalityAppointmentTelemedicinaGeneral' : '#modalityAppointmentPresencialGeneral';
      $(id).prop('checked', true).trigger('change');
    }
    track('abrir_agenda');
  }

  function valor(sel) {
    var el = document.querySelector(sel);
    return el ? String(el.value || '').trim() : '';
  }
  function codigoPais() {
    var r = document.querySelector('#form-schedule-appointment-general input[name="country_flag"]:checked');
    if (!r) return '';
    var lbl = r.closest('.custom-select-image-option');
    var m = ((lbl && lbl.getAttribute('data-name')) || '').match(/\(\+?(\d+)\)/);
    return m ? m[1] : '';
  }

  document.addEventListener('submit', function (ev) {
    if (!ev.target || ev.target.id !== 'form-schedule-appointment-general') return;
    var modEl = document.querySelector('input[name="modalityAppointmentGeneral"]:checked');
    var modalidad = modEl ? modEl.value : '';

    if (modalidad === 'telemedicina' && !S.consTele) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      alert('Para agendar una cita virtual primero debes aceptar el consentimiento de telemedicina.');
      var cerrar = document.querySelector('.close-sidebar-appointment-general');
      if (cerrar) cerrar.click();
      if (S.cat) { S.modalidad = 'telemedicina'; showAgendar(); }
      return;
    }

    if (!S.compartir || !S.consDatos || !S.cat || S.enviado) return;
    var nombre = valor('#nameAppointment');
    var tel = valor('#phoneAppointment').replace(/\D+/g, '');
    var fecha = valor('#dateAppointmentGeneral');
    var hora = valor('#timeAppointmentGeneral');
    var terminos = document.getElementById('termsAndConditions');
    if (nombre.length < 2 || !/^\d{8,12}$/.test(tel) || !codigoPais() || !fecha || !hora || (terminos && !terminos.checked)) return;

    var body = {
      id: S.id,
      categoria: S.cat.id,
      pais: S.pais,
      respuestas: S.resp,
      seguridad: seguridadIds(),
      sexo: S.sexo,
      relato: S.relato,
      antecedentes: S.antecedentes.filter(function (x) { return x !== 'ninguna'; }).join(', '),
      antecedentes_ids: S.antecedentes.filter(function (x) { return x !== 'ninguna'; }),
      quirurgicos: S.quirurgicos,
      toxicos: S.toxicos.filter(function (x) { return x !== 'ninguna'; }),
      gineco: S.gineco.filter(function (x) { return x !== 'ninguna'; }),
      familiares: S.familiares,
      alergias: S.alergias,
      medicamentos: S.medicamentos,
      tratamientos: S.tratamientos,
      trat_resultado: S.tratResultado,
      trat_detalle: S.tratDetalle,
      // Adjuntos: metadatos + dataUrl solo en preview/simulado; producción A/B pendiente
      adjuntos: S.adjuntos.map(function (a) {
        return { name: a.name, type: a.type, size: a.size, kind: a.kind };
      }),
      cita: { nombre: nombre, telefono: codigoPais() + tel, fecha: fecha, hora: hora, modalidad: modalidad, tipo_cita: valor('#specialtyAppointment') },
      consentimientos: { datos: true, telemedicina: modalidad === 'telemedicina' && S.consTele, adjuntos: !!S.consAdjuntos && S.adjuntos.length > 0, version: C.consentVersion },
      web: ''
    };
    S.enviado = true;
    try {
      fetch(C.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'omit'
      }).catch(function () { S.enviado = false; });
    } catch (err) { S.enviado = false; }
    track('preconsulta_enviada');
  }, true);

  reset();
  start();
})();
