/*
 * Configuración de la landing "Clinova · Productos".
 * Todo lo que depende de negocio/legal/enlaces vive aquí para cambiarlo sin tocar app.js.
 */
window.CLINOVA_LANDING_CONFIG = {
  /*
   * Registro de demo: se usa el formulario EXISTENTE de clinova24.com (no se duplica ni se envían datos desde aquí).
   * Ese formulario (3 pasos, action AJAX "clinova24_demo_lead", solo mismo dominio) guarda page_url y los UTM,
   * así que el producto elegido en el quiz viaja en utm_content (clinova | notes | extension | asesoria).
   */
  DEMO_URL: "https://clinova24.com/solicitar-demo/",
  DEMO_UTM: { utm_source: "clinova-productos", utm_medium: "landing", utm_campaign: "productos-clinova" },
  DEMO_UTM_CONTENT: { pro: "clinova", notes: "notes", extension: "extension", "no-se": "asesoria" },

  /* Responsable del tratamiento de datos (Ley 1581 de 2012). NIT verificado en RUES: 901906889, DV 8. */
  LEGAL_ENTITY: "Ro Medical S.A.S.",

  /* Enlaces de producto */
  NOTES_REGISTER_URL: "https://notes.clinova24.com/register",
  CHROME_STORE_URL: "https://chromewebstore.google.com/detail/clinova-notes-%E2%80%94-autollena/nodeodcobaohjebegajgbbbjijipdfka",
  WHATSAPP_URL: "https://wa.me/573189010159"
};
