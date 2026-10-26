/**
 * Orientación de síntomas (page-orientacion-de-sintomas.php).
 *
 * Flujo por pasos en memoria (sin localStorage ni cookies): inicio → señales
 * de alarma → categoría → preguntas → seguridad → resultado → agendar.
 * El contenido viene de window.ROGANS_OS_DATOS (inc/orientacion-sintomas-datos.php).
 *
 * Nada sale del navegador salvo que el paciente agende, marque "compartir"
 * y autorice el tratamiento de datos. Entonces, al enviar el sidebar de
 * agenda, se hace POST a rogans/v1/orientacion-sintomas/preconsulta con
 * keepalive (sobrevive a la redirección al checkout de las citas pagas).
 * El sidebar compartido no se modifica: se escucha su submit en captura.
 *
 * A dataLayer solo van nombres de paso, nunca síntomas ni categoría.
 */
(function () {
  'use strict';

  var D = window.ROGANS_OS_DATOS;
  var C = window.ROGANS_OS_CFG;
  var app = document.getElementById('os-app');
  if (!D || !C || !app) return;

  var RANK = { autocuidado: 0, consulta: 1, prioritaria: 2 };

  var S;
  function reset() {
    S = {
      paso: 'inicio',
      entiende: false,
      edad: '',
      alarmas: [],
      cat: null,
      qi: 0,
      resp: {},
      seguridad: [],
      modalidad: '',
      compartir: false,
      relato: '', antecedentes: '', alergias: '', medicamentos: '',
      consDatos: false,
      consTele: false,
      id: uuid(),
      enviado: false
    };
  }

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

  // ---------- Evaluación (espejo de rogans_os_reconstruir en PHP) ----------
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
    var embarazo = S.seguridad.indexOf('embarazo') !== -1;
    var otc = [];
    if (nivel !== 'prioritaria' && !embarazo) {
      Object.keys(cat.otc || {}).forEach(function (k) {
        var prod = D.otc[k];
        if (!prod) return;
        var aplica = cat.otc[k].some(function (c) { return causas.indexOf(c) !== -1; });
        var excluido = (prod.excluir_si || []).some(function (x) { return S.seguridad.indexOf(x) !== -1; });
        if (aplica && !excluido) otc.push(prod);
      });
    }
    return { nivel: nivel, esp: esp, causas: causas, otc: otc, embarazo: embarazo };
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

  // ---------- Render ----------
  function progreso() {
    var orden = ['inicio', 'alarmas', 'categoria', 'pregunta', 'seguridad', 'resultado', 'agendar'];
    var i = orden.indexOf(S.paso);
    if (i < 0) return '';
    var pct = Math.round(((i + (S.paso === 'pregunta' && S.cat ? S.qi / S.cat.preguntas.length : 0)) / (orden.length - 1)) * 100);
    return '<div class="os-progreso mb-6" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Avance"><span style="width:' + Math.max(pct, 4) + '%"></span></div>';
  }

  function opcion(tipo, name, v, t, on) {
    return '<label class="os-opcion' + (on ? ' is-on' : '') + '"><input type="' + tipo + '" name="' + esc(name) + '" value="' + esc(v) + '"' + (on ? ' checked' : '') + '><span class="text-base text-gray-800">' + esc(t) + '</span></label>';
  }

  function titulo(t, sub) {
    return '<h2 tabindex="-1" class="m-0 text-xl md:text-2xl font-semibold text-gray-950">' + esc(t) + '</h2>' + (sub ? '<p class="mt-2 mb-0 text-base text-gray-600">' + sub + '</p>' : '');
  }

  function botones(atras, sigTexto, sigOk) {
    return '<div class="mt-6 flex flex-wrap items-center gap-3">' +
      (atras ? '<button type="button" class="os-btn-sec" data-os="atras"><i data-lucide="arrow-left" class="w-4 h-4" aria-hidden="true"></i> Atrás</button>' : '') +
      (sigTexto ? '<button type="button" class="btn-primary-500" data-os="siguiente"' + (sigOk ? '' : ' disabled') + '>' + esc(sigTexto) + '</button>' : '') +
      '</div>';
  }

  var VISTAS = {
    inicio: function () {
      return titulo('Antes de empezar', 'Esta herramienta te da <strong>orientación general</strong>, no un diagnóstico. Tus respuestas se quedan en tu navegador: no las enviamos ni las guardamos, salvo que decidas agendar y nos autorices a compartirlas con tu médico.') +
        '<div class="mt-6 grid gap-3">' +
        '<p class="m-0 text-sm font-semibold text-gray-700">¿Para quién es la orientación?</p>' +
        opcion('radio', 'os-edad', 'adulto', 'Para mí o para otra persona de 18 años o más', S.edad === 'adulto') +
        opcion('radio', 'os-edad', 'menor', 'Para un menor de 18 años', S.edad === 'menor') +
        '<label class="os-opcion mt-2' + (S.entiende ? ' is-on' : '') + '"><input type="checkbox" name="os-entiende" value="1"' + (S.entiende ? ' checked' : '') + '><span class="text-base text-gray-800">Entiendo que es una orientación general, que no es un diagnóstico y que no reemplaza la consulta con un profesional de la salud.</span></label>' +
        '</div>' + botones(false, 'Comenzar', S.entiende && S.edad);
    },
    menor: function () {
      return titulo('Esta orientación es para mayores de 18 años', 'Los síntomas en niños y adolescentes deben ser valorados por su pediatra o médico. Si notas alguna señal de alarma (dificultad para respirar, fiebre muy alta, decaimiento marcado, convulsiones o deshidratación), <strong>llama al 123</strong> o ve a urgencias.') +
        '<div class="mt-6 flex flex-wrap gap-3"><a href="tel:123" class="btn-primary-500 inline-flex">Llamar al 123</a><button type="button" class="os-btn-sec" data-os="reiniciar">Volver al inicio</button></div>';
    },
    alarmas: function () {
      var html = titulo('¿Tienes ahora alguna de estas señales?', 'Marca todas las que apliquen. Si tienes alguna, necesitas atención inmediata.') + '<div class="mt-6 grid gap-3">';
      D.alarmas.forEach(function (a) { html += opcion('checkbox', 'os-alarma', a.id, a.texto, S.alarmas.indexOf(a.id) !== -1); });
      html += opcion('checkbox', 'os-alarma', 'ninguna', 'Ninguna de estas', S.alarmas.indexOf('ninguna') !== -1) + '</div>';
      return html + botones(true, 'Continuar', S.alarmas.length > 0);
    },
    urgencia: function () {
      var mental = S.alarmas.some(function (id) {
        return D.alarmas.some(function (a) { return a.id === id && a.tipo === 'salud_mental'; });
      });
      // PENDIENTE VERIFICACIÓN: líneas de salud mental vigentes.
      var lineas = mental ? '<div class="mt-6 rounded-2xl bg-primary-50 p-5"><p class="m-0 text-base font-semibold text-gray-950">No estás solo. Habla ahora con alguien:</p><ul class="mt-3 mb-0 pl-5 text-base text-gray-800"><li><a class="text-primary-600 underline" href="tel:106">Línea 106</a> (Bogotá, gratuita, todo el día)</li><li><a class="text-primary-600 underline" href="tel:192">Línea 192, opción 4</a> (salud mental, nacional)</li><li><a class="text-primary-600 underline" href="tel:123">Línea 123</a> (emergencias)</li></ul></div>' : '';
      return '<div class="rounded-2xl bg-red-50 border border-solid border-red-300 p-5 md:p-6"><p class="m-0 flex items-center gap-2 text-sm font-semibold text-red-700 uppercase"><i data-lucide="siren" class="w-5 h-5" aria-hidden="true"></i> Atención inmediata</p>' +
        '<h2 tabindex="-1" class="mt-2 mb-0 text-xl md:text-2xl font-semibold text-gray-950">Busca atención de urgencias ahora</h2>' +
        '<p class="mt-2 mb-0 text-base text-gray-700">Lo que marcaste puede necesitar atención médica inmediata. No esperes una cita: <strong>llama al 123</strong> o ve al servicio de urgencias más cercano. No tomes medicamentos por tu cuenta mientras tanto.</p>' +
        '<a href="tel:123" class="btn-primary-500 mt-5 inline-flex" id="OS_URGENCIA_123">Llamar al 123</a></div>' + lineas +
        '<div class="mt-6 flex flex-wrap gap-3"><button type="button" class="os-btn-sec" data-os="atras">Me equivoqué al marcar</button></div>';
    },
    categoria: function () {
      var html = titulo('¿Qué te está molestando?', 'Elige la opción que mejor describa lo que sientes.') + '<div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">';
      D.categorias.forEach(function (c) {
        html += '<button type="button" class="os-cat" data-os="categoria" data-id="' + esc(c.id) + '"><span class="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center"><i data-lucide="' + esc(c.icono) + '" class="w-5 h-5" aria-hidden="true"></i></span><span class="text-base font-semibold text-gray-950">' + esc(c.titulo) + '</span><span class="text-sm text-gray-600">' + esc(c.descripcion) + '</span></button>';
      });
      return html + '</div>' + botones(true, '', false);
    },
    pregunta: function () {
      var p = S.cat.preguntas[S.qi];
      var sel = [].concat(S.resp[p.id] || []);
      var html = '<p class="m-0 text-sm font-semibold text-primary-600">' + esc(S.cat.titulo) + ' · ' + (S.qi + 1) + ' de ' + S.cat.preguntas.length + '</p>' +
        '<div class="mt-2">' + titulo(p.texto, p.tipo === 'multi' ? 'Puedes marcar varias.' : '') + '</div><div class="mt-6 grid gap-3">';
      p.opciones.forEach(function (o) { html += opcion(p.tipo === 'multi' ? 'checkbox' : 'radio', 'os-q', o.v, o.t, sel.indexOf(o.v) !== -1); });
      return html + '</div>' + botones(true, 'Siguiente', sel.length > 0);
    },
    seguridad: function () {
      var html = titulo('Antes de ver tu orientación', '¿Alguna de estas situaciones aplica para ti? Nos ayuda a no mostrarte productos que no te convienen.') + '<div class="mt-6 grid gap-3">';
      D.seguridad.forEach(function (s) { html += opcion('checkbox', 'os-seg', s.id, s.texto, S.seguridad.indexOf(s.id) !== -1); });
      html += opcion('checkbox', 'os-seg', 'ninguna', 'Ninguna de estas', S.seguridad.indexOf('ninguna') !== -1) + '</div>';
      return html + botones(true, 'Ver mi orientación', S.seguridad.length > 0);
    },
    resultado: function () {
      var r = evaluar();
      var e = espInfo(r.esp);
      var banners = {
        autocuidado: ['bg-primary-50', 'Puedes empezar con cuidados en casa', 'Por lo que respondiste, suele mejorar con medidas generales. Si no mejora en unos días, empeora o aparecen síntomas nuevos, consulta.'],
        consulta: ['bg-primary-50', 'Te recomendamos una valoración médica', 'Un profesional puede confirmar la causa y darte un tratamiento adecuado para ti.'],
        prioritaria: ['bg-amber-50', 'Te recomendamos consultar pronto', 'Algo de lo que marcaste necesita valoración médica en los próximos días. Si empeora o aparece una señal de alarma, ve a urgencias o llama al 123.']
      };
      var b = banners[r.nivel];
      var html = '<div class="rounded-2xl ' + b[0] + ' p-5"><p class="m-0 text-sm font-semibold text-gray-600">Tu orientación · ' + esc(S.cat.titulo) + '</p><h2 tabindex="-1" class="mt-1 mb-0 text-xl md:text-2xl font-semibold text-gray-950">' + esc(b[1]) + '</h2><p class="mt-2 mb-0 text-base text-gray-700">' + esc(b[2]) + '</p></div>';

      if (r.causas.length) {
        html += '<h3 class="mt-8 mb-0 text-lg font-semibold text-gray-950">Posibles causas</h3><p class="mt-1 mb-0 text-sm text-gray-500">Son posibilidades generales según lo que respondiste. Solo un profesional puede confirmar qué tienes.</p><ul class="mt-4 m-0 p-0 list-none grid gap-3">';
        r.causas.forEach(function (k) {
          var c = S.cat.causas[k];
          if (c) html += '<li class="rounded-2xl border border-solid border-gray-200 p-4"><p class="m-0 text-base font-semibold text-gray-950">' + esc(c.t) + '</p><p class="mt-1 mb-0 text-sm text-gray-600">' + esc(c.d) + '</p></li>';
        });
        html += '</ul>';
      }

      html += '<h3 class="mt-8 mb-0 text-lg font-semibold text-gray-950">Qué puedes hacer mientras tanto</h3>';
      if (S.cat.nota) html += '<p class="mt-2 mb-0 text-base text-gray-700">' + esc(S.cat.nota) + '</p>';
      if (r.otc.length) {
        html += '<p class="mt-4 mb-0 text-sm text-gray-600">Productos de <strong>venta libre</strong> que suelen usarse para aliviar estos síntomas. No son un tratamiento indicado para ti:</p><ul class="mt-3 m-0 p-0 list-none grid gap-3">';
        r.otc.forEach(function (p) {
          html += '<li class="rounded-2xl bg-gray-50 p-4"><p class="m-0 text-base font-semibold text-gray-950">' + esc(p.nombre) + '</p><p class="mt-1 mb-0 text-sm text-gray-700">' + esc(p.uso) + '</p><ul class="mt-2 mb-0 pl-5 text-sm text-gray-600">' + p.advertencias.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></li>';
        });
        html += '</ul><div class="mt-3 rounded-2xl border border-solid border-amber-300 bg-amber-50 p-4 text-sm text-gray-800"><p class="m-0 font-semibold">Antes de usar cualquier producto</p><ul class="mt-2 mb-0 pl-5">' + D.otcAvisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
      } else if (r.embarazo) {
        html += '<p class="mt-3 mb-0 text-base text-gray-700">Como estás embarazada, puedes estarlo o estás lactando, no te mostramos medicamentos: consulta a tu médico antes de tomar cualquiera.</p>';
      } else if (r.nivel === 'prioritaria') {
        html += '<p class="mt-3 mb-0 text-base text-gray-700">Por lo que marcaste, no te sugerimos automedicarte. Lo mejor es que un profesional te valore pronto.</p>';
      } else {
        html += '<p class="mt-3 mb-0 text-base text-gray-700">Para estos síntomas no te sugerimos medicamentos sin una valoración. Un profesional puede indicarte el tratamiento adecuado.</p>';
      }

      html += '<div class="mt-8 rounded-2xl bg-gray-50 p-5"><p class="m-0 text-base font-semibold text-gray-950">Especialidad sugerida: ' + esc(e.nombre) + '</p><p class="mt-1 mb-0 text-sm text-gray-600">' +
        (e.modalidades.indexOf('telemedicina') !== -1 ? 'Disponible virtual o presencial.' : 'Disponible de forma presencial en Bogotá.') + '</p>' +
        '<div class="mt-4 flex flex-wrap gap-3"><button type="button" class="btn-primary-500" data-os="siguiente" id="OS_CTA_AGENDAR">Agendar cita</button>' +
        (e.url ? '<a href="' + esc(e.url) + '" class="os-btn-sec">Conocer el servicio</a>' : '') + '</div></div>' +
        '<p class="mt-6 mb-0 text-sm text-gray-500">Si en cualquier momento aparece una señal de alarma, ve a urgencias o llama al 123. Esta orientación no es un diagnóstico ni una prescripción.</p>' +
        '<div class="mt-4 flex flex-wrap gap-3"><button type="button" class="os-btn-sec" data-os="atras">Atrás</button><button type="button" class="os-btn-sec" data-os="reiniciar">Empezar de nuevo</button></div>';
      return html;
    },
    agendar: function () {
      var r = evaluar();
      var e = espInfo(r.esp);
      if (!e.especialidad) {
        // Medicina general no está en el sidebar: se agenda por WhatsApp. El
        // mensaje NO lleva síntomas (WhatsApp queda fuera de la historia clínica).
        var msg = 'Hola, hice la orientación de síntomas en la web y quiero agendar una cita de medicina general.';
        return titulo('Agenda tu cita de medicina general', 'Te atendemos por WhatsApp para elegir fecha, hora y modalidad (virtual o presencial). Por tu privacidad, el mensaje no incluye tus síntomas: se los cuentas al profesional en la consulta.') +
          '<div class="mt-6 flex flex-wrap gap-3"><a class="btn-primary-500 inline-flex" id="OS_CTA_WHATSAPP" target="_blank" rel="noopener" href="' + esc(C.whatsapp + encodeURIComponent(msg)) + '">Agendar por WhatsApp</a></div>' + botones(true, '', false);
      }
      if (e.modalidades.indexOf(S.modalidad) === -1) S.modalidad = e.modalidades.length === 1 ? e.modalidades[0] : '';
      var nombresMod = { presencial: 'Presencial (Bogotá)', telemedicina: 'Virtual (telemedicina)' };
      var html = titulo('Agenda tu cita de ' + e.nombre, 'Elige cómo quieres que te atiendan. En el siguiente paso eliges fecha y hora.') + '<div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">';
      e.modalidades.forEach(function (m) {
        var precio = e.precios[m] ? ' · ' + e.precios[m] : '';
        html += opcion('radio', 'os-mod', m, nombresMod[m] + precio, S.modalidad === m);
      });
      html += '</div>';
      if (e.modalidades.length === 1 && e.modalidades[0] === 'presencial') html += '<p class="mt-2 mb-0 text-sm text-gray-500">Esta especialidad solo se atiende de forma presencial.</p>';

      if (S.modalidad === 'telemedicina') {
        html += '<label class="os-opcion mt-4' + (S.consTele ? ' is-on' : '') + '"><input type="checkbox" name="os-cons-tele" value="1"' + (S.consTele ? ' checked' : '') + '><span class="text-sm text-gray-800">' + esc(C.txtTele) + ' <small class="text-error-600">*</small></span></label>';
      }

      html += '<div class="mt-6 rounded-2xl bg-gray-50 p-5"><label class="os-opcion' + (S.compartir ? ' is-on' : '') + '"><input type="checkbox" name="os-compartir" value="1"' + (S.compartir ? ' checked' : '') + '><span class="text-base text-gray-800"><strong>Compartir mis respuestas con el profesional</strong> para preparar mi consulta (opcional, recomendado). Llegan a mi historia clínica como información previa que el profesional confirma en la cita.</span></label>';
      if (S.compartir) {
        html += '<div class="mt-4 grid gap-4">' +
          campo('relato', 'Cuéntanos con tus palabras qué te pasa y desde cuándo', 1000, true) +
          campo('antecedentes', 'Enfermedades que tienes o cirugías que te han hecho', 500) +
          campo('alergias', 'Alergias a medicamentos u otras', 300) +
          campo('medicamentos', 'Medicamentos o suplementos que tomas hoy', 300) +
          '<label class="os-opcion' + (S.consDatos ? ' is-on' : '') + '"><input type="checkbox" name="os-cons-datos" value="1"' + (S.consDatos ? ' checked' : '') + '><span class="text-sm text-gray-800">' + esc(C.txtDatos) + ' <a class="text-primary-600 underline" target="_blank" rel="noopener" href="' + esc(C.privacidad) + '">Política de privacidad</a>. <small class="text-error-600">*</small></span></label></div>';
      }
      html += '</div>';

      var ok = S.modalidad && (S.modalidad !== 'telemedicina' || S.consTele) && (!S.compartir || S.consDatos);
      html += '<div class="mt-6 flex flex-wrap items-center gap-3"><button type="button" class="os-btn-sec" data-os="atras"><i data-lucide="arrow-left" class="w-4 h-4" aria-hidden="true"></i> Atrás</button><button type="button" class="btn-primary-500" data-os="abrir-agenda" id="OS_CTA_FECHA"' + (ok ? '' : ' disabled') + '>Elegir fecha y hora</button></div>' +
        '<p class="mt-3 mb-0 text-sm text-gray-500">' + (S.compartir ? 'Tus respuestas se envían solo cuando confirmes la cita.' : 'Si no marcas "compartir", tus respuestas no salen de tu navegador.') + '</p>';
      return html;
    }
  };

  function campo(k, label, max, area) {
    var id = 'os-' + k;
    var ctl = area
      ? '<textarea id="' + id + '" name="' + id + '" maxlength="' + max + '" rows="3" class="bg-white border border-solid border-gray-200 rounded-md text-base py-2.5 px-3.5 text-gray-950 w-full">' + esc(S[k]) + '</textarea>'
      : '<input id="' + id + '" name="' + id + '" type="text" maxlength="' + max + '" value="' + esc(S[k]) + '" class="bg-white border border-solid border-gray-200 rounded-md text-base py-2.5 px-3.5 text-gray-950 w-full">';
    return '<div><label for="' + id + '" class="text-xs font-medium text-gray-600 block mb-1">' + esc(label) + ' (opcional)</label>' + ctl + '</div>';
  }

  function render(foco) {
    app.innerHTML = progreso() + VISTAS[S.paso]();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    if (foco !== false) {
      var h = app.querySelector('h2');
      if (h) h.focus({ preventScroll: true });
      var top = document.getElementById('orientador').getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) document.getElementById('orientador').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function ir(paso) { S.paso = paso; track(paso === 'pregunta' ? 'pregunta_' + (S.qi + 1) : paso); render(); }

  // Selección con opción "ninguna"/exclusiva.
  function toggle(lista, v, exclusivas) {
    var i = lista.indexOf(v);
    if (i !== -1) { lista.splice(i, 1); return lista; }
    if (exclusivas.indexOf(v) !== -1) return [v];
    return lista.filter(function (x) { return exclusivas.indexOf(x) === -1; }).concat(v);
  }

  app.addEventListener('change', function (ev) {
    var t = ev.target;
    var n = t.name;
    if (n === 'os-edad') S.edad = t.value;
    else if (n === 'os-entiende') S.entiende = t.checked;
    else if (n === 'os-alarma') S.alarmas = toggle(S.alarmas, t.value, ['ninguna']);
    else if (n === 'os-seg') S.seguridad = toggle(S.seguridad, t.value, ['ninguna']);
    else if (n === 'os-q') {
      var p = S.cat.preguntas[S.qi];
      if (p.tipo === 'multi') {
        var excl = p.opciones.filter(function (o) { return o.exclusiva; }).map(function (o) { return o.v; });
        S.resp[p.id] = toggle([].concat(S.resp[p.id] || []), t.value, excl);
      } else S.resp[p.id] = t.value;
    }
    else if (n === 'os-mod') S.modalidad = t.value;
    else if (n === 'os-cons-tele') S.consTele = t.checked;
    else if (n === 'os-compartir') S.compartir = t.checked;
    else if (n === 'os-cons-datos') S.consDatos = t.checked;
    else return;
    render(false);
  });

  app.addEventListener('input', function (ev) {
    var k = (ev.target.name || '').replace(/^os-/, '');
    if (['relato', 'antecedentes', 'alergias', 'medicamentos'].indexOf(k) !== -1) S[k] = ev.target.value;
  });

  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-os]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-os');
    if (a === 'reiniciar') { reset(); ir('inicio'); return; }
    if (a === 'categoria') { S.cat = catById(b.getAttribute('data-id')); S.qi = 0; S.resp = {}; ir('pregunta'); return; }
    if (a === 'abrir-agenda') { abrirAgenda(); return; }
    var sig = a === 'siguiente';
    switch (S.paso) {
      case 'inicio': if (sig) ir(S.edad === 'menor' ? 'menor' : 'alarmas'); break;
      case 'alarmas':
        if (!sig) ir('inicio');
        else ir(S.alarmas.length && S.alarmas[0] !== 'ninguna' ? 'urgencia' : 'categoria');
        break;
      case 'urgencia': ir('alarmas'); break;
      case 'categoria': ir('alarmas'); break;
      case 'pregunta':
        if (sig) { if (S.qi < S.cat.preguntas.length - 1) { S.qi++; ir('pregunta'); } else ir('seguridad'); }
        else if (S.qi > 0) { S.qi--; ir('pregunta'); } else ir('categoria');
        break;
      case 'seguridad':
        if (sig) ir('resultado'); else { S.qi = S.cat.preguntas.length - 1; ir('pregunta'); }
        break;
      case 'resultado': ir(sig ? 'agendar' : 'seguridad'); break;
      case 'agendar': ir('resultado'); break;
    }
  });

  // ---------- Integración con el sidebar de agenda (sin modificarlo) ----------
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

    // En esta página toda cita virtual exige el consentimiento de telemedicina.
    if (modalidad === 'telemedicina' && !S.consTele) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      alert('Para agendar una cita virtual primero debes aceptar el consentimiento de telemedicina.');
      var cerrar = document.querySelector('.close-sidebar-appointment-general');
      if (cerrar) cerrar.click();
      if (S.cat) { S.modalidad = 'telemedicina'; ir('agendar'); }
      else document.getElementById('orientador').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!S.compartir || !S.consDatos || !S.cat || S.enviado) return;
    var nombre = valor('#nameAppointment');
    var tel = valor('#phoneAppointment').replace(/\D+/g, '');
    var fecha = valor('#dateAppointmentGeneral');
    var hora = valor('#timeAppointmentGeneral');
    // Mismas reglas mínimas que valida el sidebar; si fallan, el sidebar
    // muestra su alerta y no se envía nada.
    var terminos = document.getElementById('termsAndConditions');
    if (nombre.length < 2 || !/^\d{8,12}$/.test(tel) || !codigoPais() || !fecha || !hora || (terminos && !terminos.checked)) return;

    var seguridad = S.seguridad.filter(function (x) { return x !== 'ninguna'; });
    var body = {
      id: S.id,
      categoria: S.cat.id,
      respuestas: S.resp,
      seguridad: seguridad,
      relato: S.relato, antecedentes: S.antecedentes, alergias: S.alergias, medicamentos: S.medicamentos,
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
    } catch (e) { S.enviado = false; }
    track('preconsulta_enviada');
  }, true);

  reset();
  render(false);
})();
