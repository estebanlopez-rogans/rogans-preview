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
  function farmaciaUrl(term) {
    var f = D.farmacia || {};
    var base = (f.url || 'https://farminova24.com').replace(/\/+$/, '');
    var utm = f.utm || 'utm_source=rogansya&utm_medium=orientacion&utm_campaign=sintomas';
    if (f.buscar && term) return base + f.buscar + encodeURIComponent(term) + '&' + utm;
    return base + '/?' + utm;
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
      alarmas: [], qi: 0, resp: {}, notas: {},
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
    var el = document.createElement('div');
    el.id = 'os-sticky-book';
    el.className = 'os-sticky-book';
    el.setAttribute('role', 'region');
    if (lastMotor && lastMotor.urgencias) {
      el.setAttribute('aria-label', 'Ir a urgencias');
      el.innerHTML = '<a class="os-sticky-cta os-sticky-urgent" id="URGENCIAS-ROGANS-ORIENTACIONSINTOMAS-V1-STICKY" href="tel:123">Ir a urgencias / llamar al 123</a>';
    } else {
      el.setAttribute('aria-label', 'Agendar cita con medicina general');
      var price = '';
      if (tienePrecio()) {
        var pr = precioPromo();
        price = '<div class="os-sticky-price"><s>' + esc(pr.regularCop) + '</s> <strong>' + esc(pr.promoCop) + '</strong>' +
          '<span class="os-sticky-code">código ' + esc(pr.code) + '</span></div>';
      }
      el.innerHTML = price +
        '<button type="button" class="os-sticky-cta" data-os="agendar" data-agenda="general" data-src="sticky" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-STICKY">Agendar cita con medicina general</button>';
    }
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

    // Last bot message becomes focus; earlier go to history (above, out of view until scroll up).
    // En el resultado el hilo se queda completo y la respuesta va debajo, como un mensaje más.
    var shellNow = document.getElementById('os-shell');
    var resultMode = !!(shellNow && shellNow.classList.contains('is-result'));
    var focusIdx = -1;
    if (!resultMode) {
      for (var i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'bot' && !msgs[i].typing) { focusIdx = i; break; }
      }
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
    var multiActions = '';

    if (m.tipo === 'chips' || m.tipo === 'confirm') {
      // Few chips → keep in sticky footer for one-tap; many → scrollable options.
      // Con texto libre, los chips van arriba y el campo queda en el pie.
      var n = (m.opciones || []).length;
      var chips = '<div class="os-chips' + (n > 4 || m.textoLibre ? ' os-chips-stack' : '') + '" role="group">';
      (m.opciones || []).forEach(function (o) {
        chips += '<button type="button" class="os-chip' + (o.primary ? ' os-chip-primary' : '') + (o.sugerido ? ' is-sugerido' : '') + '" data-os="chip" data-v="' + esc(o.v) + '">' + esc(o.t) +
          (o.sugerido ? ' <span class="os-tag-sug">Sugerido</span>' : '') + '</button>';
      });
      chips += '</div>';
      if (n > 4 || m.textoLibre) {
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
      var exclHtml = '';
      exclOps.forEach(function (o) {
        var on = (m.selected || []).indexOf(o.v) !== -1;
        exclHtml += '<button type="button" class="os-chip' + (on ? ' is-on' : '') + '" data-os="chip" data-v="' + esc(o.v) + '" data-excl="1">' + esc(o.t) + '</button>';
      });
      var contBtn = '<button type="button" class="os-chip os-chip-primary os-send-block" data-os="multi-ok"' + ((m.selected || []).length ? '' : ' disabled') + '>Continuar</button>';
      multiActions = m.textoLibre
        ? { excl: exclHtml, cont: contBtn }
        : '<div class="os-composer-actions">' + exclHtml + contBtn + '</div>';
    }
    if (m.textoLibre && (m.tipo === 'chips' || m.tipo === 'chips_multi' || m.tipo === 'confirm')) {
      // Campo primero. Los botones van al final y ocupan todo el ancho.
      var pack = (m.tipo === 'chips_multi' && multiActions && multiActions.excl) ? multiActions : null;
      if (pack && pack.excl) foot += '<div class="os-composer-actions">' + pack.excl + '</div>';
      foot += '<form data-os="text-form" class="os-text-form os-text-libre os-text-stack">' +
        '<label class="os-libre-label" for="os-text">Si no aparece, escríbalo con sus palabras</label>' +
        '<textarea id="os-text" class="os-text" rows="2" maxlength="500" placeholder="' + esc(m.placeholder || 'Escríbalo aquí') + '"></textarea>' +
        '<div class="os-actions-last">';
      if (pack) foot += pack.cont;
      foot += '<button type="submit" class="os-chip os-chip-primary os-send os-send-block">Enviar</button></div></form>';
      multiActions = '';
    } else if (multiActions) {
      foot += multiActions;
    }
    if (!m.textoLibre && (m.tipo === 'text' || m.tipo === 'text_optional')) {
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
      notas: JSON.parse(JSON.stringify(S.notas || {})),
      antecedentes: S.antecedentes.slice(), quirurgicos: S.quirurgicos,
      toxicos: S.toxicos.slice(), gineco: S.gineco.slice(), familiares: S.familiares,
      alergias: S.alergias, medicamentos: S.medicamentos,
      tratamientos: S.tratamientos, tratResultado: S.tratResultado, tratDetalle: S.tratDetalle,
      catId: S.cat ? S.cat.id : null,
      lugar: S.lugar || null
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

  function despuesDeMotivo(text) {
    pushHist();
    sayUser(text);
    S.relato = text;
    focusHtml = '';
    var lugar = inferirLugar(text);
    var catId = (lugar && lugar.categoria) || '';
    if (!catId) {
      var rel = categoriasRelevantes();
      catId = rel.sugerido || 'medicina_general';
    }
    S.lugar = lugar;
    S.cat = catById(catId) || catById('medicina_general');
    askAlarmas();
  }
  function afterMotivo(text) {
    despuesDeMotivo(text);
  }
  function dist1(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
    var i = 0, j = 0, mal = 0;
    while (i < a.length && j < b.length) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      mal++;
      if (mal > 1) return false;
      if (a.length === b.length) { i++; j++; }
      else if (a.length > b.length) i++;
      else j++;
    }
    return true;
  }
  function inferirLugar(texto) {
    var txt = ' ' + normTxt(texto).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
    var palabras = txt.trim().split(/\s+/);
    var best = null, bestLen = 0;
    (D.lugares || []).forEach(function (lugar) {
      (lugar.claves || []).forEach(function (raw) {
        var c = normTxt(raw);
        if (!c) return;
        var ok = c.length < 5 ? txt.indexOf(' ' + c + ' ') !== -1 : txt.indexOf(c) !== -1;
        if (!ok && c.length >= 5) {
          ok = palabras.some(function (w) { return dist1(w, c); });
        }
        if (ok && c.length >= bestLen) { best = lugar; bestLen = c.length; }
      });
    });
    return best;
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
  // Áreas que coinciden con el relato y con las respuestas ya elegidas.
  // Las específicas (espalda, manchas, caída) tapan a las amplias (cara).
  function textoParaAreas() {
    var partes = [S.relato || ''];
    Object.keys(S.notas || {}).forEach(function (k) { partes.push(S.notas[k] || ''); });
    return partes.join(' ');
  }
  function clavesEnTexto(claves, txt) {
    var padded = txt.charAt(0) === ' ' ? txt : (' ' + txt + ' ');
    for (var i = 0; i < claves.length; i++) {
      var c = normTxt(claves[i]);
      if (!c) continue;
      if (c.length < 5) {
        if (padded.indexOf(' ' + c + ' ') !== -1) return true;
      } else if (padded.indexOf(c) !== -1) return true;
    }
    return false;
  }
  function areasActivas() {
    var R = D.relevancia || {};
    var def = R.areas || {};
    var txt = ' ' + normTxt(textoParaAreas()).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
    var desdeTexto = [];
    Object.keys(def).forEach(function (id) {
      if (clavesEnTexto(def[id].claves || [], txt)) desdeTexto.push(id);
    });
    var desdeResp = [];
    var mapa = R.respuestaArea || {};
    if (S.cat) {
      Object.keys(S.resp || {}).forEach(function (pid) {
        [].concat(S.resp[pid] || []).forEach(function (v) {
          var area = mapa[S.cat.id + '.' + pid + '.' + v];
          if (area && desdeResp.indexOf(area) === -1) desdeResp.push(area);
        });
      });
    }
    // La respuesta elegida manda sobre el texto para los pasos siguientes.
    var base = desdeResp.length ? desdeResp : desdeTexto;
    var especificas = base.filter(function (id) { return def[id] && def[id].especifico; });
    var usar = especificas.length ? especificas : base;
    return { usar: usar, huboTexto: desdeTexto.length > 0 || desdeResp.length > 0 };
  }
  function categoriasRelevantes() {
    var R = D.relevancia || {};
    var info = areasActivas();
    var ids = [];
    var def = R.areas || {};
    if (info.huboTexto && info.usar.length) {
      info.usar.forEach(function (id) {
        ((def[id] && def[id].categorias) || []).forEach(function (cid) {
          if (ids.indexOf(cid) === -1) ids.push(cid);
        });
      });
    }
    if (!ids.length) ids = (R.categoriasFallback || []).slice();
    return { ids: ids, sugerido: info.huboTexto && info.usar.length ? ids[0] : '' };
  }
  function filtrarOpciones(catId, pregId, opciones) {
    var mapa = ((((D.relevancia || {}).opciones || {})[catId] || {})[pregId]);
    if (!mapa) return opciones;
    var info = areasActivas();
    if (!info.usar.length) {
      if (mapa._fallback && mapa._fallback.length) {
        return opciones.filter(function (o) { return o.exclusiva || mapa._fallback.indexOf(o.v) !== -1; });
      }
      return opciones;
    }
    var allowed = {};
    var algunaLista = false;
    info.usar.forEach(function (area) {
      if (!Object.prototype.hasOwnProperty.call(mapa, area)) return;
      algunaLista = true;
      (mapa[area] || []).forEach(function (v) { allowed[v] = 1; });
    });
    if (!algunaLista) {
      if (mapa._fallback && mapa._fallback.length) {
        return opciones.filter(function (o) { return o.exclusiva || mapa._fallback.indexOf(o.v) !== -1; });
      }
      return opciones;
    }
    return opciones.filter(function (o) { return o.exclusiva || allowed[o.v]; });
  }
  function antecedentesFiltrados() {
    var ops = (D.antecedentes || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; });
    var mapa = ((D.relevancia || {}).antecedentes) || {};
    var info = areasActivas();
    if (!info.usar.length || !mapa) return ops;
    var allowed = {};
    var alguna = false;
    info.usar.forEach(function (area) {
      if (!mapa[area]) return;
      alguna = true;
      (mapa[area] || []).forEach(function (v) { allowed[v] = 1; });
    });
    if (!alguna) return ops;
    return ops.filter(function (o) { return o.exclusiva || allowed[o.v]; });
  }
  function opcionesDePregunta(p) {
    var ops = (p.opciones || []).map(function (o) { return { v: o.v, t: o.t, exclusiva: !!o.exclusiva }; });
    return filtrarOpciones(S.cat ? S.cat.id : '', p.id, ops);
  }
  function categoriaOpciones() {
    var rel = categoriasRelevantes();
    var list = [];
    rel.ids.forEach(function (id) {
      var c = catById(id);
      if (c) list.push(c);
    });
    if (!list.length) list = D.categorias.slice();
    return list.map(function (c) { return { v: c.id, t: c.titulo, sugerido: c.id === rel.sugerido }; });
  }

  function askCategoria() {
    // La pregunta de área se eliminó: si el relato no alcanza, queda medicina general.
    if (!S.cat) S.cat = catById('medicina_general');
    askAlarmas();
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
    focusHtml = '';
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

  function respuestaYaDicha(p) {
    if (!p) return '';
    var lugar = S.lugar;
    var mapa = (lugar && lugar.respuestas) || {};
    var v = mapa[p.id] || '';
    if (!v) return '';
    var existe = (p.opciones || []).some(function (o) { return o.v === v; });
    return existe ? v : '';
  }
  function askPregunta() {
    var qs = (S.cat && S.cat.preguntas) || [];
    while (S.qi < qs.length) {
      var previa = respuestaYaDicha(qs[S.qi]);
      if (!previa) break;
      S.resp[qs[S.qi].id] = [previa];
      S.qi++;
    }
    if (S.qi >= qs.length) {
      askAntecedentes();
      return;
    }
    S.fase = 'pregunta';
    focusHtml = '';
    var p = qs[S.qi];
    botThen(esc(p.texto), function () {
      var ops = opcionesDePregunta(p);
      var isMulti = !!(p.multi || p.tipo === 'multi');
      if (isMulti) {
        ask({ tipo: 'chips_multi', q: p.texto, selected: [], textoLibre: true, placeholder: 'O escríbalo con sus palabras', opciones: ops });
      } else {
        ask({ tipo: 'chips', q: p.texto, textoLibre: true, placeholder: 'O escríbalo con sus palabras', opciones: ops });
      }
    });
  }

  function afterCategoriaLibre(text) {
    pushHist();
    var prev = S.relato;
    S.relato = text;
    var solo = categoriasRelevantes();
    S.relato = (prev ? prev + ' ' : '') + text;
    var id = solo.sugerido;
    if (!id) {
      var rel = categoriasRelevantes();
      id = rel.sugerido || 'medicina_general';
    }
    var c = catById(id);
    if (!c) return;
    sayUser(text);
    S.cat = c;
    askAlarmas();
  }

  function afterPreguntaLibre(text) {
    pushHist();
    var qs = S.cat.preguntas;
    var p = qs[S.qi];
    var txt = ' ' + normTxt(text).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
    var hits = [];
    opcionesDePregunta(p).forEach(function (o) {
      if (o.exclusiva) return;
      if (clavesEnTexto([o.v, o.t], txt)) hits.push(o.v);
    });
    sayUser(text);
    if (hits.length) {
      S.resp[p.id] = (p.tipo === 'multi' || p.multi) ? hits : [hits[0]];
    } else {
      S.notas[p.id] = text;
      S.relato = (S.relato ? S.relato + ' ' : '') + text;
    }
    S.qi++;
    askPregunta();
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
        textoLibre: true,
        placeholder: 'Otra enfermedad, o escríbala aquí',
        opciones: antecedentesFiltrados()
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
      if (!sel.length && S.notas && S.notas[p.id]) {
        rows.push({ q: p.texto || p.t || p.id, a: S.notas[p.id] });
        return;
      }
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
    html += '</dl></section>';
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
      '<button type="button" class="os-meds-consult-cta" data-os="agendar" data-src="meds" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-4">Agendar consulta de seguimiento</button></div>';

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
        html += '<button type="button" class="os-rx-cta" data-os="agendar" data-src="rx" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-5">Obtener fórmula en consulta de seguimiento</button>';
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
    html += '<ul class="os-exam-list">';
    r.examenes.forEach(function (x) {
      html += '<li>' + esc(x) + '</li>';
    });
    html += '</ul>';
    html += '<p class="os-card-note">El médico decide cuáles ordenar según la valoración.</p>';
    html += '</section>';
    return html;
  }

  function referralCardHtml(e) {
    var html = '<section class="os-card os-card-ref">';
    html += '<header class="os-card-head">' + iconHtml('user-round') + '<div><p class="os-card-kicker">Remisión</p><h3 class="os-card-title">Especialista sugerido</h3></div></header>';
    html += '<p class="os-card-lead"><strong>' + esc(e.nombre) + '</strong></p>';
    html += '<p class="os-muted">Te orientamos hacia esta especialidad según tus respuestas. El médico de seguimiento puede confirmar o ajustar la remisión.</p>';
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
    html += '<button type="button" class="os-book-cta os-book-cta-xl" data-os="agendar" data-src="hero" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-1">Agendar consulta de seguimiento <i data-lucide="arrow-right" class="w-4 h-4" aria-hidden="true"></i></button>';
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
    html += '<button type="button" class="os-chip os-chip-primary os-book-cta" data-os="agendar" data-src="final" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-2">Agendar consulta de seguimiento</button>';
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
    var top = (arguments[2] && arguments[2].diffs && arguments[2].diffs[0]) ? arguments[2].diffs[0].nombre : (r.causas.length ? causaLabel(r.causas[0]) : '');
    var txt = mot ? 'Nos contaste: «' + esc(mot) + '»' + (dur ? ' (' + esc(lc1(dur.t)) + ')' : '') + '. ' : '';
    txt += 'Según tus respuestas' + (area ? ' sobre <strong>' + esc(area) + '</strong>' : '');
    txt += top ? ', lo más probable es <strong>' + esc(top) + '</strong>.' : '.';
    txt += ' Un médico puede confirmarlo y formularte en la consulta de seguimiento.';
    return '<p class="os-result-brief">' + txt + '</p>';
  }

  function textoPlano(bits) {
    return ' ' + normTxt(bits.join(' ')).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
  }
  function textoMotivo() {
    var bits = [S.relato || '', S.tratamientos || ''];
    Object.keys(S.notas || {}).forEach(function (k) { bits.push(S.notas[k] || ''); });
    if (S.cat) {
      (S.cat.preguntas || []).forEach(function (p) {
        [].concat(S.resp[p.id] || []).forEach(function (v) { bits.push(v); });
      });
    }
    return textoPlano(bits);
  }
  function textoHistoria() {
    var bits = [S.familiares || '', S.alergias || '', S.quirurgicos || '', S.medicamentos || ''];
    (S.antecedentes || []).forEach(function (id) {
      var a = (D.antecedentes || []).filter(function (x) { return x.id === id; })[0];
      bits.push(id);
      if (a) bits.push(a.texto || '');
    });
    (S.toxicos || []).forEach(function (id) { bits.push(id); });
    return textoPlano(bits);
  }
  function textoClinico() {
    return textoPlano([textoMotivo(), textoHistoria()]);
  }
  function correrMotor() {
    var M = D.motor;
    if (!M || !(M.condiciones || []).length) return null;
    var motivo = textoMotivo();
    var historia = textoHistoria();
    var txt = textoPlano([motivo, historia]);
    var banderas = [];
    (M.banderas || []).forEach(function (b) {
      var ok = clavesEnTexto(b.claves || [], motivo);
      if (ok && b.y && b.y.length) ok = clavesEnTexto(b.y, motivo);
      if (ok) banderas.push(b);
    });
    if ((S.alarmas || []).length) {
      banderas.unshift({ nivel: 'urgencias', razon: 'Marcó una señal de alarma. Eso va primero, antes que cualquier medicamento.' });
    }
    var scored = [];
    var otros = [];
    (M.condiciones || []).forEach(function (c) {
      var hit = clavesEnTexto(c.claves || [], motivo);
      if (c.y && c.y.length) hit = hit && clavesEnTexto(c.y, motivo);
      if (!hit) {
        if (c.explicito && clavesEnTexto(c.claves || [], historia)) {
          otros.push(c.nombre);
        }
        return;
      }
      var peso = c.peso || 40;
      var extra = '';
      (c.modificadores || []).forEach(function (m) {
        var keys = m.si || [];
        var hit = m.todos
          ? keys.every(function (k) { return clavesEnTexto([k], txt); })
          : keys.some(function (k) { return clavesEnTexto([k], txt); });
        if (hit) {
          peso += m.delta || 0;
          if (!extra && m.nota) extra = m.nota;
        }
      });
      scored.push({ c: c, peso: peso, extra: extra });
    });
    if (scored.some(function (s) { return s.c.id === 'cefalea_subita'; })) {
      scored = scored.filter(function (s) { return s.c.id !== 'cefalea_comun'; });
    }
    scored.sort(function (a, b) { return b.peso - a.peso; });
    if (scored.length && scored[0].c.explicito) {
      var top = scored[0];
      scored = scored.filter(function (s, i) {
        return i === 0 || s.c.linea === top.c.linea || s.peso >= top.peso - 20;
      });
    }
    var diffs = [];
    scored.slice(0, 3).forEach(function (s, i) {
      var nivel = s.peso >= 80 ? 'alta' : (s.peso >= 50 ? 'media' : 'baja');
      if (i === 0 && (s.c.explicito || s.peso >= 70)) nivel = 'alta';
      if (i > 0 && nivel === 'alta') nivel = 'media';
      var porQue = s.c.porQue || '';
      if (s.extra) porQue = (porQue ? porQue + ' ' : '') + s.extra;
      diffs.push({ nombre: s.c.nombre, nivel: nivel, porQue: porQue });
    });
    var lead = scored.length ? scored[0].c : null;
    if (lead && lead.acompanantes) {
      lead.acompanantes.forEach(function (a) {
        if (a.si && a.si.length && !a.si.some(function (k) { return clavesEnTexto([k], txt); })) return;
        if (!a.si && diffs.length >= 3) return;
        diffs.push({ nombre: a.nombre, nivel: a.nivel || 'baja', porQue: a.porQue || '' });
      });
    }
    diffs = diffs.slice(0, 4);
    var triage = 'programada';
    var triageRazon = 'Con lo que contó, se organiza una cita. No es una urgencia si no aparecen las señales de alarma.';
    var triageNivel = 'programada';
    if (banderas.length) {
      triageNivel = 'urgencias';
      triage = 'Urgencias ya';
      triageRazon = banderas[0].razon;
    } else if (lead) {
      triageNivel = lead.triage || 'programada';
      triageRazon = lead.triageRazon || triageRazon;
      (lead.triageSi || []).forEach(function (t) {
        if ((t.si || []).some(function (k) { return clavesEnTexto([k], txt); })) {
          triageNivel = t.nivel;
          triageRazon = t.razon;
        }
      });
      triage = { urgencias: 'Urgencias ya', pronto: 'Consulta pronto (24 a 72 horas)', programada: 'Consulta programada', autocuidado: 'Autocuidado y vigilancia' }[triageNivel] || 'Consulta programada';
    }
    return {
      diffs: diffs,
      otros: otros,
      lead: lead,
      triage: triage,
      triageNivel: triageNivel,
      triageRazon: triageRazon,
      examenes: lead ? (lead.examenes || []) : [],
      especialistas: lead ? (lead.especialistas || []) : [],
      otc: lead ? (lead.otc || []) : null,
      rxNota: lead ? (lead.rxNota || '') : '',
      urgencias: triageNivel === 'urgencias'
    };
  }
  function triageCardHtml(motor) {
    if (!motor) return '';
    var html = '<section class="os-triage is-' + esc(motor.triageNivel) + '" role="status">';
    html += '<p class="os-triage-kicker">Prioridad</p>';
    html += '<p class="os-triage-level">' + esc(motor.triage) + '</p>';
    html += '<p class="os-triage-why">' + esc(motor.triageRazon) + '</p>';
    html += '</section>';
    return html;
  }
  function diffsCardHtml(motor) {
    if (!motor || !motor.diffs.length) return '';
    var html = '<section class="os-card os-card-causas">';
    html += '<header class="os-card-head">' + iconHtml('stethoscope') + '<div><p class="os-card-kicker">Orientación</p><h3 class="os-card-title">' + esc(motor.titulo || 'Qué puede estar pasando') + '</h3></div></header>';
    html += '<ul class="os-causa-list">';
    motor.diffs.forEach(function (d) {
      html += '<li class="os-causa-item"><div class="os-causa-top"><strong>' + esc(d.nombre) + '</strong>';
      html += '<span class="os-likeli os-likeli-' + esc(d.nivel) + '">' + esc(d.nivel === 'alta' ? 'Probabilidad alta' : (d.nivel === 'media' ? 'Probabilidad media' : 'Probabilidad baja')) + '</span></div>';
      html += '<div class="os-likeli-bar is-' + esc(d.nivel) + '" aria-hidden="true"><span></span></div>';
      if (d.porQue) html += '<p class="os-causa-desc">' + esc(d.porQue) + '</p>';
      html += '</li>';
    });
    html += '</ul>';
    html += '<p class="os-card-note">No es un diagnóstico. Es el orden en que un médico revisaría sus respuestas. La consulta lo confirma o lo cambia.</p>';
    html += '</section>';
    return html;
  }
  function examsMotorHtml(motor) {
    var list = (motor && motor.examenes) || [];
    if (!list.length) return '';
    var html = '<section class="os-card os-card-exams">';
    html += '<header class="os-card-head">' + iconHtml('flask-conical') + '<div><p class="os-card-kicker">Estudios</p><h3 class="os-card-title">Exámenes que podría considerar</h3></div></header>';
    html += '<p class="os-card-lead">Son ideas para conversar con el médico, no una orden. El médico decide cuáles pedir.</p><ul class="os-exam-list">';
    list.forEach(function (x, i) {
      html += '<li><span>' + esc(x.nombre) + '</span>';
      if (x.buscar) {
        html += ' <a class="os-pharm-link" id="FARMACIA-ROGANS-ORIENTACIONSINTOMAS-V1-EX' + (i + 1) + '" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaUrl(x.buscar)) + '">Ver en Farminova</a>';
      }
      html += '</li>';
    });
    html += '</ul><p class="os-card-note">El enlace abre la búsqueda en Farminova24, la farmacia aliada. No todos los estudios se compran ahí; si no aparece, el médico le indica dónde hacerlo.</p></section>';
    return html;
  }
  function specsMotorHtml(motor) {
    var list = (motor && motor.especialistas) || [];
    if (!list.length) return '';
    var html = '<section class="os-card os-card-ref">';
    html += '<header class="os-card-head">' + iconHtml('user-round') + '<div><p class="os-card-kicker">Remisión</p><h3 class="os-card-title">A quién consultar</h3></div></header><ul class="os-causa-list">';
    list.forEach(function (s) {
      html += '<li class="os-causa-item"><strong>' + esc(s.nombre) + '</strong>';
      if (s.porQue) html += '<p class="os-causa-desc">' + esc(s.porQue) + '</p>';
      html += '</li>';
    });
    html += '</ul></section>';
    return html;
  }
  function medsMotorHtml(r, motor) {
    if (!motor || !motor.lead) return medsCardHtml(r);
    if (motor.urgencias) {
      return '<section class="os-card os-card-meds"><header class="os-card-head">' + iconHtml('pill') + '<div><p class="os-card-kicker">Cuidados</p><h3 class="os-card-title">Medicamentos</h3></div></header>' +
        '<p class="os-card-lead os-alerta">No se automedique. Con esta prioridad, el siguiente paso es urgencias, no una pastilla en casa.</p></section>';
    }
    var ids = motor.otc || [];
    var fake = { embarazo: r.embarazo, nivel: r.nivel, otc: [], rx: [] };
    ids.forEach(function (id) {
      var prod = (D.otc || {})[id];
      if (!prod) return;
      var seg = seguridadIds();
      if ((prod.excluir_si || []).some(function (x) { return seg.indexOf(x) !== -1; })) return;
      fake.otc.push(prod);
    });
    var html = medsCardHtml(fake);
    if (motor.rxNota) {
      html = html.replace('</section>', '<p class="os-card-note">' + esc(motor.rxNota) + '</p></section>');
    }
    return html;
  }

  function dxHeroHtml(motor) {
    if (!motor || !motor.diffs.length) return '';
    var d = motor.diffs[0];
    var etiqueta = d.nivel === 'alta' ? 'Lo más probable' : (d.nivel === 'media' ? 'Posible' : 'A considerar');
    var html = '<section class="os-dx">';
    html += '<p class="os-dx-kicker">' + esc(etiqueta) + '</p>';
    html += '<h2 class="os-dx-title">' + esc(d.nombre) + '</h2>';
    html += '<p class="os-dx-level">Probabilidad ' + esc(d.nivel) + '</p>';
    html += '<div class="os-likeli-bar is-' + esc(d.nivel) + '" aria-hidden="true"><span></span></div>';
    if (d.porQue) html += '<p class="os-dx-why">' + esc(d.porQue) + '</p>';
    html += '</section>';
    return html;
  }
  function otrosTemasHtml(motor) {
    var list = (motor && motor.otros) || [];
    if (!list.length) return '';
    var html = '<section class="os-card os-card-otros">';
    html += '<header class="os-card-head"><div><p class="os-card-kicker">Aparte</p><h3 class="os-card-title">Otros temas para hablar con su médico</h3></div></header>';
    html += '<p class="os-card-lead">No están relacionados con la consulta de hoy. No cambian la prioridad de este motivo.</p><ul class="os-exam-list">';
    list.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul></section>';
    return html;
  }
  var lastMotor = null;

  function etiquetaProb(n) {
    if (n === 'alta') return 'probabilidad alta';
    if (n === 'media') return 'probabilidad media';
    return 'probabilidad baja';
  }
  function fraseTriage(nivel) {
    return {
      urgencias: 'Esto es urgente: hay que atenderlo ya, no en una cita programada.',
      pronto: 'Conviene una consulta pronto, en las próximas 24 a 72 horas.',
      programada: 'No parece una urgencia. Se puede organizar una cita.',
      autocuidado: 'Por ahora puede vigilarse en casa y consultar si no cede.'
    }[nivel] || 'Se puede organizar una cita.';
  }
  function familiaresEnOtros(motor) {
    var fam = textoPlano([S.familiares || '']);
    if (!fam || /^ ningun/.test(fam)) return false;
    var nombres = {};
    ((motor && motor.otros) || []).forEach(function (n) { nombres[n] = 1; });
    var hit = false;
    (((D.motor && D.motor.condiciones) || [])).forEach(function (c) {
      if (!nombres[c.nombre]) return;
      if (clavesEnTexto(c.claves || [], fam)) hit = true;
    });
    return hit;
  }
  function listaLabels(pid, saltar) {
    return respLabels(pid).filter(function (x) { return !saltar || saltar.indexOf(x.v) === -1; });
  }
  function unirBajo(list) {
    return list.map(function (x) { return lc1(x.t); }).join(' y ');
  }
  function reflejoPaciente(motor) {
    var partes = [];
    var mot = String(S.relato || '').trim().replace(/[.]+$/, '');
    if (mot) partes.push('me cuenta que «' + mot + '»');
    var dur = listaLabels('desde');
    if (dur.length) partes.push('lleva así ' + unirBajo(dur));
    var inicio = listaLabels('inicio');
    if (inicio.length) partes.push('empezó ' + unirBajo(inicio));
    var mejora = listaLabels('mejora', ['nada']);
    if (mejora.length) partes.push('le alivia ' + unirBajo(mejora));
    var empeora = listaLabels('empeora', ['nada']);
    if (empeora.length) partes.push('lo empeora ' + unirBajo(empeora));
    var inten = listaLabels('intensidad')[0];
    if (inten) partes.push('la intensidad que marcó es ' + lc1(inten.t));
    if (S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      var tr = 'ya probó ' + S.tratamientos;
      if (S.tratResultado && S.tratResultado !== 'nada') tr += ' (' + lc1(tratResultadoLabel(S.tratResultado)) + ')';
      partes.push(tr);
    }
    var ants = (S.antecedentes || []).filter(function (id) { return id && id !== 'ninguna'; });
    if (ants.length) {
      var labels = ants.map(function (id) {
        var a = (D.antecedentes || []).filter(function (x) { return x.id === id; })[0];
        return a ? lc1(a.texto) : id;
      });
      partes.push('de su historia sí puede importar ' + labels.join(', '));
    }
    var fam = String(S.familiares || '').trim();
    if (fam && !/^ningun/i.test(fam)) {
      if (familiaresEnOtros(motor)) partes.push('hay un antecedente familiar que no explica este motivo; lo dejo al final');
      else partes.push('en la familia refiere «' + fam + '»');
    }
    var empatia = '';
    if (!(motor && motor.urgencias)) {
      var t = normTxt(mot);
      empatia = /duele|dolor|cabeza|espalda|caida|cabello|pelo/.test(t)
        ? 'Lamento que esté pasando por esto. '
        : 'Gracias por contarlo con ese detalle. ';
    }
    if (!partes.length) return empatia + 'Con lo que respondió armo una orientación, no un diagnóstico.';
    var cuerpo = partes[0].charAt(0).toUpperCase() + partes[0].slice(1);
    if (partes.length > 1) cuerpo += ': ' + partes.slice(1).join('; ');
    return empatia + cuerpo + '.';
  }
  function diffsEfectivos(r, motor) {
    if (motor && motor.diffs && motor.diffs.length) return motor.diffs;
    if (!r || esIndefinido(r)) return [];
    return (r.causas || []).slice(0, 4).map(function (k, i) {
      return { nombre: causaLabel(k), nivel: i === 0 ? 'alta' : (i === 1 ? 'media' : 'baja'), porQue: causaDesc(k) };
    });
  }
  function productosOtc(r, motor) {
    var seg = seguridadIds();
    var out = [];
    function pushProd(prod) {
      if (!prod) return;
      if ((prod.excluir_si || []).some(function (x) { return seg.indexOf(x) !== -1; })) return;
      out.push(prod);
    }
    if (motor && motor.lead) {
      (motor.otc || []).forEach(function (id) { pushProd((D.otc || {})[id]); });
      return out;
    }
    (r.otc || []).forEach(pushProd);
    return out;
  }
  function bloque(html) {
    return '<div class="os-stream-block">' + html + '</div>';
  }
  function tienePrecio() {
    var p = C.precio || D.precio || {};
    return p.cop != null || p.usd != null;
  }
  function svgIcon(name) {
    var paths = {
      pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
      clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
      hand: '<path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V7.5a1.5 1.5 0 0 1 3 0V13c0 3-2 6-5.5 6S6 16 6 13v-2.5a1.5 1.5 0 0 1 3 0V11"/>',
      flask: '<path d="M9 3h6"/><path d="M10 3v5L5.5 18A3 3 0 0 0 8 22h8a3 3 0 0 0 2.5-4L14 8V3"/>',
      user: '<circle cx="12" cy="8" r="3"/><path d="M5 19c1.5-3 3.8-4.5 7-4.5S17.5 16 19 19"/>',
      alert: '<path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4"/><path d="M12 16.5h.01"/>',
      list: '<path d="M8 7h11M8 12h11M8 17h11"/><path d="M4 7h.01M4 12h.01M4 17h.01"/>',
      shield: '<path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3z"/><path d="m9 12 2 2 4-4"/>'
    };
    return '<span class="os-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.pulse) + '</svg></span>';
  }
  function secHead(icon, title, id) {
    return '<header class="os-sec-head">' + svgIcon(icon) + '<h3' + (id ? ' id="' + id + '"' : '') + '>' + title + '</h3></header>';
  }
  function ctaAgenda(label, agenda, id) {
    return '<button type="button" class="os-cta" data-os="agendar" data-agenda="' + esc(agenda || 'general') + '" data-src="consulta" id="' + id + '">' + esc(label) + '</button>';
  }
  function seccionProbable(diffs) {
    var html = '<section class="os-sec">' + secHead('pulse', 'Lo más probable');
    if (!diffs.length) {
      html += '<p>Con lo que contó <strong>no hay una sola posibilidad clara</strong>. Un médico revisa el caso en la consulta; esta orientación no cierra un diagnóstico.</p>';
      var pos = posiblesGenerales(evaluar());
      if (pos.length) {
        html += '<p>Mientras tanto, el médico suele revisar:</p><ul>';
        pos.forEach(function (x) { html += '<li>' + esc(x) + '</li>'; });
        html += '</ul>';
      }
      html += '</section>';
      return bloque(html);
    }
    var d = diffs[0];
    html += '<p>Lo que más encaja con lo que usted contó es <strong>' + esc(d.nombre) + '</strong>, con <strong>' + esc(etiquetaProb(d.nivel)) + '</strong>.';
    if (d.porQue) html += ' ' + esc(d.porQue);
    html += '</p>';
    if (diffs.length > 1) {
      html += '<p>Otras posibilidades, de mayor a menor:</p><ul>';
      diffs.slice(1).forEach(function (o) {
        html += '<li><strong>' + esc(o.nombre) + '</strong> — ' + esc(etiquetaProb(o.nivel)) + '.';
        if (o.porQue) html += ' ' + esc(o.porQue);
        html += '</li>';
      });
      html += '</ul>';
    }
    html += '<p>Es un orden para la consulta, <strong>no un diagnóstico</strong>.</p></section>';
    return bloque(html);
  }
  function seccionUrgencia(r, motor) {
    var nivel = (motor && motor.triageNivel) || 'programada';
    var html = '<section class="os-sec">' + secHead('clock', 'Qué tan urgente es');
    html += '<p><strong>' + esc(motor ? motor.triage : 'Consulta programada') + '.</strong> ' + esc(fraseTriage(nivel)) + '</p>';
    if (motor && motor.triageRazon) html += '<p>' + esc(motor.triageRazon) + '</p>';
    if (r && r.nivel === 'prioritaria' && nivel !== 'urgencias') {
      html += '<p>Marcó un dato que <strong>conviene valorar pronto</strong>, sin dejarlo pasar varias semanas.</p>';
    }
    html += '</section>';
    return bloque(html);
  }
  function seccionMientras(r, motor) {
    var html = '<section class="os-sec">' + secHead('hand', 'Qué puede hacer mientras tanto');
    if (motor && motor.urgencias) {
      html += '<p><strong>No se automedique.</strong> Con esta prioridad el siguiente paso es urgencias, no una pastilla en casa.</p></section>';
      return bloque(html);
    }
    if (r.embarazo) {
      html += '<p>En embarazo o lactancia <strong>no orientamos automedicación</strong>. Su médico le indica qué puede usar.</p></section>';
      return bloque(html);
    }
    var cuidado = (motor && motor.lead && motor.lead.cuidados) || (S.cat && S.cat.nota) || '';
    if (cuidado) html += '<p>' + esc(cuidado) + '</p>';
    if (S.tratResultado === 'funciono' && S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      html += '<p>Como le funcionó <strong>' + esc(S.tratamientos) + '</strong>' +
        (S.tratDetalle ? ' (' + esc(S.tratDetalle) + ')' : '') +
        ', si es de venta libre puede seguirlo <strong>como indica la etiqueta</strong>, sin alargar el tiempo máximo.</p>';
    } else if (S.tratResultado === 'efectos' && S.tratamientos) {
      html += '<p>Por los efectos que notó con <strong>' + esc(S.tratamientos) + '</strong>, no lo repita. Si usa otra opción de venta libre, lea antes el inserto.</p>';
    }
    var prods = productosOtc(r, motor);
    if (prods.length) {
      html += '<p>De <strong>venta libre</strong>, si la etiqueta no se lo contraindica:</p><ul>';
      prods.forEach(function (p) {
        html += '<li><strong>' + esc(p.nombre) + '</strong>.';
        if (p.uso) html += ' ' + esc(p.uso);
        html += ' Siga la <strong>dosis y los días que indica la etiqueta</strong>; esta orientación no formula.';
        var avisos = p.advertencias || p.avisos || [];
        if (avisos.length) html += ' ' + esc(avisos[0]);
        html += ' <a class="os-answer-link" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaUrl(p.busqueda || p.nombre)) + '">Ver en Farminova</a>';
        html += '</li>';
      });
      html += '</ul>';
      html += '<p>No lo combine con otro producto del mismo principio activo. Si no mejora, empeora o aparece algo nuevo, consulte.</p>';
    } else if (!cuidado) {
      html += '<p>No hay un cuidado de venta libre claro para esta combinación de respuestas.</p>';
    }
    var rx = (motor && motor.rxNota) || '';
    if (!rx && r.rx && r.rx.length) {
      rx = 'Su médico podría considerar ' + r.rx.map(function (p) { return p.nombre; }).join(', ') + '. No los empiece por su cuenta ni calcule una dosis.';
    }
    if (rx) {
      var rxHtml = esc(rx).replace(/su médico podría considerar/gi, '<strong>$&</strong>');
      html += /^si\b/i.test(rx) ? '<p>' + rxHtml + '</p>' : '<p><strong>Si no mejora:</strong> ' + rxHtml + '</p>';
      html += '<p><button type="button" class="os-answer-textbtn" data-os="agendar" data-src="rx" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-5">Hablarlo en la consulta</button></p>';
    }
    if (prods.length || cuidado) {
      html += '<p><button type="button" class="os-answer-textbtn" data-os="agendar" data-agenda="general" data-src="meds" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-4">Agendar si prefiere que un médico lo revise antes</button></p>';
    }
    html += '</section>';
    return bloque(html);
  }
  function seccionExamenes(r, motor) {
    var list = (motor && motor.examenes && motor.examenes.length) ? motor.examenes : null;
    var html = '<section class="os-sec" id="os-examenes">' + secHead('flask', 'Exámenes que podrían pedirle');
    html += '<p>No es una orden. Son estudios para <strong>conversarlos con el médico</strong>. Si ya se hizo alguno, llévelo a la cita.</p>';
    if (list) {
      list.forEach(function (x, i) {
        if (x.buscar) {
          html += '<a class="os-exam-card" id="FARMACIA-ROGANS-ORIENTACIONSINTOMAS-V1-EX' + (i + 1) + '" target="_blank" rel="noopener nofollow" href="' + esc(farmaciaUrl(x.buscar)) + '">';
          html += '<span class="os-exam-name">' + esc(x.nombre) + '</span>';
          html += '<span class="os-exam-go">Ver en Farminova</span></a>';
        } else {
          html += '<div class="os-exam-card is-static"><span class="os-exam-name">' + esc(x.nombre) + '</span></div>';
        }
      });
      html += '<p class="os-answer-fine">El botón abre la búsqueda en Farminova24. No todos los estudios se compran ahí; si no aparece, el médico le indica dónde hacerlo.</p>';
    } else if (r.examenes && r.examenes.length) {
      r.examenes.forEach(function (x) {
        html += '<div class="os-exam-card is-static"><span class="os-exam-name">' + esc(x) + '</span></div>';
      });
      html += '<p class="os-answer-fine">El médico decide cuáles pedir.</p>';
    } else {
      html += '<p>Con lo que contó, <strong>no suele hacer falta un examen de entrada</strong>. Si el cuadro cambia, el médico le dice cuáles considerar.</p>';
    }
    html += '</section>';
    return bloque(html);
  }
  function seccionConsulta(e, motor) {
    var html = '<section class="os-sec">' + secHead('user', 'Con quién consultar');
    var specs = (motor && motor.especialistas) || [];
    if (motor && motor.urgencias) {
      html += '<p>El primer lugar es <strong>urgencias</strong> (o el <strong>123</strong>). La cita se agenda después de esa valoración, no en vez de ella.</p>';
      html += '<a class="os-cta os-cta-urgent" id="URGENCIAS-ROGANS-ORIENTACIONSINTOMAS-V1-1" href="tel:123">Ir a urgencias / llamar al 123</a>';
    } else {
      html += '<p>Empiece por <strong>medicina general</strong>. Esa consulta ordena el primer plan y decide si hace falta otro especialista.</p>';
    }
    if (specs.length) {
      html += '<ul>';
      specs.forEach(function (s) {
        html += '<li><strong>' + esc(s.nombre) + '</strong>';
        if (s.porQue) html += '. ' + esc(s.porQue);
        html += '</li>';
      });
      html += '</ul>';
    } else if (e && e.nombre) {
      html += '<p>Según sus respuestas, la orientación apunta a <strong>' + esc(e.nombre) + '</strong>. El médico de la primera consulta puede confirmarlo.</p>';
    }
    if (!(motor && motor.urgencias)) {
      if (tienePrecio()) {
        var pr = precioPromo();
        html += '<p class="os-price-note">Consulta de seguimiento: <s>' + esc(pr.regular) + '</s> <strong>' + esc(pr.promo) + '</strong> con el código <strong>' + esc(pr.code) + '</strong>.</p>';
      }
      html += '<p class="os-trust-line">Rogans financia los tratamientos.</p>';
      html += ctaAgenda('Agendar cita con medicina general', 'general', 'AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-1');
      if (e && e.key && e.key !== 'general') {
        html += ctaAgenda('Agendar cita con ' + e.nombre, e.key, 'AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-6');
      }
      html += '<ul class="os-trust">';
      html += '<li>' + svgIcon('shield') + '<span>Médicos certificados</span></li>';
      html += '<li>' + svgIcon('shield') + '<span>Financiación de tratamientos</span></li>';
      html += '</ul>';
    }
    html += '<p class="os-answer-fine">Al agendar puede autorizar el envío de sus respuestas (y adjuntos) al profesional. Si no autoriza, no salen de su navegador.</p>';
    html += '</section>';
    return bloque(html);
  }
  function seccionBanderas(motor) {
    var html = '<section class="os-sec os-sec-alert">' + secHead('alert', 'Vaya a urgencias si…');
    var list = (motor && motor.lead && motor.lead.urgenciasSi) || [];
    if (motor && motor.urgencias) {
      html += '<p>Además de lo que ya está pasando, <strong>no se quede en casa</strong> si aparece o empeora cualquiera de estas:</p>';
    } else if (!list.length) {
      html += '<p>Llame al <strong>123</strong> o vaya a urgencias si el cuadro cambia de golpe, no tolera líquidos, se confunde o le cuesta respirar.</p></section>';
      return bloque(html);
    } else {
      html += '<p>Llame al <strong>123</strong> o vaya a urgencias si aparece:</p>';
    }
    if (list.length) {
      html += '<ul>';
      list.forEach(function (t) { html += '<li>' + esc(t) + '</li>'; });
      html += '</ul>';
    }
    html += '</section>';
    return bloque(html);
  }
  function seccionCita() {
    var html = '<section class="os-sec">' + secHead('list', 'Para su cita');
    html += '<p>Lleve esto anotado. La consulta rinde más si ya está a la mano:</p><ul>';
    var dur = listaLabels('desde');
    var inicioCita = listaLabels('inicio');
    var tiempo = [];
    if (dur.length) tiempo.push(unirBajo(dur));
    if (inicioCita.length) tiempo.push('empezó ' + unirBajo(inicioCita));
    html += '<li><strong>El tiempo:</strong> ' + (tiempo.length ? esc(tiempo.join(', ')) : 'desde cuándo empezó, con la fecha aproximada') + '.</li>';
    var mejora = listaLabels('mejora', ['nada']);
    var empeora = listaLabels('empeora', ['nada']);
    var cron = [];
    if (mejora.length) cron.push('mejora con ' + unirBajo(mejora));
    if (empeora.length) cron.push('empeora con ' + unirBajo(empeora));
    html += '<li><strong>Qué lo cambia:</strong> ' + (cron.length ? esc(cron.join('; ')) : 'qué lo alivia y qué lo empeora') + '.</li>';
    if (S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      var med = S.tratamientos;
      if (S.tratResultado && S.tratResultado !== 'nada') med += ' (' + tratResultadoLabel(S.tratResultado) + ')';
      if (S.tratDetalle) med += ', ' + S.tratDetalle;
      html += '<li><strong>Lo que ya probó:</strong> ' + esc(med) + '.</li>';
    } else {
      html += '<li><strong>Lo que ya probó:</strong> aún nada. Si toma algo antes de la cita, anote el nombre y si le sirvió.</li>';
    }
    html += '<li><strong>Exámenes que ya tenga</strong>, aunque sean de otra fecha. No hace falta pedírselos por su cuenta antes de que el médico los indique.</li>';
    html += '</ul></section>';
    return bloque(html);
  }
  function heroHtml(diffs, motor) {
    var d = diffs && diffs.length ? diffs[0] : null;
    var nivel = (motor && motor.triageNivel) || 'programada';
    var triage = (motor && motor.triage) || 'Consulta programada';
    var html = '<section class="os-dxhero' + (nivel === 'urgencias' ? ' is-urgent' : '') + '">';
    html += '<div class="os-dxhero-badges">';
    if (d) html += '<span class="os-pill">' + esc(etiquetaProb(d.nivel)) + '</span>';
    html += '<span class="os-pill is-' + esc(nivel) + '">' + esc(triage) + '</span>';
    html += '</div>';
    html += '<h2 class="os-dxhero-title">' + esc(d ? d.nombre : 'Orientación según lo que contó') + '</h2>';
    if (d && d.porQue) html += '<p class="os-dxhero-why">' + esc(d.porQue) + '</p>';
    html += '</section>';
    return bloque(html);
  }
  function seccionOtros(motor) {
    var list = (motor && motor.otros) || [];
    if (!list.length) return '';
    var html = '<details class="os-answer-otros">';
    html += '<summary>Otros temas para hablar con su médico</summary>';
    html += '<p>No están relacionados con el motivo de hoy y <strong>no cambian la prioridad</strong>. Menciónelos en la consulta, aparte:</p><ul>';
    list.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul></details>';
    return bloque(html);
  }
  function herramientasHtml() {
    return '<div class="os-answer-tools">' +
      '<button type="button" class="os-answer-tool" data-os="copiar">Copiar</button>' +
      '<button type="button" class="os-answer-tool" data-os="imprimir">Descargar resumen</button>' +
      '</div>';
  }
  function seguimientoHtml() {
    return '<div class="os-chips os-followups" role="group" aria-label="Siguientes pasos">' +
      '<button type="button" class="os-chip" data-os="examenes-primero">¿Qué exámenes me hago primero?</button>' +
      '<button type="button" class="os-chip os-chip-primary" data-os="agendar" data-src="chip" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-2">Agendar cita</button>' +
      '<button type="button" class="os-chip" data-os="reiniciar">Tengo otro síntoma</button>' +
      '</div>';
  }
  function buildResultHtml(r, e) {
    var motor = correrMotor();
    lastMotor = motor;
    if (motor && motor.lead && motor.lead.agenda) e = espInfo(motor.lead.agenda);
    var diffs = diffsEfectivos(r, motor);
    var urgent = '';
    if (motor && motor.urgencias) {
      urgent = '<div class="os-stream-block os-answer-urgent"><p><strong>Vaya a urgencias ahora</strong> o llame al <strong>123</strong>. ' +
        esc(motor.triageRazon || 'No espere a una cita ni a que se le pase con un analgésico.') + '</p></div>';
    }
    var html = '<div class="os-row os-row-answer"><div class="os-avatar" aria-hidden="true">R</div>';
    html += '<article class="os-bubble os-bubble-bot os-bubble-answer os-answer is-pending" id="os-result-panel" data-os-result="1" aria-label="Orientación">';
    html += urgent;
    html += heroHtml(diffs, motor);
    html += bloque('<p class="os-answer-open">' + esc(reflejoPaciente(motor)) + '</p>');
    html += seccionProbable(diffs);
    html += seccionUrgencia(r, motor);
    html += seccionMientras(r, motor);
    html += seccionExamenes(r, motor);
    html += seccionConsulta(e, motor);
    html += seccionBanderas(motor);
    html += seccionCita();
    html += seccionOtros(motor);
    html += bloque('<p class="os-answer-disc">Orientación informativa: <strong>no reemplaza la consulta médica</strong> ni es un diagnóstico o una fórmula. Sus respuestas se procesan en su navegador y solo se envían si agenda y autoriza el tratamiento de sus datos de salud. Urgencias: línea local (Colombia 123).</p>');
    html += herramientasHtml();
    html += seguimientoHtml();
    html += '</article></div>';
    return html;
  }
  function revealAnswer() {
    var panel = document.getElementById('os-result-panel');
    if (!panel) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var blocks = panel.querySelectorAll('.os-stream-block');
    if (reduce) {
      panel.classList.remove('is-pending');
      for (var k = 0; k < blocks.length; k++) blocks[k].classList.add('is-in');
      return;
    }
    var i = 0;
    function step() {
      if (!panel.isConnected) return;
      if (i >= blocks.length) {
        panel.classList.remove('is-pending');
        return;
      }
      blocks[i].classList.add('is-in');
      i++;
      setTimeout(step, 130);
    }
    step();
  }
  function copiarResumen(btn) {
    var el = document.getElementById('os-result-panel');
    var text = el ? (el.innerText || '').replace(/\n{3,}/g, '\n\n').trim() : '';
    var done = function () {
      if (!btn) return;
      var prev = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(function () { if (btn.isConnected) btn.textContent = prev; }, 1600);
    };
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); done(); });
    } else {
      fallback();
      done();
    }
  }

  function showResultado() {
    S.fase = 'resultado';
    track('resultado');
    setResultMode(true);
    busy = true;
    clearComposer();
    typing(true);
    var espera = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 420;
    setTimeout(function () {
      typing(false);
      busy = false;
      var r = evaluar();
      var e = espInfo(r.esp);
      ask({ tipo: 'result_actions', html: buildResultHtml(r, e) });
      mountSticky();
      revealAnswer();
      requestAnimationFrame(function () {
        var panel = document.getElementById('os-result-panel');
        if (panel) {
          try { panel.scrollIntoView({ block: 'start', behavior: espera ? 'smooth' : 'auto' }); } catch (err) {}
        }
      });
    }, espera);
  }

  function showAgendar() {
    S.fase = 'agendar';
    track('agendar');
    removeSticky();
    setResultMode(true);
    var r = evaluar();
    var key = S.agendaForzada || (lastMotor && lastMotor.lead && lastMotor.lead.agenda) || r.esp;
    S.agendaForzada = '';
    var e = espInfo(key);
    if (!e.especialidad) {
      var msg = 'Hola, hice la orientación de síntomas en la web y quiero agendar una cita de medicina general.';
      botThen('<p class="m-0">Para <strong>medicina general</strong> te atendemos por WhatsApp. El mensaje no incluye tus síntomas.</p>', function () {
        ask({
          tipo: 'result_actions',
          html: '<div class="os-chips"><a class="os-chip os-chip-primary" id="WHATSAPP-ROGANS-ORIENTACIONSINTOMAS-V1-1" target="_blank" rel="noopener" href="' + esc(C.whatsapp + encodeURIComponent(msg)) + '">Agendar por WhatsApp</a><button type="button" class="os-chip" data-os="atras-resultado">Volver</button></div>'
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
      '<button type="button" class="os-chip os-chip-primary" data-os="abrir-agenda" id="AGENDA-ROGANS-ORIENTACIONSINTOMAS-V1-3"' + (ok ? '' : ' disabled') + '>Elegir fecha y hora</button></div>';
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
    S.notas = snap.notas || {};
    S.antecedentes = snap.antecedentes; S.quirurgicos = snap.quirurgicos;
    S.toxicos = snap.toxicos; S.gineco = snap.gineco; S.familiares = snap.familiares;
    S.alergias = snap.alergias; S.medicamentos = snap.medicamentos;
    S.tratamientos = snap.tratamientos; S.tratResultado = snap.tratResultado; S.tratDetalle = snap.tratDetalle;
    S.cat = snap.catId ? catById(snap.catId) : null;
    S.lugar = snap.lugar || null;
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
      if (!S.cat) S.cat = catById('medicina_general');
      askAlarmas();
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
        ask({ tipo: 'chips_multi', q: p.texto, selected: [], textoLibre: true, placeholder: 'O escríbalo con sus palabras', opciones: opcionesDePregunta(p) });
      } else {
        ask({ tipo: 'chips', q: p.texto, textoLibre: true, placeholder: 'O escríbalo con sus palabras', opciones: opcionesDePregunta(p) });
      }
    } else if (f === 'antecedentes') {
      ask({ tipo: 'chips_multi', q: T.antecedentes || '', selected: [], textoLibre: true, placeholder: 'Otra enfermedad, o escríbala aquí', opciones: antecedentesFiltrados() });
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
      S.agendaForzada = b.getAttribute('data-agenda') || '';
      showAgendar();
      return;
    }
    if (a === 'copiar') { copiarResumen(b); return; }
    if (a === 'imprimir') { window.print(); return; }
    if (a === 'examenes-primero') {
      var ex = document.getElementById('os-examenes');
      if (ex) {
        ex.classList.add('is-marked');
        var reduceEx = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try { ex.scrollIntoView({ block: 'start', behavior: reduceEx ? 'auto' : 'smooth' }); } catch (err) {}
      }
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
        if (exclusiva) {
          clearComposer();
          handleMulti([v]);
          return;
        }
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
    if (!text) { ta.focus(); return; }
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
    if (S.fase === 'categoria') { afterCategoriaLibre(text); return; }
    if (S.fase === 'pregunta') { afterPreguntaLibre(text); return; }
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
