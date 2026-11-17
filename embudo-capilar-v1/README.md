# Embudo de compra capilar · prototipo v1 (estilo Choiz)

**Prototipo de prueba. No es el sitio en vivo.** No toca rogansya.com ni WordPress, no cobra, no guarda ni envía datos (solo `sessionStorage` del navegador). Todas las páginas llevan `noindex,nofollow`.

## Cómo verlo

Abre `index.html` servido desde cualquier carpeta (rutas relativas). Es una sola página con pasos por hash:

`#inicio` → `#q/<pregunta>` (14 preguntas, una por pantalla, barra de progreso y botón atrás) → `#no-apto/<motivo>` o `#resultado` → `#plan` (compra única o suscripción mensual, duración, complementos) → `#checkout` (simulado) → `#confirmacion` (línea de tiempo: pago → revisión médica en 24 h → fórmula → envío).

Construido con HTML, JS sin dependencias y Tailwind CSS v4 compilado (`assets/styles.css`). Fuente Poppins y turquesa `#00D0C0` de la marca.

## Qué cambia frente al flujo actual

- El resultado y el plan con precio se ven **sin pedir nombre ni teléfono** y sin pantalla de espera.
- La acción principal es **Empezar mi plan**. La consulta en vivo queda como opción secundaria.
- La **revisión médica va después del pago** (teleconsulta asíncrona, "un médico revisa tu caso en 24 h"), con devolución si el tratamiento no es adecuado.
- El cuestionario suma edad, sexo, embarazo o lactancia, alergias, condiciones, medicamentos y objetivo, con **salidas de "no apto"** hacia una consulta.
- Hay **compra única o suscripción mensual**, duración de 3 o 6 meses y complementos.
- El checkout muestra el **envío**, no preselecciona ningún medio de pago (Addi tampoco) y pide la **cédula solo en el paso de fórmula y factura**, con el consentimiento de la Ley 1581.
- Hay bloques de **confianza en todo el flujo**: IPS en Bogotá, sede física, magistrales, garantía y testimonios.

## Precios usados (tienda de rogansya.com, 17 de noviembre de 2026)

| Producto | Precio |
|---|---|
| Rogans 74+ con Dutasteride y Minoxidil, 90 / 180 cápsulas | $250.000 / $340.000 |
| Rogans 72M con Minoxidil, 90 / 180 cápsulas | $250.000 / $340.000 |
| Rogans 71+ con Dutasteride, 90 / 180 cápsulas | $250.000 / $340.000 |
| Tónico Capilar Rogans 56, 120 ml | $204.000 |
| Tónico Capilar Rogans | $98.000 |
| Vitapel Rogans | $189.900 |
| Shampoo Anticaída Renew | $98.000 |
| Kit Tratamiento Capilar Advanced 6 meses | $2.800.000 |
| Implante capilar | $9 a $13 millones (dato de Rogans) |

Los planes suman estos productos. Para 6 meses, los tópicos se multiplican por 2 unidades. Esa es una suposición de dosis que hay que validar.

## Marcadores pendientes (se ven en amarillo en la interfaz)

**Área médica**
- Las 14 preguntas, sus opciones y los textos de "¿Por qué lo preguntamos?".
- Criterios de **no apto**: menor de 18, mayor de 65, embarazo, lactancia o planear un embarazo, caída en parches o total, dolor, placas o heridas en el cuero cabelludo, cáncer de mama o próstata, enfermedad cardíaca o presión no controlada, enfermedad hepática o renal, lupus o autoinmunes, quimioterapia o inmunosupresores, y alergia a minoxidil y a dutasterida a la vez.
- La lógica de recomendación: Doble Acción, Esencial Oral, Minoxidil, Dutasterida, Mujer y Prevención. Incluye qué síntomas sexuales o de ánimo excluyen la dutasterida y si el Tónico 56 requiere fórmula.
- Ilustraciones Norwood y Ludwig (son esquemas), el plazo de 24 h (¿horas hábiles?) y los nombres y registros de los médicos.

**Legal**
- Condiciones de la garantía de devolución (propuesta: 180 días con adherencia) y del reembolso del 100 % si no hay tratamiento.
- Texto del consentimiento de la Ley 1581 y del consentimiento de teleconsulta asíncrona.
- Condiciones de la suscripción y de la cancelación, y el mecanismo de pago como reserva (Bold y Addi).
- Testimonios: los actuales son `[Testimonio de ejemplo]`. Cifra `[X] pacientes`.

**Comercial y precios**
- Precio de la suscripción mensual: **Precio por confirmar**.
- Costo y tiempos de envío: **Precio por confirmar**.
- Precio de la consulta en vivo: **Precio por confirmar** (hoy aparece $50.000 redimibles en unas páginas y gratis en otras).
- Condiciones de la financiación.
