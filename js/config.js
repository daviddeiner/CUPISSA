// Configuración de Supabase para CUPISSA
const SB_URL = 'https://lkdxtesgwqoizobxaawp.supabase.co';
const SB_KEY = 'sb_publishable_Fw-f7SC-4FgTjO3y5XbqRA_Pp0m6oCQ';

let supabaseClient = null;

try {
  if (typeof supabase !== 'undefined' && SB_KEY.trim() !== '') {
    supabaseClient = supabase.createClient(SB_URL, SB_KEY);
  }
} catch (e) {
  console.error("Error al inicializar Supabase:", e);
}