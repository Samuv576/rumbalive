// Backend simulado para modo demo: replica el contrato de las funciones RPC de Supabase
// (supabase/migrations/0002), las reglas de negocio y el comportamiento de Realtime + RLS.
// Los datos viven en localStorage (compartidos entre pestañas); la sesión, en sessionStorage (una por pestaña).
// NO es seguridad: solo sirve para desarrollar y demostrar sin proyecto Supabase.
import { LOCALES_DEMO } from '../data/localesDemo.js'
import { distanciaM } from './geo.js'
import {
  DWELL_S, COOLDOWN_S, ACCESO_VIGENCIA_S, CHECKIN_VIGENCIA_S, REPORTE_VIGENCIA_S, TOLERANCIA_GPS_M
} from '../config.js'

const K_DB = 'rl_demo_db'
const K_SES = 'rl_demo_session'
const VALORES = {
  fila: ['sin_fila', 'corta', 'media', 'larga'],
  cover: ['gratis', 'con_costo'],
  aforo: ['bajo', 'medio', 'alto', 'lleno']
}

const idLocal = i => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
const LOCALES = LOCALES_DEMO.map((l, i) => ({ ...l, uuid: idLocal(i) }))

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const vacia = () => ({ usuarios: [], checkins: [], reportes: [] })

function leerDb() {
  try { return { ...vacia(), ...JSON.parse(localStorage.getItem(K_DB) || '{}') } } catch { return vacia() }
}
const guardarDb = db => localStorage.setItem(K_DB, JSON.stringify(db))
function sesion() {
  try { return JSON.parse(sessionStorage.getItem(K_SES) || 'null') } catch { return null }
}

const err = (message, code) => Object.assign(new Error(message), { code })
const enLinea = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
const esperar = () => new Promise(r => setTimeout(r, 120)) // latencia simulada

// ------------------------------------------------------------------ reglas (espejo del SQL)
function tieneAcceso(db, userId) {
  const u = db.usuarios.find(x => x.id === userId)
  return !!(u && u.ultimo_reporte_en && Date.now() - u.ultimo_reporte_en <= ACCESO_VIGENCIA_S * 1000)
}

const rpcs = {
  locales_cercanos({ p_lat, p_lng, p_radio_m = 5000 }) {
    return LOCALES
      .map(l => ({ l, d: distanciaM({ lat: p_lat, lng: p_lng }, l) }))
      .filter(x => x.d <= p_radio_m)
      .sort((a, b) => a.d - b.d)
      .map(({ l, d }) => ({
        id: l.uuid, nombre: l.nombre, categoria: l.categoria || 'campus', lat: l.lat, lng: l.lng,
        radio_geofence_m: l.radio_m, distancia_m: Math.round(d * 10) / 10
      }))
  },

  crear_checkin({ p_lat, p_lng, p_precision_m = 0, p_local_id = null }, db, userId) {
    if (!userId) throw err('no_autenticado', '28000')
    if (!(Math.abs(p_lat) <= 90 && Math.abs(p_lng) <= 180)) throw err('coordenadas_invalidas', '22023')
    const tol = Math.min(Math.max(p_precision_m || 0, 0), TOLERANCIA_GPS_M)
    const cand = LOCALES
      .filter(l => !p_local_id || l.uuid === p_local_id)
      .map(l => ({ l, d: distanciaM({ lat: p_lat, lng: p_lng }, l) }))
      .filter(x => x.d <= x.l.radio_m + tol)
      .sort((a, b) => a.d - b.d)[0]
    if (!cand) return { ok: false, motivo: 'fuera_de_geofence' }
    const checkin_id = uid()
    db.checkins.push({ id: checkin_id, usuario_id: userId, local_id: cand.l.uuid, creado_en: Date.now() })
    return { ok: true, checkin_id, local_id: cand.l.uuid, local_nombre: cand.l.nombre, distancia_m: Math.round(cand.d * 10) / 10 }
  },

  crear_reporte({ p_local_id, p_tipo, p_valor, p_lat, p_lng, p_precision_m = 0 }, db, userId, emitir) {
    if (!userId) throw err('no_autenticado', '28000')
    if (!(Math.abs(p_lat) <= 90 && Math.abs(p_lng) <= 180)) throw err('coordenadas_invalidas', '22023')
    const acceso = () => tieneAcceso(db, userId)
    if (!(VALORES[p_tipo] && VALORES[p_tipo].includes(p_valor))) return { ok: false, motivo: 'valor_invalido', acceso_desbloqueado: acceso() }
    const local = LOCALES.find(l => l.uuid === p_local_id)
    if (!local) return { ok: false, motivo: 'local_no_existe', acceso_desbloqueado: acceso() }

    const tol = Math.min(Math.max(p_precision_m || 0, 0), TOLERANCIA_GPS_M)
    const geo = distanciaM({ lat: p_lat, lng: p_lng }, local) <= local.radio_m + tol
    const ahora = Date.now()
    const dwell = db.checkins.some(c => c.usuario_id === userId && c.local_id === p_local_id
      && c.creado_en <= ahora - DWELL_S * 1000 && c.creado_en >= ahora - CHECKIN_VIGENCIA_S * 1000)
    if (!geo || !dwell) {
      return { ok: false, motivo: !geo ? 'fuera_de_geofence' : 'dwell_time_no_cumplido',
        geofence_valido: geo, dwell_time_cumplido: dwell, acceso_desbloqueado: acceso() }
    }
    if (db.reportes.some(r => r.usuario_id === userId && r.local_id === p_local_id && r.tipo === p_tipo
        && r.creado_en > ahora - COOLDOWN_S * 1000)) {
      return { ok: false, motivo: 'demasiado_pronto', geofence_valido: true, dwell_time_cumplido: true, acceso_desbloqueado: acceso() }
    }
    const fila = { id: uid(), usuario_id: userId, local_id: p_local_id, tipo: p_tipo, valor: p_valor, creado_en: ahora }
    db.reportes.push(fila)
    db.usuarios.find(u => u.id === userId).ultimo_reporte_en = ahora
    emitir(fila)
    return { ok: true, geofence_valido: true, dwell_time_cumplido: true, acceso_desbloqueado: true }
  },

  estado_local({ p_local_id }, db, userId) {
    if (!userId) throw err('no_autenticado', '28000')
    if (!tieneAcceso(db, userId)) return { acceso: false, motivo: 'sin_reporte_vigente' }
    const ahora = Date.now()
    const estado = {}
    db.reportes
      .filter(r => r.local_id === p_local_id && r.creado_en > ahora - REPORTE_VIGENCIA_S * 1000)
      .sort((a, b) => a.creado_en - b.creado_en)
      .forEach(r => { estado[r.tipo] = { valor: r.valor, hace_min: Math.round((ahora - r.creado_en) / 60000) } })
    return { acceso: true, local_id: p_local_id, estado }
  }
}

// ------------------------------------------------------------------ Auth
const oyentesAuth = new Set()
const notificarAuth = () => { const u = sesion(); oyentesAuth.forEach(cb => cb(u)) }

// ------------------------------------------------------------------ Realtime (emulado)
const suscriptores = new Set() // { onInsert, onEstado }
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rl_demo_reportes') : null

// Réplica de la política RLS reportes_g2g: solo reciben el evento quienes tienen acceso (o son el autor).
function entregar(fila) {
  if (!enLinea()) return // WebSocket caído: el evento se pierde y la app debe reconciliar al volver (TC-08)
  const db = leerDb()
  const u = sesion()
  if (!u) return
  if (fila.usuario_id === u.id || tieneAcceso(db, u.id)) {
    suscriptores.forEach(s => s.onInsert({ ...fila }))
  }
}
if (canal) canal.onmessage = e => entregar(e.data)
if (typeof window !== 'undefined') {
  const estado = () => (enLinea() ? 'conectado' : 'desconectado')
  window.addEventListener('online', () => suscriptores.forEach(s => s.onEstado(estado())))
  window.addEventListener('offline', () => suscriptores.forEach(s => s.onEstado(estado())))
}

export const mockBackend = {
  modo: 'demo',

  async getUser() { return sesion() },

  onAuth(cb) { oyentesAuth.add(cb); return () => oyentesAuth.delete(cb) },

  async signUp(email, password) {
    await esperar()
    if (!enLinea()) throw err('Failed to fetch')
    const correo = String(email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw err('Unable to validate email address: invalid format')
    if (String(password).length < 6) throw err('Password should be at least 6 characters')
    const db = leerDb()
    if (db.usuarios.some(u => u.email === correo)) throw err('User already registered')
    const u = { id: uid(), email: correo, password, ultimo_reporte_en: null }
    db.usuarios.push(u); guardarDb(db)
    sessionStorage.setItem(K_SES, JSON.stringify({ id: u.id, email: u.email }))
    notificarAuth()
    return { user: { id: u.id, email: u.email }, necesitaConfirmar: false }
  },

  async signIn(email, password) {
    await esperar()
    if (!enLinea()) throw err('Failed to fetch')
    const correo = String(email).trim().toLowerCase()
    const u = leerDb().usuarios.find(x => x.email === correo && x.password === password)
    if (!u) throw err('Invalid login credentials')
    sessionStorage.setItem(K_SES, JSON.stringify({ id: u.id, email: u.email }))
    notificarAuth()
    return { user: { id: u.id, email: u.email } }
  },

  async signOut() { sessionStorage.removeItem(K_SES); notificarAuth() },

  async rpc(nombre, args = {}) {
    await esperar()
    if (!enLinea()) throw err('Failed to fetch')
    const fn = rpcs[nombre]
    if (!fn) throw err(`función desconocida: ${nombre}`)
    const db = leerDb()
    const u = sesion()
    const r = fn(args, db, u?.id, fila => {
      guardarDb(db)
      canal?.postMessage(fila)   // otras pestañas
      entregar(fila)             // esta pestaña
    })
    guardarDb(db)
    return r
  },

  suscribirReportes({ onInsert, onEstado }) {
    const s = { onInsert, onEstado }
    suscriptores.add(s)
    setTimeout(() => onEstado(enLinea() ? 'conectado' : 'desconectado'), 50)
    return () => suscriptores.delete(s)
  }
}

export const LOCALES_MOCK = LOCALES
