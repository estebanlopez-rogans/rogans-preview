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

  var S, msgs, inputMode, busy, focusHtml;

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
    return { nivel: nivel, esp: esp, causas: causas, otc: otc, embarazo: embarazo, examenes: examenes };
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
  }

  function shellHtml() {
    return '<div class="os-chat-shell" id="os-shell">' +
      '<div class="os-progress" aria-hidden="true"><span id="os-prog" style="width:4%"></span></div>' +
      '<div class="os-history" id="os-history" role="log" aria-relevant="additions"></div>' +
      '<div class="os-focus" id="os-focus"><p class="os-focus-q" id="os-focus-q">…</p><p class="os-focus-sub" id="os-focus-sub" hidden></p></div>' +
      '<div class="os-composer" id="os-composer"></div>' +
      '</div>';
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
    var fq = document.getElementById('os-focus-q');
    var fs = document.getElementById('os-focus-sub');
    if (!hist) return;

    // Last bot message becomes focus; earlier go to history
    var focusIdx = -1;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'bot' && !msgs[i].typing) { focusIdx = i; break; }
    }
    var html = '';
    msgs.forEach(function (m, idx) {
      if (idx === focusIdx && !m.typing) return; // shown in focus
      if (m.typing) {
        html += '<div class="os-row"><div class="os-avatar" aria-hidden="true">R</div><div class="os-bubble os-bubble-bot os-typing"><span></span><span></span><span></span></div></div>';
        return;
      }
      if (m.role === 'user') {
        html += '<div class="os-row os-row-user"><div class="os-bubble os-bubble-user">' + m.html + '</div></div>';
      } else {
        html += '<div class="os-row"><div class="os-avatar" aria-hidden="true">R</div><div class="os-bubble os-bubble-bot">' + m.html + '</div></div>';
      }
    });
    hist.innerHTML = html;
    hist.scrollTop = hist.scrollHeight;

    if (fq) {
      if (focusIdx >= 0) {
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
  }

  function stripTags(h) {
    var d = document.createElement('div');
    d.innerHTML = h;
    return (d.textContent || '').trim();
  }

  function paintComposer() {
    var el = document.getElementById('os-composer');
    if (!el) return;
    if (!inputMode) { el.innerHTML = ''; return; }
    var html = '<div class="os-composer-inner">';
    if (S.history.length) {
      html += '<button type="button" class="os-back" data-os="atras">← Atrás</button>';
    }
    var m = inputMode;
    if (m.tipo === 'chips' || m.tipo === 'confirm') {
      html += '<div class="os-chips" role="group">';
      (m.opciones || []).forEach(function (o) {
        html += '<button type="button" class="os-chip' + (o.primary ? ' os-chip-primary' : '') + '" data-os="chip" data-v="' + esc(o.v) + '">' + esc(o.t) + '</button>';
      });
      html += '</div>';
    } else if (m.tipo === 'chips_multi') {
      html += '<div class="os-chips" role="group">';
      (m.opciones || []).forEach(function (o) {
        var on = (m.selected || []).indexOf(o.v) !== -1;
        html += '<button type="button" class="os-chip' + (on ? ' is-on' : '') + '" data-os="chip" data-v="' + esc(o.v) + '" data-excl="' + (o.exclusiva ? '1' : '0') + '">' + esc(o.t) + '</button>';
      });
      html += '</div>';
      html += '<div class="os-chips"><button type="button" class="os-chip os-chip-primary" data-os="multi-ok"' + ((m.selected || []).length ? '' : ' disabled') + '>Continuar</button></div>';
    } else if (m.tipo === 'text' || m.tipo === 'text_optional') {
      html += '<form data-os="text-form" class="os-text-form">' +
        '<label class="sr-only" for="os-text">Tu respuesta</label>' +
        '<textarea id="os-text" class="os-text" rows="2" maxlength="' + (m.max || 500) + '" placeholder="' + esc(m.placeholder || '') + '">' + esc(m.value || '') + '</textarea>' +
        '<button type="submit" class="os-chip os-chip-primary os-send">' + (m.tipo === 'text_optional' ? 'Continuar' : 'Enviar') + '</button></form>';
    } else if (m.tipo === 'upload') {
      html += '<div class="os-upload">' +
        '<label class="os-check' + (S.consAdjuntos ? ' is-on' : '') + '"><input type="checkbox" data-os="cons-adj"' + (S.consAdjuntos ? ' checked' : '') + '><span>Autorizo el tratamiento de estas fotos/exámenes (datos sensibles de salud) solo para mi consulta de seguimiento. <small class="text-error-600">*</small></span></label>' +
        '<p class="os-legal-sm mt-2">JPG, PNG, WebP o PDF · máx. 5 MB c/u · no se guardan en el sitio; solo se envían si agendas.</p>' +
        '<input type="file" id="os-files" multiple accept="image/jpeg,image/png,image/webp,application/pdf" ' + (S.consAdjuntos ? '' : 'disabled') + '>' +
        '<div class="os-previews" id="os-previews"></div></div>' +
        '<div class="os-chips mt-2">' +
        '<button type="button" class="os-chip" data-os="skip-upload">' + esc(T.evidencia_skip || 'Continuar sin adjuntos') + '</button>' +
        '<button type="button" class="os-chip os-chip-primary" data-os="ok-upload"' + (S.adjuntos.length && S.consAdjuntos ? '' : ' disabled') + '>Adjuntar y continuar</button>' +
        '</div>';
    } else if (m.tipo === 'result_actions' || m.tipo === 'agendar_ui') {
      html += m.html || '';
    }
    html += '</div>';
    el.innerHTML = html;
    if (m.tipo === 'text' || m.tipo === 'text_optional') {
      var ta = el.querySelector('#os-text');
      if (ta) { ta.focus(); }
    }
    if (m.tipo === 'upload') {
      renderPreviews();
      var fi = el.querySelector('#os-files');
      if (fi) fi.addEventListener('change', onFilesPicked);
    }
  }

  function say(html, opts) {
    opts = opts || {};
    msgs.push({ role: 'bot', html: html, plain: opts.plain || stripTags(html), focusHtml: opts.focusHtml || null });
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
    paintComposer();
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

  function askCategoria() {
    S.fase = 'categoria';
    track('categoria');
    botThen(esc(T.categoria || ''), function () {
      ask({ tipo: 'chips', opciones: D.categorias.map(function (c) { return { v: c.id, t: c.titulo }; }) });
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
      ask({ tipo: 'chips_multi', selected: [], opciones: ops });
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
      if (p.multi) {
        var ops = p.opciones.map(function (o) { return { v: o.v, t: o.t, exclusiva: !!o.exclusiva }; });
        ask({ tipo: 'chips_multi', selected: [], opciones: ops });
      } else {
        ask({ tipo: 'chips', opciones: p.opciones.map(function (o) { return { v: o.v, t: o.t }; }) });
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
    var hint = (S.cat && (S.cat.id === 'piel' || S.cat.id === 'capilar' || S.cat.id === 'facial'))
      ? ' Especialmente útil en piel, cabello o rostro.'
      : '';
    botThen(esc((T.evidencia || '') + hint), function () {
      ask({ tipo: 'upload' });
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
    return (D.causas && D.causas[k]) || k;
  }

  function medRecommendationHtml(r) {
    var html = '';
    html += '<h3>Medicamentos</h3>';
    // Continue same OTC if worked
    if (S.tratResultado === 'funciono' && S.tratamientos && !/^nada/i.test(S.tratamientos)) {
      html += '<p class="os-result-sub">Como te funcionó <strong>' + esc(S.tratamientos) + '</strong>' +
        (S.tratDetalle ? ' (' + esc(S.tratDetalle) + ')' : '') +
        ', si es de venta libre y te resulta seguro según la etiqueta, puedes continuar usándolo respetando dosis y tiempo máximo.</p>';
    } else if (S.tratResultado === 'efectos') {
      html += '<p class="os-result-sub">Por los efectos adversos que mencionaste con <strong>' + esc(S.tratamientos) + '</strong>, no sugerimos repetirlo. Revisa opciones de venta libre abajo o consulta al médico.</p>';
    } else if (S.tratResultado === 'no' || S.tratResultado === 'parcial') {
      html += '<p class="os-result-sub">Como lo anterior no resolvió del todo tu molestia, aquí van alternativas de venta libre (si aplican a tu caso):</p>';
    }

    if (r.embarazo) {
      html += '<p class="os-result-body">En embarazo o lactancia no sugerimos automedicación: tu médico te orientará.</p>';
    } else if (r.otc.length) {
      r.otc.forEach(function (p) {
        html += '<div class="os-otc"><p class="m-0 font-semibold">' + esc(p.nombre) + '</p>' +
          '<p class="mt-1 mb-0 text-sm">' + esc(p.uso) + '</p>' +
          '<ul class="mt-1 mb-0 pl-4 text-sm">' +
          (p.avisos || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') +
          '</ul></div>';
      });
      if (D.otcAvisos && D.otcAvisos.length) {
        html += '<div class="os-warn"><ul class="m-0 pl-4">' +
          D.otcAvisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
      }
    } else if (r.nivel !== 'prioritaria') {
      html += '<p class="os-result-body">No hay una sugerencia clara de venta libre para tu combinación de respuestas.</p>';
    }

    // Never name Rx — hook to paid consult
    html += '<p class="os-result-sub"><strong>Tu médico puede formularte un tratamiento</strong> (incluidos medicamentos con fórmula), órdenes de exámenes, conceptos de incapacidad u otras indicaciones en la consulta de seguimiento.</p>';
    return html;
  }

  function showResultado() {
    S.fase = 'resultado';
    track('resultado');
    var r = evaluar();
    var e = espInfo(r.esp);
    botThen(esc(T.cierre || 'Listo…'), function () {
      var html = '<div class="os-result">';
      html += '<p class="os-result-kicker">Orientación</p>';
      html += '<p class="os-result-title">Resumen de lo que contaste</p>';
      html += '<p class="os-result-body">' + esc(S.relato) +
        (S.cat ? ' · ' + esc(S.cat.titulo) : '') +
        (S.pais ? ' · ' + esc(S.pais) : '') + '</p>';

      if (r.causas.length) {
        html += '<h3>Posibles causas a considerar</h3><ul class="os-result-list">';
        r.causas.slice(0, 5).forEach(function (k) {
          html += '<li><strong>' + esc(causaLabel(k)) + '</strong></li>';
        });
        html += '</ul>';
      }

      if (r.examenes.length) {
        html += '<h3>Exámenes que podrían ayudar</h3><ul class="os-result-bullets">';
        r.examenes.forEach(function (x) { html += '<li>' + esc(x) + '</li>'; });
        html += '</ul>';
      }

      html += medRecommendationHtml(r);

      if (r.nivel === 'prioritaria') {
        html += '<p class="os-result-body">Por lo que marcaste, no te sugerimos automedicarte. Lo mejor es valoración pronto.</p>';
      }

      html += '<div class="os-remision"><p class="m-0 font-semibold">Consulta de seguimiento: ' + esc(e.nombre) + '</p>' +
        '<p class="mt-1 mb-0 text-sm">El médico reutiliza tu información para profundizar. Puede incluir diagnóstico con aval profesional, fórmula médica, incapacidad, órdenes o remisiones.</p>' +
        '<p class="mt-1 mb-0 text-sm">' + (e.modalidades.indexOf('telemedicina') !== -1 ? 'Virtual (internacional) o presencial en Bogotá.' : 'Presencial en Bogotá.') + '</p>' +
        precioHtml() + promoHint() +
        '</div>';
      html += '<p class="os-result-disc">Orientación general basada en tus respuestas. El diagnóstico y las fórmulas las emite el profesional en consulta. Urgencias: línea local (Colombia 123).</p>';
      html += '</div>';

      say(html, { plain: 'Tu orientación' });
      ask({
        tipo: 'result_actions',
        html: '<div class="os-chips">' +
          '<button type="button" class="os-chip os-chip-primary" data-os="agendar" id="OS_CTA_AGENDAR">Agendar consulta de seguimiento</button>' +
          (e.url ? '<a class="os-chip" href="' + esc(e.url) + '">Conocer el servicio</a>' : '') +
          '<button type="button" class="os-chip" data-os="reiniciar">Nueva orientación</button>' +
          '</div>' +
          '<p class="os-legal-sm">Al agendar puedes autorizar el envío de tus respuestas (y adjuntos) al profesional.</p>'
      });
    });
  }

  function showAgendar() {
    S.fase = 'agendar';
    track('agendar');
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
    renderChrome();
    reaskCurrent();
  }

  function reaskCurrent() {
    var f = S.fase;
    if (f === 'inicio') {
      ask({ tipo: 'confirm', opciones: [{ v: 'adulto', t: 'Sí, 18 o más', primary: true }, { v: 'menor', t: 'Menor de 18' }] });
    } else if (f === 'pais') {
      ask({ tipo: 'chips', opciones: (D.paises || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'sexo') {
      ask({ tipo: 'chips', opciones: (D.sexo || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'motivo') {
      ask({ tipo: 'text', max: 1000, placeholder: '…', value: S.relato });
    } else if (f === 'categoria') {
      ask({ tipo: 'chips', opciones: D.categorias.map(function (c) { return { v: c.id, t: c.titulo }; }) });
    } else if (f === 'alarmas') {
      var ops = (D.alarmas || []).map(function (a) { return { v: a.id, t: a.texto }; });
      ops.push({ v: 'ninguna', t: 'Ninguna de estas', exclusiva: true });
      ask({ tipo: 'chips_multi', selected: [], opciones: ops });
    } else if (f === 'tratamientos') {
      ask({ tipo: 'text_optional', max: 400, value: S.tratamientos });
    } else if (f === 'trat_resultado') {
      ask({ tipo: 'chips', opciones: (D.tratResultado || []).map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'trat_detalle') {
      ask({ tipo: 'text_optional', max: 200, value: S.tratDetalle });
    } else if (f === 'pregunta') {
      askPregunta();
    } else if (f === 'antecedentes') {
      ask({ tipo: 'chips_multi', selected: [], opciones: (D.antecedentes || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'quirurgicos') {
      ask({ tipo: 'text_optional', max: 300, value: S.quirurgicos });
    } else if (f === 'toxicos') {
      ask({ tipo: 'chips_multi', selected: [], opciones: (D.toxicos || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'alergias') {
      ask({ tipo: 'text_optional', max: 300, value: S.alergias });
    } else if (f === 'medicamentos') {
      ask({ tipo: 'text_optional', max: 300, value: S.medicamentos });
    } else if (f === 'gineco') {
      ask({ tipo: 'chips_multi', selected: [], opciones: (D.gineco || []).map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'familiares') {
      ask({ tipo: 'text_optional', max: 300, value: S.familiares });
    } else if (f === 'evidencia') {
      ask({ tipo: 'upload' });
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
    if (a === 'agendar') { showAgendar(); return; }
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
      if ($sel.length && $sel.val() !== e.especialidad) {
        $sel.val(e.especialidad).trigger('change');
        if ($.fn.niceSelect) $sel.niceSelect('update');
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
