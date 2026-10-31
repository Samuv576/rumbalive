// Reglas de negocio del lado cliente. El servidor (tabla `config`) es quien decide de verdad;
// estos valores solo sirven para la cuenta regresiva y los textos. Deben coincidir con supabase/migrations/0001.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sin variables de entorno la app corre contra un backend simulado en el navegador (modo demo).
export const MODO_DEMO = !(url && key)

// En modo demo se pueden acortar los tiempos para probar rápido: ?dwell=10&cooldown=15&acceso=60 (segundos).
const q = new URLSearchParams(window.location.search)
const seg = (nombre, porDefecto) => {
  const v = Number(q.get(nombre))
  return MODO_DEMO && Number.isFinite(v) && v > 0 ? v : porDefecto
}

export const DWELL_S = seg('dwell', 3 * 60)               // dwell_min_min = 3
export const COOLDOWN_S = seg('cooldown', 2 * 60)         // cooldown_reporte_min = 2
export const ACCESO_VIGENCIA_S = seg('acceso', 180 * 60)  // acceso_vigencia_min = 180
export const CHECKIN_VIGENCIA_S = 120 * 60                // checkin_vigencia_min = 120
export const REPORTE_VIGENCIA_S = 60 * 60                 // reporte_vigencia_min = 60
export const TOLERANCIA_GPS_M = 25                        // tolerancia_gps_max_m = 25
export const REFRESCO_S = 30                              // refresco periódico del estado
export const RADIO_BUSQUEDA_M = 5000

export const TIPOS = {
  fila:  { etiqueta: 'Fila',  valores: { sin_fila: 'Sin fila', corta: 'Corta', media: 'Media', larga: 'Larga' } },
  cover: { etiqueta: 'Cover', valores: { gratis: 'Gratis', con_costo: 'Con costo' } },
  aforo: { etiqueta: 'Aforo', valores: { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', lleno: 'Lleno' } }
}
export const ORDEN_TIPOS = ['fila', 'cover', 'aforo']

export const SUPABASE_URL = url
export const SUPABASE_KEY = key
