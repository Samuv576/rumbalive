import { useEffect, useState } from 'react'
import { crearCheckin, crearReporte } from '../lib/api.js'
import { textoMotivo, textoUbicacion } from '../lib/mensajes.js'
import { distanciaM } from '../lib/geo.js'
import { useAhora } from '../hooks/useAhora.js'
import { CHECKIN_VIGENCIA_S, DWELL_S, ORDEN_TIPOS, TIPOS, TOLERANCIA_GPS_M } from '../config.js'

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Check-in («Estoy aquí») + cuenta regresiva de dwell-time + reporte táctil sin escribir texto.
export default function Accion({ user, pos, ubic, locales, checkin, setCheckin, onLogin, onReporteOk }) {
  const [msg, setMsg] = useState(null)       // { tipo:'ok'|'bad'|'info', texto }
  const [enviando, setEnviando] = useState(false)
  const [tipo, setTipo] = useState('fila')
  const [extraS, setExtraS] = useState(0)    // si el servidor aún no da por cumplido el dwell-time
  const ahora = useAhora(!!checkin)

  // El check-in vence a los 120 min (checkin_vigencia_min).
  useEffect(() => {
    if (checkin && ahora - checkin.t >= CHECKIN_VIGENCIA_S * 1000) setCheckin(null)
  }, [ahora, checkin, setCheckin])
  useEffect(() => { setExtraS(0) }, [checkin?.t])

  if (!user) {
    return (
      <div className="card" data-testid="accion-sin-sesion">
        <div className="mut">Para hacer check-in y reportar necesitas una cuenta.</div>
        <button onClick={onLogin}>Entrar o crear cuenta</button>
      </div>
    )
  }

  const avisoUbic = textoUbicacion(ubic.estado)
  if (!pos) {
    return (
      <div className="card" data-testid="accion-sin-ubicacion">
        {avisoUbic ? <div className="warn" role="alert">{avisoUbic}</div> : <div className="mut">Buscando tu ubicación…</div>}
        <button disabled>Estoy aquí</button>
      </div>
    )
  }

  const masCercano = locales.length
    ? locales.map(l => ({ l, d: distanciaM(pos, l) })).sort((a, b) => a.d - b.d)[0] : null
  const dentro = masCercano && masCercano.d <= masCercano.l.radio_geofence_m + Math.min(pos.accuracy || 0, TOLERANCIA_GPS_M)

  const hacerCheckin = async () => {
    setEnviando(true); setMsg(null)
    const r = await crearCheckin(pos)
    setEnviando(false)
    if (r.ok) {
      setCheckin({ local_id: r.local_id, nombre: r.local_nombre, t: Date.now() })
      onReporteOk?.(r.local_id, false)
    } else {
      setMsg({ tipo: 'bad', texto: textoMotivo(r.motivo) })
    }
  }

  const reportar = async valor => {
    setEnviando(true); setMsg(null)
    const r = await crearReporte(checkin.local_id, tipo, valor, pos)
    setEnviando(false)
    if (r.ok) {
      setMsg({ tipo: 'ok', texto: '¡Gracias! Reporte enviado. Ya puedes ver el estado de todos los locales.' })
      onReporteOk?.(checkin.local_id, true)
    } else {
      if (r.motivo === 'dwell_time_no_cumplido') setExtraS(s => s + 10)
      setMsg({ tipo: 'bad', texto: textoMotivo(r.motivo) })
    }
  }

  // ---- sin check-in
  if (!checkin) {
    return (
      <div className="card" data-testid="accion-checkin">
        <div className="row"><span className="mut">Precisión GPS</span><span>±{Math.round(pos.accuracy || 0)} m</span></div>
        {masCercano && (
          <div className={dentro ? 'ok' : 'mut'} data-testid="pista-geofence">
            {dentro ? `Estás en ${masCercano.l.nombre}` : `Estás a ${Math.round(masCercano.d)} m de ${masCercano.l.nombre}`}
          </div>
        )}
        <button onClick={hacerCheckin} disabled={enviando}>{enviando ? 'Verificando…' : 'Estoy aquí'}</button>
        {msg && <div className={msg.tipo} role="alert">{msg.texto}</div>}
      </div>
    )
  }

  // ---- con check-in
  const total = DWELL_S + extraS
  const restante = Math.max(0, Math.ceil((checkin.t + total * 1000 - ahora) / 1000))
  const listo = restante === 0
  const valores = TIPOS[tipo].valores
  return (
    <div className="card" data-testid="accion-reporte">
      <div className="row"><b>Check-in en {checkin.nombre}</b>
        <button className="lnk" onClick={() => { setCheckin(null); setMsg(null) }}>No estoy aquí</button></div>
      {!listo ? (
        <div data-testid="espera">
          <div className="mut">Podrás reportar en <b data-testid="cuenta">{mmss(restante)}</b></div>
          <div className="barra"><i style={{ width: `${Math.min(100, ((total - restante) / total) * 100)}%` }} /></div>
        </div>
      ) : <div className="ok">Ya puedes reportar</div>}

      <div className="tabs" role="tablist">
        {ORDEN_TIPOS.map(t => (
          <button key={t} role="tab" aria-selected={tipo === t} className={tipo === t ? 'tab on' : 'tab'}
            onClick={() => { setTipo(t); setMsg(null) }}>{TIPOS[t].etiqueta}</button>
        ))}
      </div>
      <div className="valores" data-testid="valores">
        {Object.entries(valores).map(([v, etiqueta]) => (
          <button key={v} className="valor" data-valor={v} disabled={!listo || enviando} onClick={() => reportar(v)}>{etiqueta}</button>
        ))}
      </div>
      {msg && <div className={msg.tipo} role="alert" data-testid="mensaje">{msg.texto}</div>}
    </div>
  )
}
