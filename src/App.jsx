import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { backend } from './lib/backend.js'
import { localesCercanos, usarPaseGratis } from './lib/api.js'
import { distanciaM } from './lib/geo.js'
import { useUbicacion } from './hooks/useUbicacion.js'
import { useEstados } from './hooks/useEstados.js'
import { CENTRO_INICIAL } from './data/localesDemo.js'
import { MODO_DEMO, CHECKIN_VIGENCIA_S } from './config.js'
import { LOCALES_MOCK } from './lib/mockBackend.js'
import MapView from './components/MapView.jsx'
import EstadoLocal from './components/EstadoLocal.jsx'
import Accion from './components/Accion.jsx'
import Auth from './components/Auth.jsx'
import Calibracion from './components/Calibracion.jsx'

export default function App() {
  const calibrar = new URLSearchParams(window.location.search).has('calibrar')
  return calibrar ? <Calibracion /> : <Principal />
}

const claveCheckin = id => `rl_checkin_${id}`
function leerCheckin(userId) {
  try {
    const c = JSON.parse(localStorage.getItem(claveCheckin(userId)) || 'null')
    return c && Date.now() - c.t < CHECKIN_VIGENCIA_S * 1000 ? c : null
  } catch { return null }
}

function Principal() {
  const [user, setUser] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [verAuth, setVerAuth] = useState(false)

  // T02 · sesión: se recupera al recargar y reacciona a entrar/salir.
  useEffect(() => {
    let vivo = true
    backend.getUser().then(u => { if (vivo) { setUser(u); setCargandoSesion(false) } })
    const off = backend.onAuth(u => { setUser(u); if (u) setVerAuth(false) })
    return () => { vivo = false; off() }
  }, [])

  // Solo modo demo: simular la ubicación desde un computador.
  const [simId, setSimId] = useState('')
  const simulada = useMemo(() => {
    const l = MODO_DEMO && LOCALES_MOCK.find(x => x.uuid === simId)
    if (simId === 'lejos') return { lat: 6.2442, lng: -75.5812, accuracy: 5 }
    return l ? { lat: l.lat, lng: l.lng, accuracy: 5 } : null
  }, [simId])
  const ubic = useUbicacion(simulada)
  const pos = ubic.pos
  const posRef = useRef(pos); posRef.current = pos

  // T03 · locales reales por RPC (público). Sin ubicación (denegada, lenta o lejos) se usa el centro del campus.
  const [locales, setLocales] = useState([])
  const [estadoLocales, setEstadoLocales] = useState('cargando') // 'cargando' | 'ok' | 'error'
  const [lejos, setLejos] = useState(false)
  const iniciado = useRef(false)

  const cargarLocales = useCallback(async centro => {
    iniciado.current = true
    setEstadoLocales('cargando')
    try {
      let lista = await localesCercanos(centro.lat, centro.lng)
      let fuera = false
      if (!lista.length && centro !== CENTRO_INICIAL) { lista = await localesCercanos(CENTRO_INICIAL.lat, CENTRO_INICIAL.lng); fuera = true }
      setLocales(lista.map(l => ({ ...l, id: l.id }))); setLejos(fuera); setEstadoLocales('ok')
    } catch { iniciado.current = false; setEstadoLocales('error') }
  }, [])

  useEffect(() => {
    if (iniciado.current) return
    if (ubic.estado === 'buscando') {
      const t = setTimeout(() => { if (!iniciado.current) cargarLocales(CENTRO_INICIAL) }, 6000)
      return () => clearTimeout(t)
    }
    cargarLocales(posRef.current || CENTRO_INICIAL)
  }, [ubic.estado, cargarLocales])

  // Local seleccionado: el más cercano al inicio.
  const [selId, setSelId] = useState(null)
  useEffect(() => {
    if (!locales.length) return
    if (selId && locales.some(l => l.id === selId)) return
    const p = posRef.current
    const cerca = p ? [...locales].sort((a, b) => distanciaM(p, a) - distanciaM(p, b))[0] : locales[0]
    setSelId(cerca.id)
  }, [locales, selId])
  const sel = locales.find(l => l.id === selId) || null

  // Check-in vigente del usuario (se conserva al recargar).
  const [checkin, setCheckinEstado] = useState(null)
  useEffect(() => { setCheckinEstado(user ? leerCheckin(user.id) : null) }, [user])
  const setCheckin = useCallback(c => {
    setCheckinEstado(c)
    if (!user) return
    try { c ? localStorage.setItem(claveCheckin(user.id), JSON.stringify(c)) : localStorage.removeItem(claveCheckin(user.id)) } catch { /* sin almacenamiento */ }
  }, [user])

  // T06/T07 · estado por local, tiempo real y reconexión.
  const { estados, conexion, refrescarTodo, refrescarLocal } = useEstados(user, locales)
  const alAccionar = useCallback((localId, reporto) => {
    setSelId(localId)
    if (reporto) refrescarTodo()
  }, [refrescarTodo])

  // Pase gratis: gasta un pase sobre el local elegido y refresca ese local.
  const usarPase = useCallback(async local => {
    const r = await usarPaseGratis(local.id)
    if (r.ok || r.motivo === 'ya_tienes_acceso') await refrescarTodo()
    return r
  }, [refrescarTodo])

  const chipConexion = !user ? { t: MODO_DEMO ? 'Demo' : 'Público', c: 'mut' }
    : conexion === 'conectado' ? { t: 'En vivo', c: 'ok' } : { t: 'Sin conexión', c: 'bad' }

  return (
    <div className="app">
      <header className="top">
        <h1>RumbaLive</h1>
        <div className="top-der">
          <span className={`pill ${chipConexion.c}`} data-testid="conexion">● {chipConexion.t}</span>
          {user
            ? <button className="lnk" data-testid="salir" onClick={() => { backend.signOut() }} title={user.email}>Salir</button>
            : <button className="mini" disabled={cargandoSesion} onClick={() => setVerAuth(true)}>Entrar</button>}
        </div>
      </header>

      <MapView locales={locales} selId={selId} onSelect={setSelId} pos={pos} />

      <section className="sheet">
        {MODO_DEMO && (
          <div className="demo">
            <span>Modo demo (sin Supabase)</span>
            <select aria-label="Simular ubicación" value={simId} onChange={e => setSimId(e.target.value)}>
              <option value="">Ubicación real (GPS)</option>
              {LOCALES_MOCK.map(l => <option key={l.uuid} value={l.uuid}>Simular: {l.nombre}</option>)}
              <option value="lejos">Simular: lejos del campus</option>
            </select>
          </div>
        )}
        {lejos && <div className="warn banner">Estás lejos del campus. Te mostramos los locales del TdeA.</div>}
        {ubic.estado === 'denegado' && <div className="warn banner">Sin permiso de ubicación: puedes ver el mapa, pero no hacer check-in ni reportar.</div>}
        {estadoLocales === 'error' && (
          <div className="bad banner">No pudimos cargar los locales. <button className="lnk" onClick={() => cargarLocales(posRef.current || CENTRO_INICIAL)}>Reintentar</button></div>
        )}
        {estadoLocales === 'cargando' && !locales.length && <div className="mut banner">Cargando locales…</div>}

        {locales.length > 0 && (
          <div className="chips" role="listbox" aria-label="Locales">
            {locales.map(l => (
              <button key={l.id} role="option" aria-selected={l.id === selId} className={l.id === selId ? 'chip-local on' : 'chip-local'}
                onClick={() => setSelId(l.id)}>
                {l.nombre}{pos && <small> · {Math.round(distanciaM(pos, l))} m</small>}
              </button>
            ))}
          </div>
        )}

        {sel && <h2 className="local-nombre" data-testid="local-nombre">{sel.nombre}</h2>}
        <EstadoLocal user={user} local={sel} info={sel ? estados[sel.id] : null} onLogin={() => setVerAuth(true)} onUsarPase={usarPase} />
        <Accion user={user} pos={pos} ubic={ubic} locales={locales} checkin={checkin}
          setCheckin={setCheckin} onLogin={() => setVerAuth(true)} onReporteOk={alAccionar} />
      </section>

      {verAuth && <Auth onCerrar={() => setVerAuth(false)} />}
    </div>
  )
}
