/*
 * Prototipo embudo capilar Rogans (estilo Choiz) — JS sin dependencias.
 * PROTOTIPO DE PRUEBA. Preguntas, criterios de "no apto" y lógica de recomendación:
 * PENDIENTE VALIDACIÓN DEL ÁREA MÉDICA. Garantía, consentimientos y promesas: PENDIENTE LEGAL.
 * Precios: tomados de rogansya.com (tienda / API pública de WooCommerce) el 17-nov-2026.
 * El checkout es simulado: no cobra, no guarda ni envía datos fuera del navegador.
 */
(function () {
  "use strict";

  // ---------- utilidades ----------
  var $app = document.getElementById("app");
  var fmt = function (n) { return "$" + Math.round(n).toLocaleString("es-CO").replace(/,/g, "."); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var PH = function (t) { return '<span class="ph">[' + t + "]</span>"; };
  var PRICE_TBD = '<span class="ph">Precio por confirmar</span>';
  var CHECK = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var KEY = "rogans-embudo-capilar-v1";
  var state = load() || { answers: {}, cart: null, order: null };
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function load() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } }

  // ---------- catálogo (precios reales de rogansya.com, 17-nov-2026) ----------
  var P = {
    r74: { name: "Rogans 74+ con Dutasteride y Minoxidil", short: "Cápsulas magistrales · dutasterida + minoxidil", img: "rogans-74", rx: true, caps: true, p90: 250000, p180: 340000 },
    r72: { name: "Rogans 72M con Minoxidil", short: "Cápsulas magistrales · minoxidil", img: "rogans-72m", rx: true, caps: true, p90: 250000, p180: 340000 },
    r71: { name: "Rogans 71+ con Dutasteride", short: "Cápsulas magistrales · dutasterida", img: "rogans-71", rx: true, caps: true, p90: 250000, p180: 340000 },
    t56: { name: "Tónico Capilar Rogans 56", short: "Tónico tópico 120 ml", img: "tonico-56", rx: true, price: 204000 },
    ton: { name: "Tónico Capilar Rogans", short: "Tónico diario con Kopyrrol y Kopexil", img: "tonico-rogans", rx: false, price: 98000 },
    vit: { name: "Vitapel Rogans", short: "Multivitamínico para cabello, piel y uñas", img: "vitapel", rx: false, price: 189900 },
    ren: { name: "Shampoo Anticaída Renew", short: "Shampoo para canas y anticaída", img: "shampoo-renew", rx: false, price: 98000 }
  };
  function unitPrice(id, months) { var p = P[id]; if (p.caps) return months === 6 ? p.p180 : p.p90; return p.price * (months === 6 ? 2 : 1); }
  function unitLabel(id, months) { var p = P[id]; if (p.caps) return (months === 6 ? "180" : "90") + " cápsulas"; return (months === 6 ? "2 unidades" : "1 unidad"); }

  var PLANS = {
    doble: { name: "Plan Doble Acción", tag: "Oral + tópico", items: ["r74", "t56"],
      why: ["Indicaste una caída marcada o de varios años, o que quieres recuperar densidad.", "Combina una cápsula magistral con un tónico tópico para actuar por dos vías.", "No reportaste contraindicaciones para dutasterida ni minoxidil."] },
    oral: { name: "Plan Esencial Oral", tag: "1 cápsula al día", items: ["r74"],
      why: ["Tu caída es leve o moderada y quieres frenarla.", "Una sola cápsula diaria facilita la constancia, que es lo que más pesa en el resultado.", "No reportaste contraindicaciones para dutasterida ni minoxidil."] },
    minox: { name: "Plan Minoxidil", tag: "Sin inhibidor de 5-alfa reductasa", items: ["r72"],
      why: ["Por tus respuestas, preferimos evitar la dutasterida de entrada.", "El minoxidil estimula la fase de crecimiento del cabello.", "El médico define la dosis al revisar tu caso."] },
    dut: { name: "Plan Dutasterida", tag: "Sin minoxidil", items: ["r71"],
      why: ["Reportaste alergia o mala tolerancia al minoxidil.", "La dutasterida actúa sobre el componente hormonal de la caída.", "El médico confirma si es adecuado para ti."] },
    mujer: { name: "Plan Mujer", tag: "Minoxidil + nutrición capilar", items: ["r72", "vit"],
      why: ["Es una opción frecuente para la caída difusa en mujeres.", "Suma un multivitamínico para cabello, piel y uñas.", "Si el médico lo considera, puede pedir exámenes (por ejemplo, hierro o tiroides) antes de formular."] },
    prev: { name: "Plan Prevención", tag: "Sin fórmula médica", items: ["ton", "vit"],
      why: ["No notas una caída importante y quieres cuidarte a tiempo.", "Tónico diario y multivitamínico, sin medicamentos de fórmula.", "Si con el tiempo notas más caída, puedes pasar a un plan con fórmula."] }
  };

  // ---------- ilustraciones ----------
  var NORWOOD = ["<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M30 20 Q45 16 60 20 Q52 18 45 18 Q38 18 30 20Z\" fill=\"#2c221d\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>", "<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M17 28 C22 22, 28 26, 29 36 C24 40, 16 40, 17 28Z\" fill=\"#e9c6ab\"/><path d=\"M73 28 C68 22, 62 26, 61 36 C66 40, 74 40, 73 28Z\" fill=\"#e9c6ab\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>", "<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M16 26 C24 18, 32 28, 32 44 C26 48, 15 46, 16 26Z\" fill=\"#e9c6ab\"/><path d=\"M74 26 C66 18, 58 28, 58 44 C64 48, 75 46, 74 26Z\" fill=\"#e9c6ab\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>", "<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M16 24 C25 16, 33 28, 33 46 C26 52, 14 48, 16 24Z\" fill=\"#e9c6ab\"/><path d=\"M74 24 C65 16, 57 28, 57 46 C64 52, 76 48, 74 24Z\" fill=\"#e9c6ab\"/><ellipse cx=\"45\" cy=\"50\" rx=\"9\" ry=\"9\" fill=\"#e9c6ab\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>", "<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M16 22 C28 14, 35 28, 35 48 C28 56, 14 50, 16 22Z\" fill=\"#e9c6ab\"/><path d=\"M74 22 C62 14, 55 28, 55 48 C62 56, 76 50, 74 22Z\" fill=\"#e9c6ab\"/><ellipse cx=\"45\" cy=\"50\" rx=\"13\" ry=\"12\" fill=\"#e9c6ab\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>", "<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M22 22 C36 10, 54 10, 68 22 C74 32, 70 58, 62 66 C54 70, 36 70, 28 66 C20 58, 16 32, 22 22Z\" fill=\"#e9c6ab\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>", "<svg viewBox=\"0 0 90 104\" width=\"92\" height=\"104\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><ellipse cx=\"14\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"76\" cy=\"56\" rx=\"5.5\" ry=\"8\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><rect x=\"36\" y=\"90\" width=\"18\" height=\"8\" rx=\"3\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1\"/><ellipse cx=\"45\" cy=\"52\" rx=\"29\" ry=\"36\" fill=\"#e9c6ab\" stroke=\"#6a4e3c\" stroke-width=\"1.25\"/><ellipse cx=\"45\" cy=\"52\" rx=\"28\" ry=\"35\" fill=\"#2c221d\"/><path d=\"M20 20 C36 8, 54 8, 70 20 C78 32, 74 70, 58 80 C50 84, 40 84, 32 80 C16 70, 12 32, 20 20Z\" fill=\"#e9c6ab\"/><path d=\"M42 8 L45 5 L48 8\" fill=\"none\" stroke=\"#9a7b68\" stroke-width=\"1\" stroke-linecap=\"round\"/></svg>"];
  function ludwig(n) {
    var r = [0, 6, 11, 16][n];
    return '<svg viewBox="0 0 90 104" width="92" height="104" aria-hidden="true"><ellipse cx="14" cy="56" rx="5.5" ry="8" fill="#e9c6ab" stroke="#6a4e3c"/><ellipse cx="76" cy="56" rx="5.5" ry="8" fill="#e9c6ab" stroke="#6a4e3c"/><rect x="36" y="90" width="18" height="8" rx="3" fill="#e9c6ab" stroke="#6a4e3c"/><ellipse cx="45" cy="52" rx="29" ry="36" fill="#e9c6ab" stroke="#6a4e3c" stroke-width="1.25"/><ellipse cx="45" cy="52" rx="28" ry="35" fill="#2c221d"/><path d="M45 18 L45 ' + (46 + r) + '" stroke="#e9c6ab" stroke-width="' + (2 + r * 0.6) + '" stroke-linecap="round"/>' + (r ? '<ellipse cx="45" cy="44" rx="' + r + '" ry="' + (r * 1.5) + '" fill="#e9c6ab" opacity=".85"/>' : "") + '<path d="M42 8 L45 5 L48 8" fill="none" stroke="#9a7b68" stroke-linecap="round"/></svg>';
  }

  // ---------- cuestionario ----------
  // PENDIENTE VALIDACIÓN DEL ÁREA MÉDICA: textos, opciones, "stop" (no apto) y condiciones.
  var STOP = {
    menor: { t: "Por ahora este tratamiento en línea es solo para mayores de 18 años", d: "La caída de cabello en menores de edad necesita una valoración médica con un acudiente." },
    mayor: { t: "En tu caso es mejor una valoración médica directa", d: "Después de los 65 años preferimos que un médico revise tu historia completa antes de proponer un tratamiento." },
    embarazo: { t: "Durante el embarazo o la lactancia no ofrecemos este tratamiento en línea", d: "Varios activos para la caída del cabello no se recomiendan en esta etapa. Un médico puede orientarte con opciones seguras." },
    parches: { t: "Tu tipo de caída necesita que un médico te vea", d: "La caída en parches, repentina o de todo el cuerpo puede tener otras causas que se revisan en consulta." },
    cuero: { t: "Primero hay que revisar tu cuero cabelludo", d: "Dolor, heridas, placas o enrojecimiento intenso se valoran en consulta antes de iniciar un tratamiento para la caída." },
    condicion: { t: "Por tu historia médica, un médico debe revisar tu caso en consulta", d: "Algunas condiciones o tratamientos requieren una valoración más completa antes de formular." },
    alergia: { t: "Necesitamos revisar tus alergias con un médico", d: "Reportaste alergia a los dos activos principales de nuestros planes. En consulta buscamos alternativas." }
  };

  var Q = [
    { id: "sexo", title: "¿Cuál es tu sexo biológico?", why: "Los patrones de caída y las opciones de tratamiento cambian entre hombres y mujeres.", type: "single",
      options: [{ v: "hombre", l: "Hombre" }, { v: "mujer", l: "Mujer" }] },
    { id: "edad", title: "¿Qué edad tienes?", why: "La edad influye en qué activos son seguros y en la vía (oral o tópica).", type: "single",
      options: [{ v: "<18", l: "Menos de 18 años", stop: "menor" }, { v: "18-25", l: "18 a 25 años" }, { v: "26-40", l: "26 a 40 años" }, { v: "41-55", l: "41 a 55 años" }, { v: "56-65", l: "56 a 65 años" }, { v: ">65", l: "Más de 65 años", stop: "mayor" }] },
    { id: "embarazo", title: "¿Estás embarazada, en lactancia o planeas un embarazo en los próximos meses?", why: "Algunos activos no se recomiendan en estas etapas.", type: "single", cond: function (a) { return a.sexo === "mujer"; },
      options: [{ v: "no", l: "No" }, { v: "embarazo", l: "Sí, estoy embarazada", stop: "embarazo" }, { v: "lactancia", l: "Sí, estoy en lactancia", stop: "embarazo" }, { v: "planeo", l: "Planeo un embarazo pronto", stop: "embarazo" }] },
    { id: "patron", title: "¿Cuál imagen se parece más a tu cabello hoy?", why: "Vista desde arriba: la parte superior del dibujo es la frente. Son esquemas de referencia, no un diagnóstico.", type: "pattern" },
    { id: "tiempo", title: "¿Hace cuánto notas la caída?", type: "single",
      options: [{ v: "<6m", l: "Menos de 6 meses" }, { v: "6-12m", l: "Entre 6 meses y 1 año" }, { v: "1-3a", l: "Entre 1 y 3 años" }, { v: ">3a", l: "Más de 3 años" }, { v: "no", l: "No noto caída, quiero prevenir" }] },
    { id: "cantidad", title: "¿Cuánto cabello sientes que has perdido?", why: "Nos ayuda a definir la intensidad del plan.", type: "single",
      options: [{ v: "poco", l: "Muy poco" }, { v: "algo", l: "Algo, se nota de cerca" }, { v: "mucho", l: "Bastante, se nota a simple vista" }] },
    { id: "cuero", title: "¿Tienes alguno de estos síntomas en el cuero cabelludo?", sub: "Puedes elegir varios.", type: "multi",
      options: [{ v: "caspa", l: "Caspa o descamación leve" }, { v: "picazon", l: "Picazón" }, { v: "dolor", l: "Dolor, ardor o enrojecimiento intenso", stop: "cuero" }, { v: "placas", l: "Placas, heridas o costras (por ejemplo, psoriasis)", stop: "cuero" }, { v: "ninguno", l: "Ninguno", none: true }] },
    { id: "desencadenantes", title: "En los últimos 6 meses, ¿has vivido algo de esto?", why: "El estrés, un parto o una dieta fuerte pueden causar caída temporal, que se maneja distinto.", sub: "Puedes elegir varios.", type: "multi",
      options: [{ v: "estres", l: "Estrés alto" }, { v: "parto", l: "Un parto" }, { v: "dieta", l: "Dieta fuerte o pérdida de peso rápida" }, { v: "enfermedad", l: "Una enfermedad o fiebre alta" }, { v: "ninguno", l: "Nada de esto", none: true }] },
    { id: "familia", title: "¿Hay antecedentes de caída del cabello en tu familia?", why: "La caída hereditaria es la causa más frecuente.", type: "single",
      options: [{ v: "si", l: "Sí" }, { v: "no", l: "No" }, { v: "nose", l: "No lo sé" }] },
    { id: "objetivo", title: "¿Qué quieres lograr?", type: "single",
      options: [{ v: "detener", l: "Detener la caída" }, { v: "repoblar", l: "Recuperar densidad" }, { v: "prevenir", l: "Prevenir, todavía no se me cae" }] },
    { id: "previos", title: "¿Has usado alguno de estos tratamientos?", sub: "Puedes elegir varios.", type: "multi",
      options: [{ v: "minoxidil", l: "Minoxidil" }, { v: "finasterida", l: "Finasterida" }, { v: "dutasterida", l: "Dutasterida" }, { v: "meso", l: "Mesoterapia o PRP" }, { v: "implante", l: "Implante capilar" }, { v: "ninguno", l: "Ninguno", none: true }] },
    { id: "alergias", title: "¿Eres alérgico o tuviste mala reacción a alguno de estos activos?", type: "multi",
      options: [{ v: "minoxidil", l: "Minoxidil" }, { v: "dutfin", l: "Dutasterida o finasterida" }, { v: "otra", l: "Otra alergia a medicamentos" }, { v: "ninguna", l: "Ninguna", none: true }] },
    { id: "condiciones", title: "¿Tienes o has tenido alguna de estas condiciones?", sub: "Puedes elegir varias.", type: "multi",
      options: [{ v: "cancer", l: "Cáncer de mama o de próstata", stop: "condicion" }, { v: "corazon", l: "Enfermedad del corazón o presión alta no controlada", stop: "condicion" }, { v: "higado", l: "Enfermedad del hígado o del riñón", stop: "condicion" }, { v: "autoinmune", l: "Lupus u otra enfermedad autoinmune", stop: "condicion" }, { v: "tiroides", l: "Problemas de tiroides" }, { v: "ninguna", l: "Ninguna", none: true }] },
    { id: "medicamentos", title: "¿Tomas alguno de estos medicamentos?", sub: "Puedes elegir varios.", type: "multi", text: "¿Algo más que el médico deba saber? (medicamentos, cirugías, hospitalizaciones) — opcional",
      options: [{ v: "quimio", l: "Quimioterapia o inmunosupresores", stop: "condicion" }, { v: "anticoagulantes", l: "Anticoagulantes" }, { v: "presion", l: "Medicamentos para la presión" }, { v: "hormonas", l: "Hormonas o anabólicos" }, { v: "ninguno", l: "Ninguno", none: true }] },
    { id: "sexual", title: "¿Has tenido alguno de estos síntomas?", why: "Algunos activos pueden influir en la libido o el ánimo. Preguntamos para elegir la opción más segura para ti.", type: "multi", cond: function (a) { return a.sexo === "hombre"; },
      options: [{ v: "libido", l: "Baja libido o problemas de erección" }, { v: "animo", l: "Depresión o ansiedad diagnosticadas" }, { v: "ninguno", l: "Ninguno", none: true }] }
  ];

  var PATTERN_M = [
    { v: "n1", l: "I", d: "Sin caída notable" }, { v: "n2", l: "II", d: "Entradas leves" }, { v: "n3", l: "III", d: "Entradas marcadas" },
    { v: "n4", l: "IV", d: "Entradas y coronilla" }, { v: "n5", l: "V", d: "Zonas que se unen" }, { v: "n6", l: "VI", d: "Área superior amplia" }, { v: "n7", l: "VII", d: "Herradura" }
  ];
  var PATTERN_F = [{ v: "l0", l: "0", d: "Sin caída notable" }, { v: "l1", l: "I", d: "Raya más ancha" }, { v: "l2", l: "II", d: "Menos densidad arriba" }, { v: "l3", l: "III", d: "Caída difusa marcada" }];
  var PATTERN_STOP = [{ v: "parches", l: "Caída en parches o zonas redondas", stop: "parches" }, { v: "total", l: "Caída repentina de casi todo el cabello o del vello del cuerpo", stop: "parches" }];

  function visibleQ() { return Q.filter(function (q) { return !q.cond || q.cond(state.answers); }); }

  // ---------- recomendación (PENDIENTE VALIDACIÓN MÉDICA) ----------
  function has(id, v) { var a = state.answers[id]; return Array.isArray(a) ? a.indexOf(v) >= 0 : a === v; }
  function recommend() {
    var a = state.answers;
    if (a.objetivo === "prevenir" || a.patron === "n1" || a.patron === "l0" || a.tiempo === "no") return { main: "prev", alts: a.sexo === "mujer" ? ["mujer"] : ["oral", "minox"] };
    if (a.sexo === "mujer") return { main: "mujer", alts: ["prev"] };
    var noMinox = has("alergias", "minoxidil");
    var no5ari = has("alergias", "dutfin") || has("sexual", "libido") || has("sexual", "animo");
    if (noMinox && no5ari) return { stop: "alergia" };
    if (noMinox) return { main: "dut", alts: ["prev"] };
    if (no5ari) return { main: "minox", alts: ["prev"] };
    var adv = ["n4", "n5", "n6", "n7"].indexOf(a.patron) >= 0 || a.cantidad === "mucho" || a.objetivo === "repoblar" || a.tiempo === ">3a";
    return adv ? { main: "doble", alts: ["oral", "minox"] } : { main: "oral", alts: ["doble", "minox"] };
  }
  function planTotal(id, months) { return PLANS[id].items.reduce(function (s, i) { return s + unitPrice(i, months); }, 0); }
  function planRx(id) { return PLANS[id].items.some(function (i) { return P[i].rx; }); }

  // ---------- piezas comunes ----------
  function trust(compact) {
    var items = [
      ["🏥", "IPS habilitada en Bogotá", "Sede física: Autopista Norte #106-71, Of. 401"],
      ["👩‍⚕️", "Equipo médico de Rogans", "Un médico revisa cada caso " + PH("nombres y registro por validar")],
      ["⚗️", "Medicamentos magistrales", "Fórmulas preparadas para ti, no genéricas"],
      ["🛡️", "Garantía de devolución", PH("Condiciones de garantía por definir con Legal")],
      ["⭐", PH("X") + " pacientes atendidos", PH("Cifra por validar")]
    ];
    if (compact) items = items.slice(0, 4);
    return '<section aria-label="Por qué confiar en Rogans" class="mt-8 rounded-3xl bg-primary-50 p-5"><ul class="grid gap-4 ' + (compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-5") + '">' +
      items.map(function (i) { return '<li class="flex gap-3"><span class="text-xl" aria-hidden="true">' + i[0] + '</span><div><p class="text-sm font-semibold text-primary-950">' + i[1] + '</p><p class="text-xs text-slate-600">' + i[2] + "</p></div></li>"; }).join("") +
      "</ul></section>";
  }
  function testimonials(n) {
    var t = [
      ["Después de 4 meses noto menos caída al bañarme y el pelo más grueso en las entradas.", "Paciente, 34 años, Bogotá"],
      ["Me gustó ver el plan y el precio desde el principio, y que el médico me escribiera al día siguiente.", "Paciente, 41 años, Medellín"],
      ["Llevaba años probando cosas. Con la fórmula magistral por fin tengo constancia.", "Paciente, 29 años, Cali"]
    ].slice(0, n || 3);
    return '<section class="mt-8"><h2 class="text-lg font-semibold">Lo que dicen nuestros pacientes</h2><p class="text-xs text-slate-500">' + PH("Testimonios de ejemplo — reemplazar por testimonios reales con autorización") + '</p><div class="mt-3 grid gap-3 sm:grid-cols-3">' +
      t.map(function (x) { return '<figure class="card"><p class="text-amber-500" aria-label="5 de 5">★★★★★</p><blockquote class="mt-2 text-sm text-slate-700">“' + x[0] + '” <span class="ph">[Testimonio de ejemplo]</span></blockquote><figcaption class="mt-3 text-xs text-slate-500">' + x[1] + "</figcaption></figure>"; }).join("") + "</div></section>";
  }
  function timeline(active) {
    var s = [
      ["Pago", "Pagas tu plan. El pago queda como reserva hasta que el médico apruebe " + PH("mecanismo de reserva por confirmar con Bold/Addi") + "."],
      ["Revisión médica", "Un médico revisa tu caso en 24 h " + PH("plazo por validar: ¿horas hábiles?") + ". Teleconsulta asíncrona; puede pedirte fotos o una videollamada."],
      ["Fórmula médica", "Si el tratamiento es adecuado para ti, el médico emite tu fórmula magistral. Si no, te devolvemos el 100 % " + PH("condiciones por definir con Legal") + "."],
      ["Envío", "Preparamos tu fórmula y la enviamos a tu casa " + PH("tiempos de entrega por confirmar") + "."]
    ];
    return '<ol class="relative mt-4 space-y-5 border-l-2 border-primary-200 pl-6">' + s.map(function (x, i) {
      var done = active != null && i < active, cur = active != null && i === active;
      return '<li class="relative"><span class="absolute -left-[35px] flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ' + (done ? "bg-primary-500 text-primary-950" : cur ? "bg-primary-950 text-white ring-4 ring-primary-100" : "bg-white text-slate-500 border-2 border-primary-200") + '">' + (done ? CHECK : i + 1) + '</span><p class="font-semibold">' + x[0] + (cur ? ' <span class="ml-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-800">En curso</span>' : "") + '</p><p class="text-sm text-slate-600">' + x[1] + "</p></li>";
    }).join("") + "</ol>";
  }
  function productThumb(id) { return '<img src="./assets/img/' + P[id].img + '.webp" alt="' + esc(P[id].name) + '" width="96" height="64" loading="lazy" class="h-16 w-24 shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-100">'; }

  function setProgress(pct) {
    var w = document.getElementById("progress-wrap"), b = document.getElementById("progress");
    if (pct == null) { w.classList.add("hidden"); return; }
    w.classList.remove("hidden"); b.style.width = pct + "%";
  }
  function updateCartCount() { document.getElementById("cart-count").textContent = state.cart ? "1" : "0"; }
  function go(h) { if (location.hash === "#" + h) render(); else location.hash = h; }

  // ---------- vistas ----------
  function viewInicio() {
    setProgress(null);
    return '<section class="grid items-center gap-8 pt-8 lg:grid-cols-2 lg:pt-14">' +
      '<div><p class="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">Tratamiento capilar en línea · Colombia</p>' +
      '<h1 class="mt-4 text-3xl font-bold leading-tight text-primary-950 sm:text-5xl">Frena la caída del cabello con un plan médico, desde tu casa</h1>' +
      '<p class="mt-4 text-base text-slate-600 sm:text-lg">Responde 14 preguntas en unos 5 minutos, mira tu plan recomendado con precio y empieza hoy. Un médico de Rogans revisa tu caso en 24 h antes de enviarte tu fórmula magistral.</p>' +
      '<div class="mt-6 flex flex-col gap-3 sm:flex-row"><button class="btn-accent" data-go="q/sexo">Ver si soy apto</button><a class="btn-ghost" href="#como-funciona">Cómo funciona</a></div>' +
      '<p class="mt-3 text-xs text-slate-500">Gratis y sin registrarte. No te pedimos nombre ni teléfono para ver tu resultado.</p></div>' +
      '<div class="card bg-linear-to-br from-primary-50 to-white"><p class="text-sm font-semibold text-primary-800">Así se ve tu plan</p><div class="mt-3 flex items-center gap-4">' + productThumb("r74") + '<div><p class="font-semibold">Plan Esencial Oral</p><p class="text-sm text-slate-600">Rogans 74+ · 90 cápsulas</p><p class="mt-1 text-lg font-bold text-primary-950">' + fmt(250000) + ' <span class="text-xs font-normal text-slate-500">3 meses</span></p></div></div><p class="mt-3 text-xs text-slate-500">Ejemplo. Tu plan depende de tus respuestas y de la revisión médica.</p></div>' +
      "</section>" +
      '<section id="como-funciona" class="mt-12"><h2 class="text-2xl font-bold text-primary-950">Cómo funciona</h2><ol class="mt-4 grid gap-3 sm:grid-cols-4">' +
      [["Responde", "Cuestionario de 14 preguntas, una por pantalla."], ["Elige tu plan", "Ves el tratamiento recomendado y su precio, sin esperas."], ["Médico en 24 h", "Un médico revisa tu caso y emite tu fórmula si es adecuada."], ["Recíbelo en casa", "Fórmula magistral y seguimiento por WhatsApp."]].map(function (x, i) {
        return '<li class="card"><span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 font-bold text-primary-950">' + (i + 1) + '</span><p class="mt-3 font-semibold">' + x[0] + '</p><p class="text-sm text-slate-600">' + x[1] + "</p></li>";
      }).join("") + "</ol></section>" +
      trust() + testimonials(3) +
      '<section class="mt-10 card"><h2 class="text-lg font-semibold">¿Buscas un procedimiento?</h2><p class="mt-1 text-sm text-slate-600">También tenemos el Kit Tratamiento Capilar Advanced de 6 meses (' + fmt(2800000) + ', con mesoterapia, PRP y LED en la sede) y el implante capilar ($9 a $13 millones). Rogans financia todos sus tratamientos ' + PH("condiciones de financiación por confirmar") + '.</p></section>' +
      faq();
  }
  function faq() {
    var f = [
      ["¿Necesito fórmula médica?", "Sí, para los planes con medicamentos. En Colombia un médico debe valorarte antes de formular: por eso, después del pago, un médico de Rogans revisa tu caso por teleconsulta."],
      ["¿Y si el médico dice que no es para mí?", "Te devolvemos el 100 % del pago " + PH("condiciones por definir con Legal") + " y te orientamos sobre otras opciones."],
      ["¿Puedo hablar con un médico antes de pagar?", "Sí. Puedes agendar una teleconsulta en vivo " + PRICE_TBD + "."],
      ["¿Cuánto cuesta el envío?", PRICE_TBD + ". Lo ves en el resumen antes de pagar."]
    ];
    return '<section class="mt-10"><h2 class="text-lg font-semibold">Preguntas frecuentes</h2><div class="mt-3 divide-y divide-slate-100 rounded-3xl border border-slate-200">' + f.map(function (x) {
      return '<details class="group p-4"><summary class="cursor-pointer list-none font-medium flex justify-between">' + x[0] + '<span class="text-primary-700 group-open:rotate-45 transition">+</span></summary><p class="mt-2 text-sm text-slate-600">' + x[1] + "</p></details>";
    }).join("") + "</div></section>";
  }

  function viewQuestion(id) {
    var qs = visibleQ(), idx = qs.findIndex(function (q) { return q.id === id; });
    if (idx < 0) { go("q/" + qs[0].id); return ""; }
    var q = qs[idx], val = state.answers[q.id];
    setProgress(Math.round((idx / qs.length) * 100));
    var body = "";
    if (q.type === "single") {
      body = '<div class="mt-6 grid gap-3" role="radiogroup" aria-label="' + esc(q.title) + '">' + q.options.map(function (o) {
        return '<button type="button" role="radio" class="opt" data-single="' + esc(o.v) + '" aria-checked="' + (val === o.v) + '"><span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-white ' + (val === o.v ? "bg-primary-600 border-primary-600" : "") + '">' + (val === o.v ? CHECK : "") + "</span>" + esc(o.l) + "</button>";
      }).join("") + "</div>";
    } else if (q.type === "multi") {
      var arr = Array.isArray(val) ? val : [];
      body = '<div class="mt-6 grid gap-3">' + q.options.map(function (o) {
        var on = arr.indexOf(o.v) >= 0;
        return '<button type="button" role="checkbox" class="opt" data-multi="' + esc(o.v) + '" aria-checked="' + on + '"><span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 text-white ' + (on ? "bg-primary-600 border-primary-600" : "") + '">' + (on ? CHECK : "") + "</span>" + esc(o.l) + "</button>";
      }).join("") + "</div>" +
        (q.text ? '<label class="mt-5 block"><span class="label">' + esc(q.text) + '</span><textarea id="qtext" rows="3" class="field" placeholder="Escribe aquí (opcional)">' + esc(state.answers[q.id + "_texto"] || "") + "</textarea></label>" : "") +
        '<button type="button" class="btn-primary mt-6 w-full sm:w-auto" data-next ' + (arr.length ? "" : "disabled") + ">Continuar</button>";
    } else if (q.type === "pattern") {
      var fem = state.answers.sexo === "mujer", list = fem ? PATTERN_F : PATTERN_M;
      body = '<p class="mt-2 text-xs text-slate-500">Escala de referencia tipo ' + (fem ? "Ludwig (mujeres)" : "Norwood (hombres)") + ". " + PH("Ilustraciones esquemáticas — validar área médica") + '</p><div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Patrón de caída">' + list.map(function (o, i) {
        var on = val === o.v;
        return '<button type="button" role="radio" data-single="' + o.v + '" aria-checked="' + on + '" class="opt flex-col !items-center !gap-1 text-center">' + (fem ? ludwig(i) : NORWOOD[i]) + '<span class="font-semibold">' + o.l + '</span><span class="text-xs text-slate-500">' + o.d + "</span></button>";
      }).join("") + '</div><p class="mt-5 text-sm font-medium">¿Ninguna se parece?</p><div class="mt-2 grid gap-3">' + PATTERN_STOP.map(function (o) {
        return '<button type="button" role="radio" class="opt" data-single="' + o.v + '" aria-checked="' + (val === o.v) + '">' + esc(o.l) + "</button>";
      }).join("") + "</div>";
    }
    return '<section class="mx-auto max-w-xl pt-6">' +
      '<div class="flex items-center justify-between text-sm text-slate-500"><button type="button" class="font-medium text-primary-800 hover:underline" data-back>← Atrás</button><span>Pregunta ' + (idx + 1) + " de " + qs.length + "</span></div>" +
      '<h1 class="mt-5 text-2xl font-bold leading-snug text-primary-950">' + esc(q.title) + "</h1>" +
      (q.sub ? '<p class="mt-1 text-sm text-slate-500">' + esc(q.sub) + "</p>" : "") +
      (q.why ? '<details class="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm"><summary class="cursor-pointer font-medium text-primary-800">¿Por qué lo preguntamos?</summary><p class="mt-1 text-slate-600">' + esc(q.why) + "</p></details>" : "") +
      body +
      '<p class="mt-8 flex items-center gap-2 text-xs text-slate-500"><span aria-hidden="true">🔒</span> Tus respuestas se usan solo para orientarte. Evaluación orientativa: no es un diagnóstico; el médico confirma.</p>' +
      "</section>" + '<div class="mx-auto max-w-xl">' + trust(true) + "</div>";
  }

  function findStop(q, v) {
    var opts = q.type === "pattern" ? PATTERN_STOP : q.options || [];
    var o = opts.find(function (x) { return x.v === v; });
    return o && o.stop;
  }
  function nextFrom(id) {
    var qs = visibleQ(), idx = qs.findIndex(function (q) { return q.id === id; });
    if (idx < qs.length - 1) go("q/" + qs[idx + 1].id);
    else {
      var r = recommend();
      if (r.stop) { state.stopFrom = id; save(); go("no-apto/" + r.stop); } else go("resultado");
    }
  }

  function viewNoApto(reason) {
    setProgress(null);
    var s = STOP[reason] || STOP.condicion;
    return '<section class="mx-auto max-w-xl pt-10 text-center">' +
      '<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl" aria-hidden="true">🩺</div>' +
      '<h1 class="mt-5 text-2xl font-bold text-primary-950">' + esc(s.t) + "</h1>" +
      '<p class="mt-3 text-slate-600">' + esc(s.d) + " Lo mejor es que hables con uno de nuestros médicos: te escucha, revisa tu caso y te dice qué opciones tienes.</p>" +
      '<div class="card mt-6 text-left"><p class="font-semibold">Consulta médica capilar</p><p class="text-sm text-slate-600">Teleconsulta o presencial en Autopista Norte #106-71, Bogotá.</p><p class="mt-2 text-sm">Valor: ' + PRICE_TBD + ' <span class="text-xs text-slate-500">(hoy el sitio muestra $50.000 redimibles en algunas páginas y gratis en otras)</span></p>' +
      '<button class="btn-accent mt-4 w-full" data-go="consulta">Agendar consulta médica</button></div>' +
      '<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center"><button class="btn-ghost" data-back-stop>Cometí un error en mis respuestas</button><button class="btn-ghost" data-go="inicio">Salir</button></div>' +
      '<p class="mt-6 text-xs text-slate-500">' + PH("Criterios de no apto pendientes de validación del área médica") + "</p></section>";
  }

  function viewConsulta() {
    setProgress(null);
    return '<section class="mx-auto max-w-xl pt-10"><h1 class="text-2xl font-bold text-primary-950">Agenda tu consulta médica</h1><p class="mt-2 text-slate-600">En la versión final, aquí se conecta la agenda actual de Rogans (presencial o teleconsulta en vivo).</p>' +
      '<div class="card mt-5"><p class="text-sm">Valor de la consulta: ' + PRICE_TBD + '</p><p class="mt-2 text-xs text-slate-500">' + PH("Comercial debe unificar el precio: $50.000 redimibles o gratis") + '</p></div>' +
      '<div class="mt-5 flex gap-3"><button class="btn-ghost" data-back>← Volver</button><button class="btn-primary" data-go="inicio">Ir al inicio</button></div></section>';
  }

  function planCard(id, main) {
    var pl = PLANS[id], total = planTotal(id, 3);
    return '<article class="' + (main ? "card ring-2 ring-primary-500" : "card") + '">' +
      (main ? '<p class="inline-flex rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-primary-950">Recomendado para ti</p>' : "") +
      '<div class="mt-3 flex items-start justify-between gap-4"><div><h2 class="text-xl font-bold text-primary-950">' + pl.name + '</h2><p class="text-sm text-slate-500">' + pl.tag + '</p></div><div class="text-right"><p class="text-2xl font-bold text-primary-950">' + fmt(total) + '</p><p class="text-xs text-slate-500">3 meses · ' + fmt(total / 3) + "/mes</p></div></div>" +
      '<ul class="mt-4 space-y-3">' + pl.items.map(function (i) { return '<li class="flex items-center gap-3">' + productThumb(i) + '<div><p class="text-sm font-semibold">' + P[i].name + '</p><p class="text-xs text-slate-500">' + P[i].short + " · " + unitLabel(i, 3) + " · " + fmt(unitPrice(i, 3)) + (P[i].rx ? ' · <span class="text-primary-800">requiere fórmula médica</span>' : "") + "</p></div></li>"; }).join("") + "</ul>" +
      (main ? '<div class="mt-5 rounded-2xl bg-slate-50 p-4"><p class="text-sm font-semibold">¿Por qué este plan?</p><ul class="mt-2 space-y-1 text-sm text-slate-600">' + pl.why.map(function (w) { return '<li class="flex gap-2"><span class="text-primary-600">' + CHECK + "</span>" + esc(w) + "</li>"; }).join("") + '</ul><p class="mt-2 text-xs text-slate-500">Recomendación basada en tus respuestas y en criterios del equipo médico ' + PH("pendiente validación del área médica") + ".</p></div>" +
        '<ul class="mt-4 grid gap-2 text-sm sm:grid-cols-2"><li>✓ Revisión médica en 24 h incluida</li><li>✓ Fórmula magistral preparada para ti</li><li>✓ Seguimiento por WhatsApp</li><li>✓ Garantía ' + PH("condiciones por definir") + "</li></ul>" : "") +
      '<button class="' + (main ? "btn-primary" : "btn-ghost") + ' mt-5 w-full" data-plan="' + id + '">' + (main ? "Empezar mi plan" : "Elegir este plan") + "</button></article>";
  }

  function viewResultado() {
    var r = recommend();
    if (r.stop) { go("no-apto/" + r.stop); return ""; }
    if (!state.answers.sexo) { go("inicio"); return ""; }
    setProgress(100);
    var a = state.answers, temporal = Array.isArray(a.desencadenantes) && a.desencadenantes.some(function (x) { return x !== "ninguno"; });
    var perfil = r.main === "prev" ? "Por ahora no describes una caída importante. Un plan de prevención te ayuda a cuidar tu cabello." :
      (a.sexo === "mujer" ? "Tu perfil sugiere una caída difusa, frecuente en mujeres." : "Tu perfil sugiere una caída con patrón hereditario u hormonal, la más frecuente en hombres.");
    return '<section class="mx-auto max-w-3xl pt-6">' +
      '<button type="button" class="text-sm font-medium text-primary-800 hover:underline" data-back>← Revisar respuestas</button>' +
      '<p class="mt-4 text-sm font-semibold text-primary-700">Tu resultado</p><h1 class="mt-1 text-3xl font-bold text-primary-950">Este es tu plan recomendado</h1>' +
      '<p class="mt-2 text-slate-600">' + perfil + " Es una orientación, no un diagnóstico: un médico de Rogans confirma tu caso en 24 h después del pago.</p>" +
      (temporal ? '<p class="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Mencionaste un evento reciente (estrés, parto, dieta o enfermedad). El médico lo tendrá en cuenta, porque a veces la caída es temporal.</p>' : "") +
      '<div class="mt-6">' + planCard(r.main, true) + "</div>" +
      '<div class="mt-4 flex flex-col items-center gap-1 text-center"><button class="text-sm font-semibold text-primary-800 underline" data-go="consulta">Prefiero una consulta médica en vivo</button><span class="text-xs text-slate-500">Teleconsulta o presencial · ' + PRICE_TBD + "</span></div>" +
      '<section class="mt-8"><h2 class="text-lg font-semibold">Qué pasa después de pagar</h2>' + timeline(null) + "</section>" +
      '<section class="mt-8"><h2 class="text-lg font-semibold">Otras opciones</h2><div class="mt-3 grid gap-4 sm:grid-cols-2">' + r.alts.map(function (id) { return planCard(id, false); }).join("") + "</div>" +
      '<div class="card mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex items-center gap-3"><img src="./assets/img/kit-advanced.webp" alt="Kit Tratamiento Capilar Advanced" width="64" height="64" class="h-16 w-16 rounded-xl object-cover" loading="lazy"><div><p class="font-semibold">Tratamiento en sede o implante capilar</p><p class="text-xs text-slate-500">Kit Advanced 6 meses ' + fmt(2800000) + " · Implante $9–13 millones · Financiación disponible " + PH("condiciones por confirmar") + '</p></div></div><button class="btn-ghost" data-go="consulta">Agendar valoración</button></div></section>' +
      trust() + testimonials(2) + "</section>";
  }

  function viewPlan() {
    if (!state.cart) { go(state.answers.sexo ? "resultado" : "inicio"); return ""; }
    setProgress(null);
    var c = state.cart, pl = PLANS[c.plan];
    var addons = ["ren", "vit", "ton"].filter(function (i) { return pl.items.indexOf(i) < 0; });
    var t = totals();
    return '<section class="pt-6"><button type="button" class="text-sm font-medium text-primary-800 hover:underline" data-go="resultado">← Volver al resultado</button>' +
      '<h1 class="mt-4 text-2xl font-bold text-primary-950">Configura tu ' + pl.name + "</h1>" +
      '<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><div class="space-y-6">' +
      '<fieldset class="card"><legend class="px-1 text-sm font-semibold">1. ¿Cómo quieres recibirlo?</legend><div class="mt-3 grid gap-3">' +
      '<button type="button" class="opt !items-start" data-mode="unica" aria-pressed="' + (c.mode === "unica") + '"><span class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ' + (c.mode === "unica" ? "border-primary-600 bg-primary-600" : "border-slate-300") + '"></span><span><span class="block font-semibold">Compra única</span><span class="block text-sm text-slate-600">Pagas una vez el tratamiento completo del periodo que elijas. Te avisamos antes de que se acabe para que lo renueves.</span></span></button>' +
      '<button type="button" class="opt !items-start" data-mode="suscripcion" aria-pressed="' + (c.mode === "suscripcion") + '"><span class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ' + (c.mode === "suscripcion" ? "border-primary-600 bg-primary-600" : "border-slate-300") + '"></span><span><span class="block font-semibold">Suscripción mensual <span class="ml-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-800">Recomendado para no interrumpir</span></span><span class="block text-sm text-slate-600">Pagas mes a mes y recibes tu reabasto antes de que se acabe. Cancelas cuando quieras ' + PH("condiciones de suscripción por definir") + '.</span><span class="mt-1 block text-sm">Valor mensual: ' + PRICE_TBD + ' <span class="text-xs text-slate-500">(referencia con compra única: ' + fmt(planTotal(c.plan, 3) / 3) + "/mes)</span></span></span></button>" +
      "</div></fieldset>" +
      (c.mode === "unica" ? '<fieldset class="card"><legend class="px-1 text-sm font-semibold">2. Duración</legend><div class="mt-3 grid gap-3 sm:grid-cols-2">' + [3, 6].map(function (m) {
        var tot = planTotal(c.plan, m);
        return '<button type="button" class="opt flex-col !items-start" data-months="' + m + '" aria-pressed="' + (c.months === m) + '"><span class="font-semibold">' + m + ' meses</span><span class="text-lg font-bold text-primary-950">' + fmt(tot) + '</span><span class="text-xs text-slate-500">' + fmt(tot / m) + "/mes" + (m === 6 && tot < planTotal(c.plan, 3) * 2 ? ' · <span class="text-primary-700 font-semibold">ahorras ' + fmt(planTotal(c.plan, 3) * 2 - tot) + "</span>" : "") + "</span></button>";
      }).join("") + '</div><p class="mt-2 text-xs text-slate-500">Precios de la tienda de rogansya.com (17-nov-2026). Las cápsulas vienen en presentación de 90 o 180.</p></fieldset>' : "") +
      '<fieldset class="card"><legend class="px-1 text-sm font-semibold">' + (c.mode === "unica" ? "3" : "2") + '. Complementa tu plan <span class="font-normal text-slate-500">(opcional)</span></legend><div class="mt-3 grid gap-3">' + addons.map(function (i) {
        var on = c.addons.indexOf(i) >= 0;
        return '<button type="button" class="opt" data-addon="' + i + '" aria-pressed="' + on + '">' + productThumb(i) + '<span class="flex-1"><span class="block text-sm font-semibold">' + P[i].name + '</span><span class="block text-xs text-slate-500">' + P[i].short + '</span></span><span class="text-sm font-semibold">' + fmt(P[i].price) + '</span><span class="ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-white ' + (on ? "border-primary-600 bg-primary-600" : "border-slate-300") + '">' + (on ? CHECK : "+") + "</span></button>";
      }).join("") + "</div></fieldset>" +
      "</div>" + summary(t, true) + "</div>" + trust(true) + "</section>";
  }

  function totals() {
    var c = state.cart; if (!c) return null;
    var sub = c.mode === "unica";
    var lines = PLANS[c.plan].items.map(function (i) { return { name: P[i].name, detail: sub ? unitLabel(i, c.months) : "Entrega mensual", amount: sub ? unitPrice(i, c.months) : null }; });
    c.addons.forEach(function (i) { lines.push({ name: P[i].name, detail: "1 unidad", amount: P[i].price }); });
    var known = lines.reduce(function (s, l) { return s + (l.amount || 0); }, 0);
    return { lines: lines, known: known, sub: !sub };
  }
  function summary(t, cta) {
    var c = state.cart;
    return '<aside class="card h-fit' + (cta ? " lg:sticky lg:top-6" : "") + '" aria-label="Resumen del pedido"><h2 class="font-semibold">Resumen del pedido</h2><p class="text-xs text-slate-500">' + PLANS[c.plan].name + " · " + (c.mode === "unica" ? "Compra única, " + c.months + " meses" : "Suscripción mensual") + "</p>" +
      '<ul class="mt-3 space-y-2 text-sm">' + t.lines.map(function (l) { return '<li class="flex justify-between gap-3"><span>' + esc(l.name) + '<span class="block text-xs text-slate-500">' + esc(l.detail) + '</span></span><span class="shrink-0 font-medium">' + (l.amount != null ? fmt(l.amount) : PRICE_TBD) + "</span></li>"; }).join("") +
      '<li class="flex justify-between border-t border-slate-100 pt-2"><span>Revisión médica (teleconsulta)</span><span class="font-medium text-primary-700">Incluida</span></li>' +
      '<li class="flex justify-between"><span>Envío</span><span class="font-medium">' + PRICE_TBD + "</span></li></ul>" +
      '<div class="mt-3 flex items-end justify-between border-t border-slate-200 pt-3"><span class="font-semibold">Total</span><span class="text-right"><span class="block text-2xl font-bold text-primary-950">' + (t.sub ? PRICE_TBD : fmt(t.known)) + '</span><span class="text-xs text-slate-500">' + (t.sub ? "Primer mes + complementos " + fmt(t.known) : "+ envío por confirmar") + "</span></span></div>" +
      '<p class="mt-3 rounded-xl bg-primary-50 p-3 text-xs text-primary-900">Pagas hoy y un médico revisa tu caso en 24 h. Si el tratamiento no es adecuado para ti, te devolvemos el 100 % ' + PH("condiciones por definir con Legal") + ".</p>" +
      (cta ? '<button class="btn-primary mt-4 w-full" data-go="checkout">Continuar al pago</button><p class="mt-2 text-center text-xs text-slate-500">Financiación disponible ' + PH("condiciones por confirmar") + "</p>" : "") + "</aside>";
  }

  function viewCheckout() {
    if (!state.cart) { go("inicio"); return ""; }
    setProgress(null);
    var t = totals(), d = state.form || {};
    var f = function (id, label, type, ph, extra) { return '<label class="block"><span class="label">' + label + '</span><input id="' + id + '" name="' + id + '" type="' + (type || "text") + '" class="field" placeholder="' + (ph || "") + '" value="' + esc(d[id] || "") + '" ' + (extra || "") + " required></label>"; };
    var pay = [["tarjeta", "Tarjeta débito o crédito", "Procesado por Bold"], ["pse", "PSE", "Débito desde tu cuenta bancaria"], ["addi", "Addi", "Paga a cuotas, sujeto a aprobación de Addi"]];
    return '<section class="pt-6"><button type="button" class="text-sm font-medium text-primary-800 hover:underline" data-go="plan">← Volver a tu plan</button>' +
      '<h1 class="mt-4 text-2xl font-bold text-primary-950">Finaliza tu pedido</h1><p class="text-sm text-slate-500">Pago simulado: este prototipo no cobra ni guarda tus datos. <button type="button" class="font-semibold text-primary-800 underline" data-fill>Llenar con datos de ejemplo</button></p>' +
      '<form id="checkout" class="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]" novalidate><div class="space-y-6">' +
      '<fieldset class="card space-y-4"><legend class="px-1 font-semibold">1. Tus datos de contacto</legend><div class="grid gap-4 sm:grid-cols-2">' + f("nombre", "Nombre y apellidos", "text", "Como aparece en tu documento", 'autocomplete="name"') + f("celular", "Celular (WhatsApp)", "tel", "300 000 0000", 'autocomplete="tel" inputmode="tel"') + "</div>" + f("correo", "Correo electrónico", "email", "tu@correo.com", 'autocomplete="email"') + "</fieldset>" +
      '<fieldset class="card space-y-4"><legend class="px-1 font-semibold">2. Datos para tu fórmula y factura</legend><p class="text-sm text-slate-600">Los pedimos solo aquí porque el médico los necesita para tu historia clínica y tu fórmula, y son obligatorios en la factura.</p><div class="grid gap-4 sm:grid-cols-3"><label class="block"><span class="label">Tipo de documento</span><select id="tipodoc" class="field"><option>Cédula de ciudadanía</option><option>Cédula de extranjería</option><option>Pasaporte</option></select></label>' + f("cedula", "Número de documento", "text", "", 'inputmode="numeric"') + f("nacimiento", "Fecha de nacimiento", "date", "") + "</div></fieldset>" +
      '<fieldset class="card space-y-4"><legend class="px-1 font-semibold">3. Envío</legend><div class="grid gap-4 sm:grid-cols-2">' + f("ciudad", "Ciudad", "text", "Bogotá", 'autocomplete="address-level2"') + f("direccion", "Dirección", "text", "Calle, número, apto", 'autocomplete="street-address"') + '</div><p class="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>Costo de envío</span><span class="font-semibold">' + PRICE_TBD + "</span></p><p class=\"text-xs text-slate-500\">El envío se despacha cuando el médico emite tu fórmula. " + PH("Tarifas y tiempos por ciudad por confirmar") + "</p></fieldset>" +
      '<fieldset class="card"><legend class="px-1 font-semibold">4. Medio de pago</legend><p class="mt-1 text-sm text-slate-600">Elige cómo quieres pagar.</p><div class="mt-3 grid gap-3" role="radiogroup" aria-label="Medio de pago">' + pay.map(function (p) {
        return '<label class="opt"><input type="radio" name="pago" value="' + p[0] + '" class="h-5 w-5 accent-primary-600" ' + (d.pago === p[0] ? "checked" : "") + '><span><span class="block font-semibold">' + p[1] + '</span><span class="block text-xs text-slate-500">' + p[2] + "</span></span></label>";
      }).join("") + '</div><p id="pago-err" class="mt-2 hidden text-sm text-red-600">Elige un medio de pago.</p></fieldset>' +
      '<fieldset class="card space-y-3 text-sm"><legend class="px-1 font-semibold">5. Autorizaciones</legend>' +
      '<label class="flex gap-3"><input type="checkbox" id="c1581" class="mt-1 h-5 w-5 shrink-0 accent-primary-600" required><span>Autorizo a Rogans el tratamiento de mis datos personales y de salud (datos sensibles) para prestarme la atención médica, emitir mi fórmula, facturar y enviarme mi pedido, conforme a la Ley 1581 de 2012 y a la <a class="underline" href="#inicio">política de tratamiento de datos</a>. ' + PH("Texto final por Legal") + "</span></label>" +
      '<label class="flex gap-3"><input type="checkbox" id="ctele" class="mt-1 h-5 w-5 shrink-0 accent-primary-600" required><span>Acepto la teleconsulta asíncrona: un médico revisará mis respuestas y podrá pedirme fotos o una videollamada antes de formular. Entiendo que el cuestionario es orientativo y no es un diagnóstico. ' + PH("Consentimiento informado por Legal / área médica") + "</span></label>" +
      '<label class="flex gap-3"><input type="checkbox" id="cwa" class="mt-1 h-5 w-5 shrink-0 accent-primary-600"><span>Quiero recibir el seguimiento de mi tratamiento por WhatsApp. (Opcional)</span></label>' +
      '<p id="form-err" class="hidden text-sm text-red-600">Revisa los campos obligatorios y las autorizaciones.</p></fieldset>' +
      "</div><div class=\"h-fit lg:sticky lg:top-6\">" + summary(t, false) + '<button type="submit" class="btn-primary mt-4 w-full">Pagar ' + (t.sub ? "" : fmt(t.known) + " ") + '<span class="text-xs font-normal">(simulado)</span></button><p class="mt-2 text-center text-xs text-slate-500">🔒 Pago seguro · No se realiza ningún cobro en este prototipo</p></div></form>' +
      trust(true) + "</section>";
  }

  function viewConfirmacion() {
    if (!state.order) { go("inicio"); return ""; }
    setProgress(null);
    var o = state.order;
    return '<section class="mx-auto max-w-2xl pt-8"><div class="text-center"><div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-500 text-primary-950"><svg width="28" height="28" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<h1 class="mt-4 text-3xl font-bold text-primary-950">¡Listo, ' + esc((o.nombre || "").split(" ")[0]) + '! Recibimos tu pedido</h1><p class="mt-2 text-slate-600">Pedido de prueba ' + esc(o.id) + " · " + esc(o.plan) + "</p></div>" +
      '<div class="card mt-6"><h2 class="font-semibold">Un médico revisa tu caso en 24 h</h2><p class="text-sm text-slate-600">Te escribimos por WhatsApp y correo apenas tengamos novedades. Si el médico necesita más información, te pedirá fotos de tu cabello o una videollamada corta.</p>' + timeline(1) + "</div>" +
      '<div class="card mt-4"><h2 class="font-semibold">Adelanta tu revisión (opcional)</h2><p class="text-sm text-slate-600">Sube 3 fotos de tu cabello: frente, coronilla y lados, con buena luz.</p><button type="button" class="btn-ghost mt-3" data-photos>Subir fotos (simulado)</button><p id="photos-msg" class="mt-2 hidden text-sm text-primary-700">En la versión final aquí se abre la carga de fotos. Las fotos se piden después del pago, como hace Choiz.</p></div>' +
      '<div class="card mt-4 text-sm text-slate-600"><p><strong>¿Y si el tratamiento no es para mí?</strong> Te devolvemos el 100 % ' + PH("condiciones por definir con Legal") + ".</p><p class=\"mt-2\"><strong>Garantía de resultados:</strong> " + PH("Condiciones de garantía por definir — propuesta: 180 días con adherencia") + "</p></div>" +
      '<div class="mt-6 flex justify-center"><button class="btn-ghost" data-restart>Volver a empezar el prototipo</button></div>' + trust(true) + "</section>";
  }

  // ---------- router ----------
  function render() {
    var h = (location.hash || "#inicio").slice(1), parts = h.split("/"), html = "";
    if (parts[0] === "q") html = viewQuestion(parts[1]);
    else if (parts[0] === "no-apto") html = viewNoApto(parts[1]);
    else if (parts[0] === "resultado") html = viewResultado();
    else if (parts[0] === "plan") html = viewPlan();
    else if (parts[0] === "checkout") html = viewCheckout();
    else if (parts[0] === "confirmacion") html = viewConfirmacion();
    else if (parts[0] === "consulta") html = viewConsulta();
    else if (parts[0] === "como-funciona") { html = viewInicio(); setTimeout(function () { var e = document.getElementById("como-funciona"); if (e) e.scrollIntoView(); }, 0); }
    else html = viewInicio();
    if (html) { $app.innerHTML = html; if (parts[0] !== "como-funciona") window.scrollTo(0, 0); }
    updateCartCount();
  }
  window.addEventListener("hashchange", render);

  // ---------- eventos ----------
  $app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-go],[data-single],[data-multi],[data-next],[data-back],[data-back-stop],[data-plan],[data-mode],[data-months],[data-addon],[data-fill],[data-photos],[data-restart]");
    if (!el) return;
    var h = (location.hash || "").slice(1).split("/");
    if (el.dataset.go) { if (el.tagName === "A") return; go(el.dataset.go); return; }
    if (el.hasAttribute("data-back")) { history.length > 1 ? history.back() : go("inicio"); return; }
    if (el.hasAttribute("data-back-stop")) { go("q/" + (state.stopFrom || "sexo")); return; }
    if (el.dataset.single != null && h[0] === "q") {
      var q = Q.find(function (x) { return x.id === h[1]; }), v = el.dataset.single;
      state.answers[q.id] = v; save();
      var stop = findStop(q, v);
      if (stop) { state.stopFrom = q.id; save(); go("no-apto/" + stop); return; }
      render(); setTimeout(function () { nextFrom(q.id); }, 180); return;
    }
    if (el.dataset.multi != null && h[0] === "q") {
      var q2 = Q.find(function (x) { return x.id === h[1]; }), v2 = el.dataset.multi, opt = q2.options.find(function (o) { return o.v === v2; });
      var arr = Array.isArray(state.answers[q2.id]) ? state.answers[q2.id].slice() : [];
      var i = arr.indexOf(v2);
      if (i >= 0) arr.splice(i, 1);
      else if (opt.none) arr = [v2];
      else { arr = arr.filter(function (x) { var o = q2.options.find(function (y) { return y.v === x; }); return !o.none; }); arr.push(v2); }
      state.answers[q2.id] = arr; keepText(q2); save(); render(); return;
    }
    if (el.hasAttribute("data-next")) {
      var q3 = Q.find(function (x) { return x.id === h[1]; }); keepText(q3);
      var stops = (state.answers[q3.id] || []).map(function (v) { return findStop(q3, v); }).filter(Boolean);
      if (stops.length) { state.stopFrom = q3.id; save(); go("no-apto/" + stops[0]); return; }
      save(); nextFrom(q3.id); return;
    }
    if (el.dataset.plan) { state.cart = { plan: el.dataset.plan, mode: "unica", months: 3, addons: [] }; save(); go("plan"); return; }
    if (el.dataset.mode) { state.cart.mode = el.dataset.mode; save(); render(); return; }
    if (el.dataset.months) { state.cart.months = +el.dataset.months; save(); render(); return; }
    if (el.dataset.addon) { var a = state.cart.addons, k = a.indexOf(el.dataset.addon); k >= 0 ? a.splice(k, 1) : a.push(el.dataset.addon); save(); render(); return; }
    if (el.hasAttribute("data-fill")) {
      var ex = { nombre: "Andrés Herrera Gómez", celular: "320 555 0148", correo: "andres.ejemplo@correo.com", cedula: "1000000000", nacimiento: "1991-04-12", ciudad: "Bogotá", direccion: "Calle 100 # 15-20, apto 301" };
      Object.keys(ex).forEach(function (k) { var inp = document.getElementById(k); if (inp) { inp.value = ex[k]; inp.classList.remove("border-red-500"); inp.removeAttribute("aria-invalid"); } });
      return;
    }
    if (el.hasAttribute("data-photos")) { document.getElementById("photos-msg").classList.remove("hidden"); return; }
    if (el.hasAttribute("data-restart")) { state = { answers: {}, cart: null, order: null }; save(); go("inicio"); return; }
  });
  $app.addEventListener("input", function (e) {
    if (e.target.matches("input,select,textarea")) { e.target.classList.remove("border-red-500"); e.target.removeAttribute("aria-invalid"); }
    if (e.target.name === "pago") document.getElementById("pago-err").classList.add("hidden");
  });
  $app.addEventListener("change", function (e) { if (e.target.name === "pago") document.getElementById("pago-err").classList.add("hidden"); });
  function keepText(q) { var t = document.getElementById("qtext"); if (q && q.text && t) state.answers[q.id + "_texto"] = t.value; }

  $app.addEventListener("submit", function (e) {
    if (e.target.id !== "checkout") return;
    e.preventDefault();
    var form = e.target, ok = true;
    ["nombre", "celular", "correo", "cedula", "nacimiento", "ciudad", "direccion"].forEach(function (id) {
      var inp = document.getElementById(id), bad = !inp.value.trim() || (id === "correo" && !/^\S+@\S+\.\S+$/.test(inp.value));
      inp.classList.toggle("border-red-500", bad); inp.setAttribute("aria-invalid", bad); if (bad) ok = false;
    });
    var pago = form.querySelector('input[name="pago"]:checked');
    document.getElementById("pago-err").classList.toggle("hidden", !!pago); if (!pago) ok = false;
    var cons = document.getElementById("c1581").checked && document.getElementById("ctele").checked;
    if (!cons) ok = false;
    document.getElementById("form-err").classList.toggle("hidden", ok);
    if (!ok) { var first = form.querySelector('[aria-invalid="true"]') || document.getElementById("form-err"); first.scrollIntoView({ block: "center" }); return; }
    // No se guarda la cédula ni se envía nada: solo nombre y plan para la pantalla final.
    state.order = { id: "RG-PRUEBA-" + Math.floor(1000 + Math.random() * 9000), nombre: document.getElementById("nombre").value, plan: PLANS[state.cart.plan].name };
    state.form = null; save(); go("confirmacion");
  });

  document.getElementById("cart-btn").addEventListener("click", function () { go(state.cart ? "plan" : (state.answers.sexo ? "resultado" : "inicio")); });

  render();
})();
