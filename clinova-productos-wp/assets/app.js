/**
 * Clinova · Productos — menú, quiz y enlaces de demo.
 * Los IDs de GTM viven en el HTML (y en los botones que arma el quiz):
 * *-CLINOVA-PRODUCTOS-V1-*.
 *
 * utm_content del registro en clinova24.com: clinova | notes | extension |
 * capitan | kiosko | inbox | asesoria.
 */
(function () {
  'use strict';

  var CFG = {
    DEMO_URL: 'https://clinova24.com/solicitar-demo/',
    DEMO_UTM: {
      utm_source: 'clinova-productos',
      utm_medium: 'landing',
      utm_campaign: 'productos-clinova'
    },
    DEMO_UTM_CONTENT: {
      clinova: 'clinova',
      notes: 'notes',
      extension: 'extension',
      capitan: 'capitan',
      kiosko: 'kiosko',
      inbox: 'inbox',
      'no-se': 'asesoria'
    },
    NOTES_REGISTER_URL: 'https://notes.clinova24.com/register',
    CHROME_STORE_URL: 'https://chromewebstore.google.com/detail/clinova-notes-%E2%80%94-autollena/nodeodcobaohjebegajgbbbjijipdfka'
  };

  function boot() {
    var root = document.getElementById('clinova-productos');
    if (!root) return;

    var $ = function (s, r) { return (r || root).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };

    var burger = $('#cp-burger');
    var menu = $('#cp-mmenu');
    if (burger && menu) {
      burger.addEventListener('click', function () {
        var open = menu.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      $$('#cp-mmenu a').forEach(function (a) {
        a.addEventListener('click', function () {
          menu.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    var rev = $$('.cp-reveal');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -40px 0px' });
      rev.forEach(function (el) { io.observe(el); });
    } else {
      rev.forEach(function (el) { el.classList.add('is-in'); });
    }

    var PRODUCTS = {
      clinova: {
        name: 'Clinova',
        full: 'Clinova (software completo)',
        tag: 'Software completo',
        icon: 'clinova',
        def: 'El software completo, para quien quiere un software nuevo.'
      },
      notes: {
        name: 'Clinova Notes',
        full: 'Clinova Notes',
        tag: 'App y web',
        icon: 'notes',
        def: 'Se escribe la nota y se copia y pega en cualquier historia clínica.'
      },
      extension: {
        name: 'Extensión de Chrome',
        full: 'Extensión de Chrome',
        tag: 'Para Google Chrome',
        icon: 'ext',
        def: 'Funciona sobre cualquier historia clínica que se abra en Chrome.'
      },
      capitan: {
        name: 'Clinova Capitán',
        full: 'Clinova Capitán',
        tag: 'Sistema de turnos',
        icon: 'capitan',
        def: 'Manejo de turnos. Es un QMS (sistema de turnos).'
      },
      kiosko: {
        name: 'Clinova Kiosko',
        full: 'Clinova Kiosko',
        tag: 'Recepción',
        icon: 'kiosko',
        def: 'Gestión de recepción desde un kiosko.'
      },
      inbox: {
        name: 'Clinova Inbox',
        full: 'Clinova Inbox',
        tag: 'Llamar y agendar',
        icon: 'inbox',
        def: 'Automatiza todo el proceso de llamar y agendar.'
      },
      'no-se': {
        name: 'Clinova',
        full: 'Clinova',
        tag: 'Asesoría',
        icon: 'clinova',
        def: ''
      }
    };

    var ICONS = {
      clinova: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7 9h4M7 13h7"/>',
      notes: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 7v5M10 10a2 2 0 0 0 4 0"/>',
      ext: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5h8.5M9 13.8 4.8 6.6M15 13.8l-4.2 7.3"/>',
      capitan: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
      kiosko: '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
      inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-6z"/>'
    };

    function demoUrl(p) {
      var q = [];
      var utm = CFG.DEMO_UTM || {};
      Object.keys(utm).forEach(function (k) {
        q.push(k + '=' + encodeURIComponent(utm[k]));
      });
      var c = (CFG.DEMO_UTM_CONTENT || {})[p || 'no-se'];
      if (c) q.push('utm_content=' + encodeURIComponent(c));
      return CFG.DEMO_URL + (q.length ? '?' + q.join('&') : '');
    }

    var CWS = CFG.CHROME_STORE_URL;
    var NOTES = CFG.NOTES_REGISTER_URL;
    $$('[data-demo-product]').forEach(function (a) {
      a.href = demoUrl(a.getAttribute('data-demo-product'));
    });
    $$('[data-cws]').forEach(function (a) { a.href = CWS; });
    $$('[data-notes]').forEach(function (a) { a.href = NOTES; });

    var QUESTIONS = [
      {
        id: 'control',
        q: '¿Puede elegir o cambiar el software de historia clínica donde atiende?',
        help: 'Piense en el sistema donde hoy deja la historia de sus pacientes.',
        opts: [
          { v: 'yes', e: '✅', t: 'Sí, yo decido', s: 'Consultorio propio o soy quien elige el software' },
          { v: 'no', e: '🏥', t: 'No, lo define la institución', s: 'El hospital, la clínica o la EPS ya tiene su sistema' },
          { v: 'none', e: '📝', t: 'Aún no tengo historia clínica electrónica', s: 'Uso papel, Word o Excel' }
        ]
      },
      {
        id: 'where',
        q: '¿Dónde atiende la mayor parte del tiempo?',
        opts: [
          { v: 'own', e: '🩺', t: 'En mi consultorio', s: 'Trabajo de forma independiente' },
          { v: 'clinic', e: '🏢', t: 'En la IPS o centro médico que dirijo', s: 'Varios profesionales o sedes' },
          { v: 'employee', e: '👩‍⚕️', t: 'Como empleado de un hospital o clínica', s: 'Turnos, urgencias, consulta externa' },
          { v: 'mixed', e: '🔀', t: 'En varios lugares', s: 'Un poco de cada uno' }
        ]
      },
      {
        id: 'admin',
        q: 'Además de la historia clínica, ¿necesita agenda, facturación o RIPS?',
        opts: [
          { v: 'yes', e: '📅', t: 'Sí, quiero todo en un solo lugar', s: 'Citas, fórmulas, facturas y reportes' },
          { v: 'no', e: '✍️', t: 'No, solo quiero escribir menos', s: 'Que la nota quede lista más rápido' }
        ]
      },
      {
        id: 'device',
        q: '¿Dónde escribe hoy la historia clínica?',
        opts: [
          { v: 'browser', e: '🌐', t: 'En el computador, dentro del navegador', s: 'Chrome, Edge… la historia clínica es una página web' },
          { v: 'desktop', e: '🖥️', t: 'En un programa instalado en el computador', s: 'No se abre en el navegador' },
          { v: 'phone', e: '📱', t: 'Me gustaría hacerlo desde el celular', s: 'Dictar entre paciente y paciente' },
          { v: 'unsure', e: '🤔', t: 'No estoy seguro', s: 'Ayúdenme a decidir' }
        ]
      },
      {
        id: 'operacion',
        q: 'Además de la nota clínica, ¿qué quiere resolver en la operación?',
        help: 'Capitán, Kiosko e Inbox comparten el mismo perfil. Si no aplica, quédese con la historia clínica.',
        opts: [
          { v: 'turnos', e: '🎫', t: 'El manejo de turnos', s: 'Un QMS: el sistema de turnos de la sala' },
          { v: 'kiosko', e: '🖥️', t: 'La recepción desde un kiosko', s: 'Gestionar la llegada del paciente en un kiosko' },
          { v: 'agenda', e: '📞', t: 'Llamar y agendar', s: 'Automatizar el proceso de llamar y agendar' },
          { v: 'ninguna', e: '📋', t: 'Nada de eso', s: 'Me alcanza con documentar la consulta' }
        ]
      }
    ];

    var OPS = { turnos: 'capitan', kiosko: 'kiosko', agenda: 'inbox' };

    function recommend(a) {
      var sc = { clinova: 0, notes: 0, extension: 0 };
      if (a.control === 'yes') sc.clinova += 2;
      if (a.control === 'none') { sc.clinova += 2; sc.notes += 1; }
      if (a.control === 'no') { sc.notes += 2; sc.extension += 2; }
      if (a.where === 'own') sc.clinova += 1;
      if (a.where === 'clinic') sc.clinova += 3;
      if (a.where === 'employee') { sc.notes += 1; sc.extension += 1; sc.clinova -= 2; }
      if (a.where === 'mixed') { sc.notes += 1; sc.extension += 1; }
      if (a.admin === 'yes') sc.clinova += 3;
      else { sc.notes += 1; sc.extension += 1; }
      if (a.device === 'browser') sc.extension += 2;
      if (a.device === 'desktop' || a.device === 'phone') sc.notes += 2;
      if (a.device === 'unsure') { sc.clinova += 1; sc.notes += 1; }
      if (a.control === 'no') sc.clinova = -99;
      var best = 'notes';
      if (sc.clinova > sc.notes && sc.clinova > sc.extension) best = 'clinova';
      else if (sc.clinova === Math.max(sc.notes, sc.extension) && a.admin === 'yes') best = 'clinova';
      else if (sc.extension > sc.notes) best = 'extension';
      else if (sc.extension === sc.notes && a.device === 'browser') best = 'extension';
      return best;
    }

    function reasons(best, a) {
      var r = [];
      if (best === 'clinova') {
        if (a.control === 'yes') r.push('Usted puede elegir su software, así que le conviene uno completo en lugar de herramientas sueltas.');
        if (a.control === 'none') r.push('Todavía no tiene historia clínica electrónica: Clinova le da una nueva, con agenda, facturación y RIPS.');
        if (a.admin === 'yes') r.push('Quiere agenda, facturación y RIPS en el mismo lugar, y Clinova los trae incluidos.');
        if (a.where === 'clinic') r.push('Dirige una IPS o centro médico: Clinova está pensado para quien quiere un software nuevo.');
        if (a.where === 'own') r.push('Atiende en su consultorio: Clinova le sirve de principio a fin, desde la cita hasta la factura.');
      } else if (best === 'notes') {
        if (a.control === 'no') r.push('Su institución define la historia clínica: con Notes no tiene que cambiarla. Escribe la nota, la copia y la pega.');
        if (a.device === 'phone') r.push('Quiere hacerlo desde el celular: Notes es app y web.');
        if (a.device === 'desktop') r.push('Su historia clínica es un programa instalado: con Notes copia la nota y la pega en él.');
        if (a.admin === 'no') r.push('Lo que busca es escribir menos: Notes le entrega la nota lista para revisar y pegar.');
        if (a.control !== 'no' && a.admin !== 'yes') r.push('Puede empezar hoy sin migrar nada y pasar al software completo de Clinova más adelante, con el mismo perfil.');
      } else {
        r.push('Su historia clínica se abre en el navegador: la extensión llena los campos ahí mismo, en cualquier historia clínica.');
        if (a.control === 'no') r.push('No necesita que su institución cambie de sistema. Sirve, por ejemplo, si trabaja en un hospital y la historia clínica es web.');
        if (a.where === 'employee' || a.where === 'mixed') r.push('Le sirve en cualquier sitio donde atienda, porque funciona encima de la historia clínica que haya en Chrome.');
      }
      if (!r.length) r.push('Es la opción que mejor encaja con lo que nos contó.');
      return r.slice(0, 3);
    }

    function alsoText(best, a) {
      if (best === 'clinova') return '<b>¿Y si un día atiende donde no puede cambiar la historia clínica?</b> Con su mismo perfil puede usar Clinova Notes, en la app o en la web, y pegar la nota.';
      if (best === 'notes') {
        if (a.admin === 'yes' && a.control === 'no') return '<b>¿Quiere agenda y facturación?</b> Eso está en Clinova, el software completo, y requiere poder cambiar de sistema. Si abre consultorio propio, puede pasar a Clinova con el mismo perfil.';
        return '<b>¿La historia clínica se abre en Chrome?</b> Con la misma cuenta puede usar la extensión para que los campos se llenen solos.';
      }
      return '<b>¿Atiende también desde el celular?</b> Notes es app y web, y usa la misma cuenta. La nota se copia y se pega en cualquier historia clínica.';
    }

    var answers = {};
    var step = 0;
    var qbody = $('#cp-qbody');
    var qcount = $('#cp-qcount');
    var qbar = $('#cp-qbar');

    function esc(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function iconHtml(key) {
      return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[key] || '') + '</svg>';
    }

    function renderQ() {
      if (!qbody || !qcount || !qbar) return;
      var Q = QUESTIONS[step];
      qcount.textContent = 'Pregunta ' + (step + 1) + ' de ' + QUESTIONS.length;
      qbar.style.width = ((step / QUESTIONS.length) * 100) + '%';
      var h = '<div class="cp-q"><h3>' + esc(Q.q) + '</h3>' + (Q.help ? '<p class="cp-help">' + esc(Q.help) + '</p>' : '') + '<div class="cp-opts">';
      Q.opts.forEach(function (o) {
        var id = 'QUIZ-CLINOVA-PRODUCTOS-V1-' + Q.id.toUpperCase() + '-' + o.v.toUpperCase();
        h += '<button type="button" class="cp-opt" id="' + id + '" data-v="' + o.v + '" aria-pressed="' + (answers[Q.id] === o.v ? 'true' : 'false') + '"><span class="cp-em" aria-hidden="true">' + o.e + '</span><span>' + esc(o.t) + '<small>' + esc(o.s) + '</small></span></button>';
      });
      h += '</div><div class="cp-quiz-nav"><button type="button" class="cp-linkbtn" id="QUIZ-CLINOVA-PRODUCTOS-V1-ATRAS"' + (step === 0 ? ' disabled' : '') + '>← Atrás</button></div></div>';
      qbody.innerHTML = h;
      $$('.cp-opt', qbody).forEach(function (b) {
        b.addEventListener('click', function () {
          answers[Q.id] = b.getAttribute('data-v');
          $$('.cp-opt', qbody).forEach(function (x) {
            x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
          });
          setTimeout(function () {
            step += 1;
            if (step < QUESTIONS.length) renderQ();
            else renderResult();
          }, 180);
        });
      });
      var back = $('#QUIZ-CLINOVA-PRODUCTOS-V1-ATRAS', qbody);
      if (back) {
        back.addEventListener('click', function () {
          if (step > 0) { step -= 1; renderQ(); }
        });
      }
    }

    function renderResult() {
      var best = recommend(answers);
      var P = PRODUCTS[best];
      var opsKey = OPS[answers.operacion] || '';
      qcount.textContent = 'Su recomendación';
      qbar.style.width = '100%';
      var rs = reasons(best, answers);
      var ctas = '';
      if (best === 'clinova') {
        ctas = '<a class="cp-btn cp-btn-primary" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-DEMO-CLINOVA" href="' + esc(demoUrl('clinova')) + '">Registrarme a la demo de Clinova <span class="cp-arrow">→</span></a><a class="cp-btn cp-btn-outline" id="NAV-CLINOVA-PRODUCTOS-V1-QUIZ-VER-CLINOVA" href="#clinova">Ver qué incluye</a>';
      }
      if (best === 'notes') {
        ctas = '<a class="cp-btn cp-btn-accent" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-NOTES" href="' + esc(NOTES) + '" target="_blank" rel="noopener">Crear cuenta en Notes <span class="cp-arrow">→</span></a><a class="cp-btn cp-btn-outline" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-DEMO-NOTES" href="' + esc(demoUrl('notes')) + '">Prefiero una demo</a>';
      }
      if (best === 'extension') {
        ctas = '<a class="cp-btn cp-btn-teal" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-CHROME" href="' + esc(CWS) + '" target="_blank" rel="noopener">Instalar en Chrome <span class="cp-arrow">→</span></a><a class="cp-btn cp-btn-outline" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-DEMO-EXTENSION" href="' + esc(demoUrl('extension')) + '">Prefiero una demo</a>';
      }
      var opsBlock = '';
      if (opsKey && PRODUCTS[opsKey]) {
        var O = PRODUCTS[opsKey];
        var opsId = opsKey.toUpperCase();
        opsBlock = '<div class="cp-opsrec"><p><b>Para esa parte de la operación: ' + esc(O.name) + '.</b> ' + esc(O.def) + ' Comparte su perfil con el producto de la nota, así que puede pasar de uno a otro.</p><a class="cp-btn cp-btn-outline" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-DEMO-' + opsId + '" href="' + esc(demoUrl(opsKey)) + '">Solicitar demo de ' + esc(O.name) + ' <span class="cp-arrow">→</span></a></div>';
      }
      qbody.innerHTML = '<div class="cp-result" data-result="' + best + '"' + (opsKey ? ' data-ops="' + opsKey + '"' : '') + '><div class="cp-rhead"><span class="cp-pico cp-pico-' + P.icon + '">' + iconHtml(P.icon) + '</span><div><span class="cp-eyebrow">Le recomendamos</span><h3>' + esc(P.full) + '</h3></div></div>' +
        '<p class="cp-why"><b>¿Por qué?</b></p><ul>' + rs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<div class="cp-also">' + alsoText(best, answers) + '</div>' +
        opsBlock +
        '<div class="cp-ractions">' + ctas + '</div><div class="cp-quiz-nav"><button type="button" class="cp-linkbtn" id="QUIZ-CLINOVA-PRODUCTOS-V1-REINICIAR">↺ Volver a empezar</button><a class="cp-linkbtn" id="CTA-CLINOVA-PRODUCTOS-V1-QUIZ-DEMO-MAS" href="' + esc(demoUrl(best)) + '">¿Tiene más tiempo? Regístrese a la demo</a></div></div>';
      var restart = $('#QUIZ-CLINOVA-PRODUCTOS-V1-REINICIAR', qbody);
      if (restart) {
        restart.addEventListener('click', function () {
          answers = {};
          step = 0;
          renderQ();
        });
      }
      setPick(best);
    }

    var demoLink = $('#CTA-CLINOVA-PRODUCTOS-V1-DEMO-SUBMIT');
    var dcAlt = $('#cp-dc-alt');

    function setPick(v) {
      if (!PRODUCTS[v]) return;
      $$('.cp-dopt').forEach(function (b) {
        b.setAttribute('aria-checked', b.getAttribute('data-pick') === v ? 'true' : 'false');
      });
      if (demoLink) {
        demoLink.href = demoUrl(v);
        var label = v === 'no-se' ? 'Ir al registro de la demo ' : 'Ir al registro de la demo de ' + PRODUCTS[v].name + ' ';
        if (demoLink.firstChild) demoLink.firstChild.textContent = label;
      }
      if (!dcAlt) return;
      if (v === 'notes') {
        dcAlt.hidden = false;
        dcAlt.innerHTML = '¿Prefiere probar ya? <a id="CTA-CLINOVA-PRODUCTOS-V1-DEMO-ALT-NOTES" href="' + esc(NOTES) + '" target="_blank" rel="noopener">Cree su cuenta en Clinova Notes</a>.';
      } else if (v === 'extension') {
        dcAlt.hidden = false;
        dcAlt.innerHTML = '¿Prefiere probar ya? <a id="CTA-CLINOVA-PRODUCTOS-V1-DEMO-ALT-CHROME" href="' + esc(CWS) + '" target="_blank" rel="noopener">Instale la extensión en Chrome</a>. Requiere cuenta de Notes.';
      } else {
        dcAlt.hidden = true;
        dcAlt.innerHTML = '';
      }
    }

    $$('.cp-dopt').forEach(function (b) {
      b.addEventListener('click', function () { setPick(b.getAttribute('data-pick')); });
    });

    if (qbody) renderQ();

    window.__clinova = { recommend: recommend, demoUrl: demoUrl, setPick: setPick, products: PRODUCTS };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
