/**
 * Orientación de síntomas — chat de anamnesis (page-orientacion-de-sintomas.php).
 *
 * Conversación rule-based (sin LLM): motivo → categoría → alarmas → semiología
 * de la categoría → antecedentes clínicos → impresión orientativa.
 * Panel "Tu historia clínica preliminar" se llena en vivo.
 *
 * Nada sale del navegador salvo agendar + compartir + autorización Ley 1581.
 * Sidebar de agenda sin modificar: se escucha su submit en captura.
 *
 * dataLayer: solo nombres de paso, nunca síntomas.
 */
(function () {
  'use strict';

  var D = window.ROGANS_OS_DATOS;
  var C = window.ROGANS_OS_CFG;
  var root = document.getElementById('os-app');
  if (!D || !C || !root) return;

  var RANK = { autocuidado: 0, consulta: 1, prioritaria: 2 };
  var COPY = D.chat || {};
  var TYPE_MS = 450;

  var S;
  var msgs = []; // {role:'bot'|'user', html, text}
  var busy = false;
  var inputMode = null; // current prompt descriptor

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'os-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function track(paso) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'orientacion_sintomas', os_paso: paso });
  }

  function catById(id) {
    for (var i = 0; i < D.categorias.length; i++) if (D.categorias[i].id === id) return D.categorias[i];
    return null;
  }

  function citasCfg() { return window.ROGANS_HOME_CITAS_CFG || {}; }

  function reset() {
    S = {
      fase: 'inicio',
      entiende: false,
      edad: '',
      sexo: '',
      relato: '',
      alarmas: [],
      cat: null,
      qi: 0,
      resp: {},
      antecedentes: [],
      quirurgicos: '',
      toxicos: [],
      gineco: [],
      familiares: '',
      alergias: '',
      medicamentos: '',
      tratamientos: '',
      modalidad: '',
      compartir: false,
      consDatos: false,
      consTele: false,
      id: uuid(),
      enviado: false,
      history: [] // stack of {fase, snapshot} for back
    };
    msgs = [];
    inputMode = null;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({
      fase: S.fase, edad: S.edad, sexo: S.sexo, relato: S.relato, alarmas: S.alarmas,
      catId: S.cat && S.cat.id, qi: S.qi, resp: S.resp, antecedentes: S.antecedentes,
      quirurgicos: S.quirurgicos, toxicos: S.toxicos, gineco: S.gineco,
      familiares: S.familiares, alergias: S.alergias, medicamentos: S.medicamentos,
      tratamientos: S.tratamientos, entiende: S.entiende
    }));
  }

  function pushHistory() {
    S.history.push(snapshot());
    if (S.history.length > 40) S.history.shift();
  }

  function seguridadIds() {
    // Une antecedentes + gineco para filtros OTC (embarazo/lactancia = embarazo).
    var out = S.antecedentes.filter(function (x) { return x !== 'ninguna'; });
    if (S.gineco.indexOf('embarazo') !== -1 || S.gineco.indexOf('lactancia') !== -1) {
      if (out.indexOf('embarazo') === -1) out.push('embarazo');
    }
    // Map alcohol frecuente from toxicos to higado exclusion helper already on higado
    if (S.toxicos.indexOf('alcohol_frecuente') !== -1 && out.indexOf('higado') === -1) {
      // no auto-add higado; alcohol is separate — OTC excluir_si uses higado for acetaminofen
      // Keep as-is; alcohol_frecuente alone doesn't exclude unless we want. Leave.
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

  function progressPct() {
    var order = ['inicio', 'sexo', 'motivo', 'categoria', 'alarmas', 'pregunta', 'tratamientos', 'antecedentes', 'quirurgicos', 'toxicos', 'alergias', 'medicamentos', 'gineco', 'familiares', 'resultado', 'agendar'];
    var f = S.fase;
    if (f === 'urgencia' || f === 'menor') return 100;
    var i = order.indexOf(f);
    if (i < 0) i = 0;
    var extra = (f === 'pregunta' && S.cat) ? (S.qi / Math.max(S.cat.preguntas.length, 1)) : 0;
    return Math.min(98, Math.round(((i + extra) / (order.length - 1)) * 100));
  }

  // ---------- HC panel ----------
  function labelOf(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id || list[i].v === id) return list[i].texto || list[i].t;
    return id;
  }

  function hcSections() {
    var secs = [];
    if (S.edad || S.sexo) {
      var demo = [];
      if (S.edad === 'adulto') demo.push('Mayor de 18 años');
      if (S.edad === 'menor') demo.push('Menor de 18 años');
      if (S.sexo) demo.push('Sexo: ' + labelOf(D.sexo, S.sexo));
      secs.push({ id: 'datos', t: 'Datos clínicos básicos', items: demo });
    }
    if (S.relato || S.cat) {
      var mot = [];
      if (S.relato) mot.push(S.relato);
      if (S.cat) mot.push('Área: ' + S.cat.titulo);
      secs.push({ id: 'motivo', t: 'Motivo de consulta', items: mot });
    }
    if (S.alarmas.length && S.alarmas[0] !== 'ninguna') {
      secs.push({ id: 'alarmas', t: 'Señales de alarma', items: S.alarmas.map(function (id) { return labelOf(D.alarmas, id); }) });
    } else if (S.alarmas[0] === 'ninguna') {
      secs.push({ id: 'alarmas', t: 'Señales de alarma', items: ['Ninguna reportada'] });
    }
    if (S.cat && Object.keys(S.resp).length) {
      var ea = [];
      S.cat.preguntas.forEach(function (p) {
        var sel = [].concat(S.resp[p.id] || []);
        if (!sel.length) return;
        var labs = p.opciones.filter(function (o) { return sel.indexOf(o.v) !== -1; }).map(function (o) { return o.t; });
        ea.push(p.texto + ': ' + labs.join('; '));
      });
      if (S.tratamientos) ea.push('Tratamientos probados: ' + S.tratamientos);
      if (ea.length) secs.push({ id: 'ea', t: 'Enfermedad actual', items: ea });
    }
    if (S.antecedentes.length) {
      var ant = S.antecedentes[0] === 'ninguna' ? ['Ninguno de la lista'] :
        S.antecedentes.map(function (id) { return labelOf(D.antecedentes, id); });
      secs.push({ id: 'ant', t: 'Antecedentes patológicos', items: ant });
    }
    if (S.quirurgicos) secs.push({ id: 'qx', t: 'Antecedentes quirúrgicos', items: [S.quirurgicos] });
    if (S.toxicos.length) {
      var tx = S.toxicos[0] === 'ninguna' ? ['Ninguno'] : S.toxicos.map(function (id) { return labelOf(D.toxicos, id); });
      secs.push({ id: 'tox', t: 'Hábitos / tóxicos', items: tx });
    }
    if (S.alergias) secs.push({ id: 'alg', t: 'Alergias', items: [S.alergias] });
    if (S.medicamentos) secs.push({ id: 'med', t: 'Medicamentos actuales', items: [S.medicamentos] });
    if (S.gineco.length) {
      var g = S.gineco[0] === 'ninguna' ? ['Ninguna'] : S.gineco.map(function (id) { return labelOf(D.gineco, id); });
      secs.push({ id: 'gin', t: 'Gineco-obstétricos', items: g });
    }
    if (S.familiares) secs.push({ id: 'fam', t: 'Antecedentes familiares', items: [S.familiares] });
    if (S.fase === 'resultado' || S.fase === 'agendar') {
      var r = evaluar();
      var imp = r.causas.map(function (k) { return (S.cat.causas[k] && S.cat.causas[k].t) || k; });
      if (imp.length) secs.push({ id: 'imp', t: 'Impresión orientativa (no diagnóstico)', items: imp });
    }
    return secs;
  }

  function renderHc() {
    var panel = document.getElementById('os-hc-panel');
    var mobile = document.getElementById('os-hc-mobile-body');
    var html = '<p class="os-hc-note">' + esc(COPY.disclaimer_hc || 'Historia clínica preliminar. Pendiente de validación médica.') + '</p>';
    var secs = hcSections();
    if (!secs.length) {
      html += '<p class="os-hc-empty">Aún no hay datos. Tus respuestas irán apareciendo aquí.</p>';
    } else {
      secs.forEach(function (sec) {
        html += '<div class="os-hc-sec"><h3>' + esc(sec.t) + '</h3><ul>';
        sec.items.forEach(function (it) { html += '<li>' + esc(it) + '</li>'; });
        html += '</ul></div>';
      });
    }
    if (panel) panel.innerHTML = html;
    if (mobile) mobile.innerHTML = html;
    var count = document.getElementById('os-hc-count');
    if (count) count.textContent = String(secs.length);
  }

  // ---------- Chat DOM ----------
  function shellHtml() {
    var pct = progressPct();
    return '' +
      '<div class="os-layout">' +
        '<div class="os-chat-col">' +
          '<div class="os-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Avance de la anamnesis"><span style="width:' + Math.max(pct, 3) + '%"></span></div>' +
          '<div class="os-chat" id="os-chat" role="log" aria-live="polite" aria-relevant="additions"></div>' +
          '<div class="os-composer" id="os-composer"></div>' +
        '</div>' +
        '<aside class="os-hc-aside" aria-label="Historia clínica preliminar">' +
          '<div class="os-hc-head"><i data-lucide="clipboard-list" class="w-5 h-5" aria-hidden="true"></i><div><p class="os-hc-title">Tu historia clínica preliminar</p><p class="os-hc-sub">Se llena mientras conversamos</p></div></div>' +
          '<div class="os-hc-body" id="os-hc-panel"></div>' +
        '</aside>' +
      '</div>' +
      '<details class="os-hc-mobile">' +
        '<summary><span>Ver historia clínica preliminar (<span id="os-hc-count">0</span>)</span><i data-lucide="chevron-down" class="w-4 h-4" aria-hidden="true"></i></summary>' +
        '<div id="os-hc-mobile-body" class="os-hc-body"></div>' +
      '</details>';
  }

  function paintMessages() {
    var box = document.getElementById('os-chat');
    if (!box) return;
    var html = '';
    msgs.forEach(function (m) {
      if (m.role === 'typing') {
        html += '<div class="os-row os-row-bot" aria-hidden="true"><div class="os-avatar">R</div><div class="os-bubble os-bubble-bot os-typing"><span></span><span></span><span></span></div></div>';
      } else if (m.role === 'bot') {
        html += '<div class="os-row os-row-bot"><div class="os-avatar" aria-hidden="true">R</div><div class="os-bubble os-bubble-bot">' + m.html + '</div></div>';
      } else {
        html += '<div class="os-row os-row-user"><div class="os-bubble os-bubble-user">' + m.html + '</div></div>';
      }
    });
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function paintComposer() {
    var el = document.getElementById('os-composer');
    if (!el) return;
    if (!inputMode || busy) { el.innerHTML = ''; return; }
    var m = inputMode;
    var html = '<div class="os-composer-inner">';
    if (S.history.length) {
      html += '<button type="button" class="os-back" data-os="atras" aria-label="Corregir última respuesta"><i data-lucide="undo-2" class="w-4 h-4" aria-hidden="true"></i> Corregir</button>';
    }
    if (m.tipo === 'chips' || m.tipo === 'chips_multi') {
      html += '<div class="os-chips" role="group" aria-label="Opciones">';
      (m.opciones || []).forEach(function (o) {
        var on = m.tipo === 'chips_multi'
          ? (m.selected || []).indexOf(o.v) !== -1
          : m.selected === o.v;
        html += '<button type="button" class="os-chip' + (on ? ' is-on' : '') + '" data-os="chip" data-v="' + esc(o.v) + '"' + (o.exclusiva ? ' data-excl="1"' : '') + '>' + esc(o.t) + '</button>';
      });
      html += '</div>';
      if (m.tipo === 'chips_multi') {
        html += '<button type="button" class="btn-primary-500 os-send" data-os="multi-ok"' + ((m.selected || []).length ? '' : ' disabled') + '>Continuar</button>';
      }
    }
    if (m.tipo === 'text' || m.tipo === 'text_optional') {
      html += '<form class="os-text-form" data-os="text-form">' +
        '<label class="sr-only" for="os-text">' + esc(m.label || 'Tu respuesta') + '</label>' +
        '<textarea id="os-text" rows="2" maxlength="' + (m.max || 500) + '" placeholder="' + esc(m.placeholder || '') + '" class="os-text">' + esc(m.value || '') + '</textarea>' +
        '<button type="submit" class="btn-primary-500 os-send">Enviar</button>' +
        '</form>';
    }
    if (m.tipo === 'confirm') {
      html += '<div class="os-chips">';
      (m.opciones || []).forEach(function (o) {
        html += '<button type="button" class="os-chip' + (o.primary ? ' os-chip-primary' : '') + '" data-os="chip" data-v="' + esc(o.v) + '">' + esc(o.t) + '</button>';
      });
      html += '</div>';
    }
    if (m.tipo === 'result_actions' || m.tipo === 'agendar_ui') {
      html += m.html || '';
    }
    html += '</div>';
    el.innerHTML = html;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    var ta = el.querySelector('#os-text');
    if (ta) { ta.focus(); }
  }

  function renderChrome() {
    var pct = progressPct();
    var bar = root.querySelector('.os-progress > span');
    var prog = root.querySelector('.os-progress');
    if (bar) bar.style.width = Math.max(pct, 3) + '%';
    if (prog) prog.setAttribute('aria-valuenow', String(pct));
    paintMessages();
    paintComposer();
    renderHc();
  }

  function say(html, text) {
    msgs = msgs.filter(function (m) { return m.role !== 'typing'; });
    msgs.push({ role: 'bot', html: html, text: text || '' });
    paintMessages();
  }

  function userSay(text) {
    msgs.push({ role: 'user', html: esc(text), text: text });
    paintMessages();
  }

  function typing(on) {
    msgs = msgs.filter(function (m) { return m.role !== 'typing'; });
    if (on) msgs.push({ role: 'typing' });
    paintMessages();
  }

  function botThen(html, nextFn) {
    busy = true;
    inputMode = null;
    paintComposer();
    typing(true);
    setTimeout(function () {
      typing(false);
      say(html);
      busy = false;
      if (nextFn) nextFn();
      renderChrome();
    }, TYPE_MS);
  }

  // ---------- Flow ----------
  function ask(mode) {
    inputMode = mode;
    paintComposer();
  }

  function start() {
    root.innerHTML = shellHtml();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    renderHc();
    botThen('<p class="m-0">' + esc(COPY.bienvenida) + '</p><p class="mt-2 mb-0 text-sm text-gray-600">Si es una urgencia, llama al <a class="text-primary-600 underline" href="tel:123">123</a>.</p>', function () {
      S.fase = 'inicio';
      track('inicio');
      botThen('<p class="m-0">' + esc(COPY.edad) + '</p>', function () {
        ask({
          tipo: 'confirm',
          opciones: [
            { v: 'adulto', t: 'Sí, 18 años o más', primary: true },
            { v: 'menor', t: 'No, es menor de 18' }
          ]
        });
      });
    });
  }

  function afterEdad(v) {
    pushHistory();
    S.edad = v;
    userSay(v === 'adulto' ? 'Sí, 18 años o más' : 'Es menor de 18');
    if (v === 'menor') {
      S.fase = 'menor';
      botThen('<p class="m-0"><strong>Esta orientación es solo para mayores de 18 años.</strong> Los síntomas en niños y adolescentes deben valorarlos su pediatra o médico. Si hay señales de alarma, llama al <a href="tel:123" class="text-primary-600 underline">123</a> o ve a urgencias.</p>', function () {
        ask({ tipo: 'confirm', opciones: [{ v: 'reiniciar', t: 'Volver a empezar' }] });
      });
      return;
    }
    botThen('<p class="m-0">Perfecto. Confirma también: ¿entiendes que esto es una <strong>orientación general</strong>, no un diagnóstico, y no reemplaza la consulta médica?</p>', function () {
      ask({
        tipo: 'confirm',
        opciones: [
          { v: 'entiende', t: 'Sí, lo entiendo', primary: true },
          { v: 'reiniciar', t: 'Prefiero no continuar' }
        ]
      });
    });
  }

  function afterEntiende() {
    pushHistory();
    S.entiende = true;
    userSay('Sí, lo entiendo');
    S.fase = 'sexo';
    track('sexo');
    botThen('<p class="m-0">' + esc(COPY.sexo) + '</p>', function () {
      ask({
        tipo: 'chips',
        opciones: D.sexo.map(function (o) { return { v: o.v, t: o.t }; })
      });
    });
  }

  function afterSexo(v) {
    pushHistory();
    S.sexo = v;
    userSay(labelOf(D.sexo, v));
    S.fase = 'motivo';
    track('motivo');
    botThen('<p class="m-0">' + esc(COPY.motivo) + '</p><p class="mt-2 mb-0 text-sm text-gray-500">' + esc(COPY.motivo_hint || '') + '</p>', function () {
      ask({ tipo: 'text', max: 1000, placeholder: 'Escribe tu motivo de consulta…', label: 'Motivo de consulta' });
    });
  }

  function afterMotivo(text) {
    pushHistory();
    S.relato = text;
    userSay(text);
    S.fase = 'categoria';
    track('categoria');
    botThen('<p class="m-0">' + esc(COPY.categoria) + '</p>', function () {
      ask({
        tipo: 'chips',
        opciones: D.categorias.map(function (c) { return { v: c.id, t: c.titulo }; })
      });
    });
  }

  function afterCategoria(id) {
    pushHistory();
    S.cat = catById(id);
    S.qi = 0;
    S.resp = {};
    userSay(S.cat.titulo);
    S.fase = 'alarmas';
    track('alarmas');
    botThen('<p class="m-0">' + esc(COPY.alarmas) + '</p>', function () {
      var ops = D.alarmas.map(function (a) { return { v: a.id, t: a.texto }; });
      ops.push({ v: 'ninguna', t: 'Ninguna de estas', exclusiva: true });
      ask({ tipo: 'chips_multi', selected: [], opciones: ops });
    });
  }

  function afterAlarmas(selected) {
    pushHistory();
    S.alarmas = selected.slice();
    userSay(selected.map(function (id) {
      if (id === 'ninguna') return 'Ninguna de estas';
      return labelOf(D.alarmas, id);
    }).join('; '));
    if (selected.length && selected[0] !== 'ninguna') {
      S.fase = 'urgencia';
      track('urgencia');
      var mental = selected.some(function (id) {
        return D.alarmas.some(function (a) { return a.id === id && a.tipo === 'salud_mental'; });
      });
      var lineas = mental
        ? '<div class="mt-3 rounded-xl bg-white/70 p-3 text-sm"><p class="m-0 font-semibold">No estás solo. Habla ahora:</p><ul class="mt-2 mb-0 pl-4"><li><a class="text-primary-600 underline" href="tel:106">Línea 106</a> (Bogotá)</li><li><a class="text-primary-600 underline" href="tel:192">Línea 192, opción 4</a></li><li><a class="text-primary-600 underline" href="tel:123">123</a></li></ul></div>'
        : '';
      botThen('<div class="os-alerta"><p class="m-0 text-sm font-semibold uppercase text-red-700">Atención inmediata</p><p class="mt-1 mb-0"><strong>Busca atención de urgencias ahora.</strong> Llama al <a href="tel:123" class="underline">123</a> o ve al servicio de urgencias más cercano. No tomes medicamentos por tu cuenta.</p>' + lineas + '</div>', function () {
        ask({ tipo: 'confirm', opciones: [{ v: 'alarma_error', t: 'Me equivoqué al marcar' }, { v: 'reiniciar', t: 'Terminar' }] });
      });
      return;
    }
    beginPreguntas();
  }

  function beginPreguntas() {
    S.fase = 'pregunta';
    S.qi = 0;
    botThen('<p class="m-0">' + esc(COPY.semiologia || COPY.alarmas_ok) + '</p><p class="mt-1 mb-0 text-sm text-primary-600">' + esc(S.cat.titulo) + '</p>', function () {
      askPregunta();
    });
  }

  function askPregunta() {
    var p = S.cat.preguntas[S.qi];
    track('pregunta_' + (S.qi + 1));
    var sub = p.tipo === 'multi' ? '<p class="mt-1 mb-0 text-sm text-gray-500">Puedes marcar varias.</p>' : '';
    botThen('<p class="m-0"><strong>' + esc(p.texto) + '</strong></p>' + sub, function () {
      var ops = p.opciones.map(function (o) { return { v: o.v, t: o.t, exclusiva: !!o.exclusiva }; });
      if (p.tipo === 'multi') ask({ tipo: 'chips_multi', selected: [].concat(S.resp[p.id] || []), opciones: ops, qid: p.id });
      else ask({ tipo: 'chips', opciones: ops, qid: p.id });
    });
  }

  function afterPregunta(val) {
    pushHistory();
    var p = S.cat.preguntas[S.qi];
    S.resp[p.id] = p.tipo === 'multi' ? val.slice() : val;
    var labs;
    if (p.tipo === 'multi') {
      labs = p.opciones.filter(function (o) { return val.indexOf(o.v) !== -1; }).map(function (o) { return o.t; }).join('; ');
    } else {
      labs = (p.opciones.filter(function (o) { return o.v === val; })[0] || {}).t || val;
    }
    userSay(labs);
    // Red-flag from option nivel prioritaria with certain patterns — keep flowing; result will show prioritaria
    if (S.qi < S.cat.preguntas.length - 1) {
      S.qi++;
      askPregunta();
    } else {
      S.fase = 'tratamientos';
      track('tratamientos');
      botThen('<p class="m-0">' + esc(COPY.tratamientos) + '</p>', function () {
        ask({ tipo: 'text_optional', max: 400, placeholder: 'Ej. ibuprofeno, reposo, nada…', label: 'Tratamientos probados', value: S.tratamientos });
      });
    }
  }

  function afterTratamientos(text) {
    pushHistory();
    S.tratamientos = text || 'Nada';
    userSay(S.tratamientos);
    S.fase = 'antecedentes';
    track('antecedentes');
    botThen('<p class="m-0">' + esc(COPY.antecedentes) + '</p>', function () {
      ask({
        tipo: 'chips_multi',
        selected: [],
        opciones: D.antecedentes.map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; })
      });
    });
  }

  function afterAntecedentes(sel) {
    pushHistory();
    S.antecedentes = sel.slice();
    userSay(sel.map(function (id) { return labelOf(D.antecedentes, id); }).join('; '));
    S.fase = 'quirurgicos';
    botThen('<p class="m-0">' + esc(COPY.quirurgicos) + '</p>', function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Ej. Apendicectomía 2019 / No', label: 'Antecedentes quirúrgicos' });
    });
  }

  function afterQuirurgicos(text) {
    pushHistory();
    S.quirurgicos = text || 'No';
    userSay(S.quirurgicos);
    S.fase = 'toxicos';
    botThen('<p class="m-0">' + esc(COPY.toxicos) + '</p>', function () {
      ask({
        tipo: 'chips_multi',
        selected: [],
        opciones: D.toxicos.map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; })
      });
    });
  }

  function afterToxicos(sel) {
    pushHistory();
    S.toxicos = sel.slice();
    userSay(sel.map(function (id) { return labelOf(D.toxicos, id); }).join('; '));
    S.fase = 'alergias';
    botThen('<p class="m-0">' + esc(COPY.alergias) + '</p>', function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Ej. Penicilina / Ninguna', label: 'Alergias' });
    });
  }

  function afterAlergias(text) {
    pushHistory();
    S.alergias = text || 'Ninguna';
    userSay(S.alergias);
    S.fase = 'medicamentos';
    botThen('<p class="m-0">' + esc(COPY.medicamentos) + '</p>', function () {
      ask({ tipo: 'text_optional', max: 300, placeholder: 'Ej. Losartán 50 mg / Ninguno', label: 'Medicamentos' });
    });
  }

  function afterMedicamentos(text) {
    pushHistory();
    S.medicamentos = text || 'Ninguno';
    userSay(S.medicamentos);
    if (S.sexo === 'mujer') {
      S.fase = 'gineco';
      botThen('<p class="m-0">' + esc(COPY.gineco) + '</p>', function () {
        ask({
          tipo: 'chips_multi',
          selected: [],
          opciones: D.gineco.map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; })
        });
      });
    } else {
      afterGineco(['ninguna'], true);
    }
  }

  function afterGineco(sel, silent) {
    if (!silent) {
      pushHistory();
      S.gineco = sel.slice();
      userSay(sel.map(function (id) { return labelOf(D.gineco, id); }).join('; '));
    } else {
      S.gineco = sel.slice();
    }
    // Familiares: relevant for capilar, animo, energia, dolor
    var famCats = { capilar: 1, animo: 1, energia: 1, dolor: 1, sexual: 1 };
    if (S.cat && famCats[S.cat.id]) {
      S.fase = 'familiares';
      botThen('<p class="m-0">' + esc(COPY.familiares) + '</p>', function () {
        ask({ tipo: 'text_optional', max: 300, placeholder: 'Ej. Padre con calvicie / Ninguno', label: 'Antecedentes familiares' });
      });
    } else {
      afterFamiliares('Ninguno', true);
    }
  }

  function afterFamiliares(text, silent) {
    if (!silent) {
      pushHistory();
      S.familiares = text || 'Ninguno';
      userSay(S.familiares);
    } else {
      S.familiares = text || 'Ninguno';
    }
    showResultado();
  }

  function showResultado() {
    S.fase = 'resultado';
    track('resultado');
    botThen('<p class="m-0">' + esc(COPY.cierre) + '</p>', function () {
      var r = evaluar();
      var e = espInfo(r.esp);
      var banners = {
        autocuidado: ['Puedes empezar con cuidados en casa', 'Por lo que contaste, suele mejorar con medidas generales. Si no mejora, empeora o aparecen síntomas nuevos, consulta.'],
        consulta: ['Te recomendamos una valoración médica', 'Un profesional puede confirmar la causa y darte un tratamiento adecuado para ti.'],
        prioritaria: ['Te recomendamos consultar pronto', 'Algo de lo que marcaste necesita valoración médica en los próximos días. Si empeora o hay una señal de alarma, ve a urgencias o llama al 123.']
      };
      var b = banners[r.nivel];
      var html = '<div class="os-result">' +
        '<p class="os-result-kicker">Impresión orientativa · ' + esc(S.cat.titulo) + '</p>' +
        '<p class="os-result-title">' + esc(b[0]) + '</p>' +
        '<p class="os-result-body">' + esc(b[1]) + '</p>' +
        '<p class="os-result-disc">Esto <strong>no es un diagnóstico</strong>. Son posibles causas y próximos pasos orientativos, pendientes de validación médica.</p>';

      if (r.causas.length) {
        html += '<h3>Posibles causas</h3><ul class="os-result-list">';
        r.causas.forEach(function (k) {
          var c = S.cat.causas[k];
          if (c) html += '<li><strong>' + esc(c.t) + '</strong><span>' + esc(c.d) + '</span></li>';
        });
        html += '</ul>';
      }

      html += '<h3>Próximos pasos</h3>';
      if (S.cat.nota) html += '<p class="os-result-body">' + esc(S.cat.nota) + '</p>';

      if (r.examenes.length) {
        html += '<p class="os-result-sub"><strong>Exámenes que tu médico podría solicitar</strong> (informativo; no es una orden):</p><ul class="os-result-bullets">';
        r.examenes.forEach(function (ex) { html += '<li>' + esc(ex) + '</li>'; });
        html += '</ul>';
      }

      if (r.otc.length) {
        html += '<p class="os-result-sub"><strong>Productos de venta libre</strong> que suelen usarse para aliviar síntomas (no son un tratamiento indicado para ti):</p>';
        r.otc.forEach(function (p) {
          html += '<div class="os-otc"><p class="m-0 font-semibold">' + esc(p.nombre) + '</p><p class="mt-1 mb-0 text-sm">' + esc(p.uso) + '</p><ul class="mt-1 mb-0 pl-4 text-sm">' +
            p.advertencias.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
        });
        html += '<div class="os-warn"><p class="m-0 font-semibold">Antes de usar cualquier producto</p><ul class="mt-1 mb-0 pl-4">' +
          D.otcAvisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
      } else if (r.embarazo) {
        html += '<p class="os-result-body">Por embarazo o lactancia no te mostramos medicamentos: consulta a tu médico antes de tomar cualquiera.</p>';
      } else if (r.nivel === 'prioritaria') {
        html += '<p class="os-result-body">Por lo que marcaste, no te sugerimos automedicarte. Lo mejor es valoración pronto.</p>';
      }

      html += '<div class="os-remision"><p class="m-0 font-semibold">Remisión sugerida: ' + esc(e.nombre) + '</p>' +
        '<p class="mt-1 mb-0 text-sm">' + (e.modalidades.indexOf('telemedicina') !== -1 ? 'Disponible virtual o presencial.' : 'Disponible de forma presencial en Bogotá.') + '</p></div></div>';

      say(html);
      ask({
        tipo: 'result_actions',
        html: '<div class="os-chips">' +
          '<button type="button" class="os-chip os-chip-primary" data-os="agendar" id="OS_CTA_AGENDAR">Agendar cita</button>' +
          (e.url ? '<a class="os-chip" href="' + esc(e.url) + '">Conocer el servicio</a>' : '') +
          '<button type="button" class="os-chip" data-os="reiniciar">Nueva orientación</button>' +
          '</div>'
      });
      renderHc();
    });
  }

  function showAgendar() {
    S.fase = 'agendar';
    track('agendar');
    var r = evaluar();
    var e = espInfo(r.esp);
    if (!e.especialidad) {
      var msg = 'Hola, hice la orientación de síntomas en la web y quiero agendar una cita de medicina general.';
      botThen('<p class="m-0">Para <strong>medicina general</strong> te atendemos por WhatsApp (fecha, hora y modalidad). El mensaje no incluye tus síntomas.</p>', function () {
        ask({
          tipo: 'result_actions',
          html: '<div class="os-chips"><a class="os-chip os-chip-primary" id="OS_CTA_WHATSAPP" target="_blank" rel="noopener" href="' + esc(C.whatsapp + encodeURIComponent(msg)) + '">Agendar por WhatsApp</a><button type="button" class="os-chip" data-os="atras-resultado">Volver</button></div>'
        });
      });
      return;
    }
    if (e.modalidades.indexOf(S.modalidad) === -1) S.modalidad = e.modalidades.length === 1 ? e.modalidades[0] : '';
    var nombresMod = { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (telemedicina)' };
    botThen('<p class="m-0">Agenda tu cita de <strong>' + esc(e.nombre) + '</strong>. Elige la modalidad:</p>', function () {
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
    html += '<label class="os-check' + (S.compartir ? ' is-on' : '') + '"><input type="checkbox" data-os="compartir"' + (S.compartir ? ' checked' : '') + '><span><strong>Compartir mi historia preliminar con el profesional</strong> (opcional, recomendado). Llega como información previa pendiente de validación médica.</span></label>';
    if (S.compartir) {
      html += '<label class="os-check' + (S.consDatos ? ' is-on' : '') + '"><input type="checkbox" data-os="cons-datos"' + (S.consDatos ? ' checked' : '') + '><span>' + esc(C.txtDatos) + ' <a class="text-primary-600 underline" target="_blank" rel="noopener" href="' + esc(C.privacidad) + '">Política de privacidad</a>. <small class="text-error-600">*</small></span></label>';
    }
    var ok = S.modalidad && (S.modalidad !== 'telemedicina' || S.consTele) && (!S.compartir || S.consDatos);
    html += '<div class="os-chips mt-2"><button type="button" class="os-chip" data-os="atras-resultado">Volver</button>' +
      '<button type="button" class="os-chip os-chip-primary" data-os="abrir-agenda" id="OS_CTA_FECHA"' + (ok ? '' : ' disabled') + '>Elegir fecha y hora</button></div>';
    html += '<p class="os-hint">' + (S.compartir ? 'Tus respuestas se envían solo cuando confirmes la cita.' : 'Si no marcas compartir, tus respuestas no salen de tu navegador.') + '</p></div>';
    ask({ tipo: 'agendar_ui', html: html });
  }

  // ---------- Events ----------
  function toggleMulti(list, v, exclusiva) {
    var i = list.indexOf(v);
    if (i !== -1) { list.splice(i, 1); return list; }
    if (exclusiva) return [v];
    return list.filter(function (x) {
      // drop exclusive options when picking normal
      var opt = (inputMode.opciones || []).filter(function (o) { return o.v === x; })[0];
      return !(opt && opt.exclusiva);
    }).concat(v);
  }

  function goBack() {
    if (!S.history.length || busy) return;
    // Remove last user + following bot messages roughly: pop last user bubble and after
    var snap = S.history.pop();
    // Trim messages to before last user
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { msgs = msgs.slice(0, i); break; }
    }
    S.fase = snap.fase;
    S.edad = snap.edad; S.sexo = snap.sexo; S.relato = snap.relato;
    S.alarmas = snap.alarmas; S.qi = snap.qi; S.resp = snap.resp;
    S.antecedentes = snap.antecedentes; S.quirurgicos = snap.quirurgicos;
    S.toxicos = snap.toxicos; S.gineco = snap.gineco; S.familiares = snap.familiares;
    S.alergias = snap.alergias; S.medicamentos = snap.medicamentos;
    S.tratamientos = snap.tratamientos; S.entiende = snap.entiende;
    S.cat = snap.catId ? catById(snap.catId) : null;
    // Re-prompt current fase without adding new bot message if possible — re-ask
    inputMode = null;
    renderChrome();
    reaskCurrent();
  }

  function reaskCurrent() {
    var f = S.fase;
    if (f === 'inicio') {
      ask({ tipo: 'confirm', opciones: [{ v: 'adulto', t: 'Sí, 18 años o más', primary: true }, { v: 'menor', t: 'No, es menor de 18' }] });
    } else if (f === 'sexo') {
      ask({ tipo: 'chips', opciones: D.sexo.map(function (o) { return { v: o.v, t: o.t }; }) });
    } else if (f === 'motivo') {
      ask({ tipo: 'text', max: 1000, placeholder: 'Escribe tu motivo…', value: S.relato });
    } else if (f === 'categoria') {
      ask({ tipo: 'chips', opciones: D.categorias.map(function (c) { return { v: c.id, t: c.titulo }; }) });
    } else if (f === 'alarmas') {
      var ops = D.alarmas.map(function (a) { return { v: a.id, t: a.texto }; });
      ops.push({ v: 'ninguna', t: 'Ninguna de estas', exclusiva: true });
      ask({ tipo: 'chips_multi', selected: [], opciones: ops });
    } else if (f === 'pregunta') {
      askPregunta();
    } else if (f === 'tratamientos') {
      ask({ tipo: 'text_optional', max: 400, placeholder: '…', value: S.tratamientos });
    } else if (f === 'antecedentes') {
      ask({ tipo: 'chips_multi', selected: [], opciones: D.antecedentes.map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'quirurgicos') {
      ask({ tipo: 'text_optional', max: 300, value: S.quirurgicos });
    } else if (f === 'toxicos') {
      ask({ tipo: 'chips_multi', selected: [], opciones: D.toxicos.map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'alergias') {
      ask({ tipo: 'text_optional', max: 300, value: S.alergias });
    } else if (f === 'medicamentos') {
      ask({ tipo: 'text_optional', max: 300, value: S.medicamentos });
    } else if (f === 'gineco') {
      ask({ tipo: 'chips_multi', selected: [], opciones: D.gineco.map(function (a) { return { v: a.id, t: a.texto, exclusiva: !!a.exclusiva }; }) });
    } else if (f === 'familiares') {
      ask({ tipo: 'text_optional', max: 300, value: S.familiares });
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

    if (a === 'mod') {
      S.modalidad = b.getAttribute('data-v');
      paintAgendarForm(espInfo(evaluar().esp), { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (telemedicina)' });
      return;
    }
    if (a === 'cons-tele' || a === 'compartir' || a === 'cons-datos') {
      // handled on change
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
      // single chip / confirm
      handleSingle(v);
      return;
    }
    if (a === 'multi-ok') {
      if (!inputMode || !(inputMode.selected || []).length) return;
      handleMulti(inputMode.selected.slice());
    }
  });

  root.addEventListener('change', function (ev) {
    var t = ev.target;
    var a = t.getAttribute('data-os');
    if (a === 'cons-tele') S.consTele = t.checked;
    else if (a === 'compartir') S.compartir = t.checked;
    else if (a === 'cons-datos') S.consDatos = t.checked;
    else return;
    if (S.fase === 'agendar') {
      paintAgendarForm(espInfo(evaluar().esp), { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (telemedicina)' });
    }
  });

  root.addEventListener('submit', function (ev) {
    var form = ev.target.closest('[data-os="text-form"]');
    if (!form) return;
    ev.preventDefault();
    if (busy || !inputMode) return;
    var ta = form.querySelector('#os-text');
    var text = (ta && ta.value || '').trim();
    if (inputMode.tipo === 'text' && text.length < 3) {
      ta.focus();
      return;
    }
    handleText(text);
  });

  function handleSingle(v) {
    if (v === 'reiniciar') { reset(); start(); return; }
    if (v === 'alarma_error') {
      // back to alarmas
      goBack();
      return;
    }
    if (v === 'entiende') { afterEntiende(); return; }
    if (S.fase === 'inicio' || (!S.entiende && (v === 'adulto' || v === 'menor'))) {
      if (v === 'adulto' || v === 'menor') afterEdad(v);
      return;
    }
    if (S.fase === 'sexo') { afterSexo(v); return; }
    if (S.fase === 'categoria') { afterCategoria(v); return; }
    if (S.fase === 'pregunta') { afterPregunta(v); return; }
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
    if (S.fase === 'quirurgicos') { afterQuirurgicos(text); return; }
    if (S.fase === 'alergias') { afterAlergias(text); return; }
    if (S.fase === 'medicamentos') { afterMedicamentos(text); return; }
    if (S.fase === 'familiares') { afterFamiliares(text); return; }
  }

  // ---------- Sidebar booking (unchanged contract) ----------
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
      cita: { nombre: nombre, telefono: codigoPais() + tel, fecha: fecha, hora: hora, modalidad: modalidad, tipo_cita: valor('#specialtyAppointment') },
      consentimientos: { datos: true, telemedicina: modalidad === 'telemedicina' && S.consTele, version: C.consentVersion },
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
