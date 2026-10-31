// Envoltorios de las 4 funciones RPC del contrato (ver CLAUDE.md). Nunca se escribe en tablas desde el cliente.
import { backend } from './backend.js'
import { RADIO_BUSQUEDA_M } from '../config.js'

// Los errores técnicos se traducen a un `motivo` que mensajes.js sabe mostrar.
function aMotivo(e) {
  const m = String(e?.message || '').toLowerCase()
  if (e?.code === '28000' || m.includes('no_autenticado')) return 'no_autenticado'
  if (e?.code === '22023' || m.includes('coordenadas_invalidas')) return 'coordenadas_invalidas'
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to')) return 'error_red'
  return 'error'
}
const falla = e => Object.assign(new Error(aMotivo(e)), { motivo: aMotivo(e) })

export async function localesCercanos(lat, lng, radio = RADIO_BUSQUEDA_M) {
  try { return (await backend.rpc('locales_cercanos', { p_lat: lat, p_lng: lng, p_radio_m: radio })) || [] } catch (e) { throw falla(e) }
}

// Devuelve { ok:true, local_id, local_nombre, distancia_m } o { ok:false, motivo }.
export async function crearCheckin(pos) {
  try {
    return await backend.rpc('crear_checkin', { p_lat: pos.lat, p_lng: pos.lng, p_precision_m: pos.accuracy ?? 0 })
  } catch (e) { return { ok: false, motivo: aMotivo(e) } }
}

// Devuelve { ok:true, acceso_desbloqueado } o { ok:false, motivo, ... }.
export async function crearReporte(localId, tipo, valor, pos) {
  try {
    return await backend.rpc('crear_reporte', {
      p_local_id: localId, p_tipo: tipo, p_valor: valor, p_lat: pos.lat, p_lng: pos.lng, p_precision_m: pos.accuracy ?? 0
    })
  } catch (e) { return { ok: false, motivo: aMotivo(e) } }
}

// { acceso:false, motivo } | { acceso:true, local_id, estado:{fila?,cover?,aforo?} }. Lanza si hay error (la UI conserva lo último).
export async function estadoLocal(localId) {
  try { return await backend.rpc('estado_local', { p_local_id: localId }) } catch (e) { throw falla(e) }
}

// Gasta un pase gratis sobre un local. { ok:true, pases_restantes } | { ok:false, motivo:'sin_pases'|'pase_ya_usado'|'ya_tienes_acceso'|... }
export async function usarPaseGratis(localId) {
  try { return await backend.rpc('usar_pase_gratis', { p_local_id: localId }) } catch (e) { return { ok: false, motivo: aMotivo(e) } }
}
