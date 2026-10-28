/*
 * Configuración de la landing "Clinova · Productos".
 * Todo lo que depende de negocio/legal/backend vive aquí para cambiarlo sin tocar app.js.
 */
window.CLINOVA_LANDING_CONFIG = {
  /*
   * A dónde se envía el formulario de demo.
   *  - null  => MODO VISTA PREVIA: no se envía ningún dato a ningún lado; solo se muestra la pantalla de éxito.
   *  - "https://…" => POST con el cuerpo en el formato de DEMO_ENDPOINT_FORMAT.
   * Pendiente de backend. Candidatos encontrados (no conectados):
   *  - clinova24.com (WordPress): admin-ajax.php, action "clinova24_demo_lead" + nonce "clinova24_demo_lead_nonce"
   *    (es el formulario "Solicitar demo de Clinova"; solo funciona desde el mismo dominio clinova24.com).
   *  - rogansya.com/externals-api.php?action=captura-datos-contacto-clinova (espera nombre, correo, telefono, clinica, utm).
   */
  DEMO_ENDPOINT: null,
  DEMO_ENDPOINT_FORMAT: "json", // "json" | "form"

  /* Responsable del tratamiento de datos que aparece en la autorización (Ley 1581 de 2012). */
  LEGAL_ENTITY: "Ro Medical S.A.S.",

  /* Enlaces de producto */
  NOTES_REGISTER_URL: "https://notes.clinova24.com/register",
  WHATSAPP_URL: "https://wa.me/573189010159"
};
