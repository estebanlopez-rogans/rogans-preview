(function () {
  "use strict";
  var CFG = window.CLINOVA_LANDING_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Config en el HTML ---------- */
  if (CFG.LEGAL_ENTITY) $$(".legal-entity").forEach(function (el) { el.textContent = CFG.LEGAL_ENTITY; });
  if (CFG.NOTES_REGISTER_URL) $$('a[href="https://notes.clinova24.com/register"]').forEach(function (a) { a.href = CFG.NOTES_REGISTER_URL; });

  /* ---------- Menú móvil ---------- */
  var burger = $(".burger"), menu = $("#mmenu");
  burger.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $$("#mmenu a").forEach(function (a) { a.addEventListener("click", function () { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }); });

  /* ---------- Aparición suave ---------- */
  var rev = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -40px 0px" });
    rev.forEach(function (el) { io.observe(el); });
  } else { rev.forEach(function (el) { el.classList.add("in"); }); }

  /* ---------- Productos ---------- */
  var PRODUCTS = {
    pro: { name: "Clinova Pro", tag: "Software completo", icon: "pro" },
    notes: { name: "Clinova Notes", tag: "App + web", icon: "notes" },
    extension: { name: "Extensión de Chrome", tag: "Para Google Chrome", icon: "ext" },
    "no-se": { name: "Clinova", tag: "Asesoría", icon: "pro" }
  };

  /* ---------- Quiz "¿Cuál es para usted?" ---------- */
  var QUESTIONS = [
    { id: "control", q: "¿Puede elegir o cambiar el software de historia clínica donde atiende?",
      help: "Piense en el sistema donde hoy deja la historia de sus pacientes.",
      opts: [
        { v: "yes", e: "✅", t: "Sí, yo decido", s: "Consultorio propio o soy quien elige el software" },
        { v: "no", e: "🏥", t: "No, lo define la institución", s: "El hospital, la clínica o la EPS ya tiene su sistema" },
        { v: "none", e: "📝", t: "Aún no tengo historia clínica electrónica", s: "Uso papel, Word o Excel" }
      ] },
    { id: "where", q: "¿Dónde atiende la mayor parte del tiempo?",
      opts: [
        { v: "own", e: "🩺", t: "En mi consultorio", s: "Trabajo de forma independiente" },
        { v: "clinic", e: "🏢", t: "En la IPS o centro médico que dirijo", s: "Varios profesionales o sedes" },
        { v: "employee", e: "👩‍⚕️", t: "Como empleado de un hospital o clínica", s: "Turnos, urgencias, consulta externa" },
        { v: "mixed", e: "🔀", t: "En varios lugares", s: "Un poco de cada uno" }
      ] },
    { id: "admin", q: "Además de la historia clínica, ¿necesita agenda, facturación o RIPS?",
      opts: [
        { v: "yes", e: "📅", t: "Sí, quiero todo en un solo lugar", s: "Citas, fórmulas, facturas y reportes" },
        { v: "no", e: "✍️", t: "No, solo quiero escribir menos", s: "Que la nota quede lista más rápido" }
      ] },
    { id: "device", q: "¿Dónde escribe hoy la historia clínica?",
      opts: [
        { v: "browser", e: "🌐", t: "En el computador, dentro del navegador", s: "Chrome, Edge… la HC es una página web" },
        { v: "desktop", e: "🖥️", t: "En un programa instalado en el computador", s: "No se abre en el navegador" },
        { v: "phone", e: "📱", t: "Me gustaría hacerlo desde el celular", s: "Dictar entre paciente y paciente" },
        { v: "unsure", e: "🤔", t: "No estoy seguro", s: "Ayúdenme a decidir" }
      ] }
  ];

  function recommend(a) {
    var sc = { pro: 0, notes: 0, extension: 0 };
    if (a.control === "yes") sc.pro += 2;
    if (a.control === "none") { sc.pro += 2; sc.notes += 1; }
    if (a.control === "no") { sc.notes += 2; sc.extension += 2; }
    if (a.where === "own") sc.pro += 1;
    if (a.where === "clinic") sc.pro += 3;
    if (a.where === "employee") { sc.notes += 1; sc.extension += 1; sc.pro -= 2; }
    if (a.where === "mixed") { sc.notes += 1; sc.extension += 1; }
    if (a.admin === "yes") sc.pro += 3; else { sc.notes += 1; sc.extension += 1; }
    if (a.device === "browser") sc.extension += 2;
    if (a.device === "desktop" || a.device === "phone") sc.notes += 2;
    if (a.device === "unsure") { sc.pro += 1; sc.notes += 1; }
    if (a.control === "no") sc.pro = -99; // no puede cambiar la HC: Pro no aplica
    var best = "notes";
    if (sc.pro > sc.notes && sc.pro > sc.extension) best = "pro";
    else if (sc.pro === Math.max(sc.notes, sc.extension) && a.admin === "yes") best = "pro";
    else if (sc.extension > sc.notes) best = "extension";
    else if (sc.extension === sc.notes && a.device === "browser") best = "extension";
    return best;
  }

  function reasons(best, a) {
    var r = [];
    if (best === "pro") {
      if (a.control === "yes") r.push("Usted puede elegir su software, así que le conviene uno completo en lugar de herramientas sueltas.");
      if (a.control === "none") r.push("Todavía no tiene historia clínica electrónica: Pro le da una nueva, con todo lo que exige la norma.");
      if (a.admin === "yes") r.push("Quiere agenda, facturación y RIPS en el mismo lugar, y Pro los trae incluidos.");
      if (a.where === "clinic") r.push("Dirige una IPS o centro médico: Pro organiza a todo el equipo y sus sedes.");
      if (a.where === "own") r.push("Atiende en su consultorio: Pro le sirve de principio a fin, desde la cita hasta la factura.");
    } else if (best === "notes") {
      if (a.control === "no") r.push("Su institución define la historia clínica: con Notes no tiene que cambiarla.");
      if (a.device === "phone") r.push("Quiere hacerlo desde el celular: Notes tiene app para iPhone y Android, y también web.");
      if (a.device === "desktop") r.push("Su historia clínica es un programa instalado: con Notes copia la nota y la pega en él.");
      if (a.admin === "no") r.push("Lo que busca es escribir menos: Notes le entrega la nota lista para revisar.");
      if (a.control !== "no" && a.admin !== "yes") r.push("Puede empezar hoy sin migrar nada y pasar a Pro más adelante con el mismo perfil.");
    } else {
      r.push("Su historia clínica se abre en el navegador: la extensión llena los campos ahí mismo, sin copiar y pegar.");
      if (a.control === "no") r.push("No necesita que su institución cambie de sistema; solo poder usar Chrome.");
      if (a.where === "employee" || a.where === "mixed") r.push("Le sirve en cualquier sitio donde atienda, porque funciona encima de la historia clínica que haya.");
    }
    if (!r.length) r.push("Es la opción que mejor encaja con lo que nos contó.");
    return r.slice(0, 3);
  }

  function alsoText(best, a) {
    if (best === "pro") return "<b>¿Y si un día atiende en un hospital?</b> Con su mismo perfil puede usar Clinova Notes desde el celular.";
    if (best === "notes") {
      if (a.admin === "yes" && a.control === "no") return "<b>¿Quiere agenda y facturación?</b> Eso es de Clinova Pro, pero requiere que su institución cambie de sistema. Si abre consultorio propio, puede pasar a Pro con el mismo perfil.";
      return "<b>¿Trabaja en una historia clínica web?</b> Con la misma cuenta puede usar la extensión de Chrome para que los campos se llenen solos.";
    }
    return "<b>¿Atiende también desde el celular?</b> Con la misma cuenta use la app de Clinova Notes y la consulta le aparece en la extensión.";
  }

  var answers = {}, step = 0;
  var qbody = $("#qbody"), qcount = $("#qcount"), qbar = $("#qbar");

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderQ() {
    var Q = QUESTIONS[step];
    qcount.textContent = "Pregunta " + (step + 1) + " de " + QUESTIONS.length;
    qbar.style.width = (step / QUESTIONS.length * 100) + "%";
    var h = '<div class="q"><h3>' + esc(Q.q) + "</h3>" + (Q.help ? '<p class="help">' + esc(Q.help) + "</p>" : "") + '<div class="opts">';
    Q.opts.forEach(function (o) {
      h += '<button type="button" class="opt" data-v="' + o.v + '" aria-pressed="' + (answers[Q.id] === o.v) + '"><span class="em" aria-hidden="true">' + o.e + "</span><span>" + esc(o.t) + "<small>" + esc(o.s) + "</small></span></button>";
    });
    h += '</div><div class="quiz-nav"><button type="button" class="linkbtn" id="qback"' + (step === 0 ? " disabled" : "") + ">← Atrás</button></div></div>";
    qbody.innerHTML = h;
    $$(".opt", qbody).forEach(function (b) {
      b.addEventListener("click", function () {
        answers[Q.id] = b.getAttribute("data-v");
        $$(".opt", qbody).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        setTimeout(function () { step++; if (step < QUESTIONS.length) renderQ(); else renderResult(); }, 180);
      });
    });
    $("#qback").addEventListener("click", function () { if (step > 0) { step--; renderQ(); } });
  }

  function renderResult() {
    var best = recommend(answers), P = PRODUCTS[best];
    qcount.textContent = "Su recomendación";
    qbar.style.width = "100%";
    var rs = reasons(best, answers);
    var icon = { pro: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7 9h4M7 13h7"/>', notes: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 7v5M10 10a2 2 0 0 0 4 0"/>', ext: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5h8.5M9 13.8 4.8 6.6M15 13.8l-4.2 7.3"/>' }[P.icon];
    var ctas = "";
    if (best === "pro") ctas = '<a class="btn btn-primary" href="#demo" data-product="pro">Registrarme a la demo de Pro →</a><a class="btn btn-outline" href="#pro">Ver qué incluye</a>';
    if (best === "notes") ctas = '<a class="btn btn-accent" href="' + esc(CFG.NOTES_REGISTER_URL || "https://notes.clinova24.com/register") + '" target="_blank" rel="noopener">Crear cuenta en Notes →</a><a class="btn btn-outline" href="#demo" data-product="notes">Prefiero una demo</a>';
    if (best === "extension") ctas = '<a class="btn btn-primary" style="background:#008488" href="#demo" data-product="extension">Registrarme a la demo de la extensión →</a><a class="btn btn-outline" href="#extension">Ver cómo funciona</a>';
    qbody.innerHTML = '<div class="result" data-result="' + best + '"><div class="rhead"><span class="pico ' + P.icon + '" style="width:56px;height:56px;border-radius:14px;display:grid;place-items:center;color:#fff;flex:none"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></span><div><span class="eyebrow">Le recomendamos</span><h3>' + P.name + "</h3></div></div>" +
      '<p class="why"><b>¿Por qué?</b></p><ul>' + rs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      '<div class="also">' + alsoText(best, answers) + "</div>" +
      '<div class="ractions">' + ctas + '</div><div class="quiz-nav"><button type="button" class="linkbtn" id="qrestart">↺ Volver a empezar</button><a class="linkbtn" href="#demo" data-product="' + best + '" style="text-decoration:none">¿Tiene más tiempo? Regístrese a la demo</a></div></div>';
    $("#qrestart").addEventListener("click", function () { answers = {}; step = 0; renderQ(); });
    bindProductLinks(qbody);
    setProduct(best, false);
  }
  renderQ();

  /* ---------- Formulario de demo ---------- */
  var form = $("#demoForm"), prodSel = form.product, pill = $("#prodPill");
  function setProduct(v, scroll) {
    if (!PRODUCTS[v]) return;
    prodSel.value = v;
    updatePill();
    if (scroll) { var t = $("#demo"); if (t) t.scrollIntoView({ behavior: "smooth" }); }
  }
  function updatePill() {
    var v = prodSel.value;
    if (v && PRODUCTS[v] && v !== "no-se") { pill.hidden = false; pill.textContent = PRODUCTS[v].name; } else { pill.hidden = true; }
  }
  prodSel.addEventListener("change", updatePill);
  function bindProductLinks(root) {
    $$("[data-product]", root).forEach(function (a) { a.addEventListener("click", function () { setProduct(a.getAttribute("data-product"), false); }); });
  }
  bindProductLinks(document);

  var RULES = {
    name: function (f) { var v = f.name.value.trim(); return v.length >= 3 && /[a-záéíóúñü]/i.test(v); },
    email: function (f) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim()); },
    whatsapp: function (f) { var d = f.whatsapp.value.replace(/\D/g, ""); return d.length >= 7 && d.length <= 15; },
    profession: function (f) { return f.profession.value.trim().length >= 2; },
    country: function (f) { return !!f.country.value; },
    product: function (f) { return !!f.product.value; },
    consent: function (f) { return f.consent.checked; }
  };
  var tried = false;
  function validate() {
    var firstBad = null;
    Object.keys(RULES).forEach(function (k) {
      var ok = RULES[k](form), box = $('[data-f="' + k + '"]', form);
      box.classList.toggle("invalid", !ok);
      var inp = box.querySelector("input:not([type=hidden]),select");
      if (inp) inp.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !firstBad) firstBad = box;
    });
    return firstBad;
  }
  function revalidate() { if (tried && !validate()) $("#formMsg").textContent = ""; }
  form.addEventListener("input", revalidate);
  form.addEventListener("change", revalidate);

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    tried = true;
    var bad = validate();
    if (bad) {
      var i = bad.querySelector("input,select"); if (i) i.focus({ preventScroll: true });
      bad.scrollIntoView({ behavior: "smooth", block: "center" });
      $("#formMsg").textContent = "Revise los campos marcados en rojo.";
      return;
    }
    var data = {
      name: form.name.value.trim(), email: form.email.value.trim(),
      whatsapp: form.phone_country.value + " " + form.whatsapp.value.trim(),
      profession: form.profession.value.trim(), country: form.country.value,
      product: form.product.value, consent: true, consent_text_entity: CFG.LEGAL_ENTITY || "",
      consent_at: new Date().toISOString(), quiz: answers,
      source: "landing-clinova-productos", page: location.href
    };
    var done = function (preview) {
      form.style.display = "none";
      $("#okName").textContent = data.name.split(" ")[0] || "gracias";
      $("#okProd").textContent = (PRODUCTS[data.product] || PRODUCTS["no-se"]).name;
      $("#previewFlag").hidden = !preview;
      $("#success").classList.add("show");
    };
    if (form.company_website.value) { done(!CFG.DEMO_ENDPOINT); return; } // honeypot: bot
    if (!CFG.DEMO_ENDPOINT) { done(true); return; } // vista previa: no se envía nada
    var btn = $("#submitBtn"); btn.disabled = true; btn.firstChild.textContent = "Enviando… ";
    var opts = { method: "POST" };
    if (CFG.DEMO_ENDPOINT_FORMAT === "form") { var fd = new FormData(); Object.keys(data).forEach(function (k) { fd.append(k, typeof data[k] === "object" ? JSON.stringify(data[k]) : data[k]); }); opts.body = fd; }
    else { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(data); }
    fetch(CFG.DEMO_ENDPOINT, opts).then(function (r) { if (!r.ok) throw new Error(r.status); done(false); })
      .catch(function () { btn.disabled = false; btn.firstChild.textContent = "Agendar mi demo "; $("#formMsg").innerHTML = 'No pudimos enviar sus datos. Intente de nuevo o <a href="' + esc(CFG.WHATSAPP_URL || "#") + '" target="_blank" rel="noopener">escríbanos por WhatsApp</a>.'; });
  });
})();
