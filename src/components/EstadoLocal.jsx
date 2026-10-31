import { useState } from 'react'
import { ORDEN_TIPOS, TIPOS } from '../config.js'
import { textoMotivo } from '../lib/mensajes.js'

const TONO = {
  sin_fila: 'v', corta: 'v', media: 'a', larga: 'r',
  gratis: 'v', con_costo: 'a',
  bajo: 'v', medio: 'a', alto: 'o', lleno: 'r'
}

// Datos de relleno para el estado bloqueado: NO son reales, el servidor no envía nada si no hay acceso.
const RELLENO = { fila: 'Corta', cover: 'Gratis', aforo: 'Medio' }

// `onUsarPase(local)` → Promise<{ok, motivo?}>; gasta un pase gratis (el servidor decide si hay).
export default function EstadoLocal({ user, local, info, onLogin, onUsarPase }) {
  const [confirmando, setConfirmando] = useState(false)
  const [gastando, setGastando] = useState(false)
  const [error, setError] = useState(null)
  if (!local) return null

  if (!user) {
    return (
      <div className="card estado" data-testid="estado-sin-sesion">
        <Bloqueado titulo="Reporta para desbloquear" sub="Inicia sesión, haz check-in y cuéntanos cómo está el lugar para ver cómo están todos." />
        <button className="sec" onClick={onLogin}>Entrar o crear cuenta</button>
      </div>
    )
  }
  if (!info) return <div className="card estado mut" data-testid="estado-cargando">Cargando estado…</div>

  if (!info.acceso) {
    const pases = info.pases_restantes ?? 0
    const usar = async () => {
      setGastando(true); setError(null)
      const r = await onUsarPase(local)
      setGastando(false); setConfirmando(false)
      if (!r.ok) setError(textoMotivo(r.motivo))
    }
    return (
      <div className="card estado" data-testid="estado-bloqueado">
        <Bloqueado titulo="Reporta para desbloquear"
          sub="Haz check-in en un local y reporta fila, cover o aforo: ves el estado de todos los locales por 3 horas." />
        {pases > 0 ? (
          !confirmando ? (
            <button className="sec" data-testid="pase-usar" onClick={() => { setConfirmando(true); setError(null) }}>
              Ver este local gratis ({pases} {pases === 1 ? 'pase' : 'pases'})
            </button>
          ) : (
            <div className="confirma" data-testid="pase-confirma">
              <div>Usarás 1 de tus {pases} {pases === 1 ? 'pase gratis' : 'pases gratis'} para ver <b>{local.nombre}</b>.</div>
              <div className="row">
                <button onClick={usar} disabled={gastando} data-testid="pase-si">{gastando ? 'Un momento…' : 'Sí, usar pase'}</button>
                <button className="lnk" onClick={() => setConfirmando(false)}>Cancelar</button>
              </div>
            </div>
          )
        ) : (
          <div className="mut" data-testid="pase-agotado">Ya usaste tu pase gratis.</div>
        )}
        {error && <div className="bad" role="alert">{error}</div>}
      </div>
    )
  }

  const e = info.estado || {}
  const hayAlguno = ORDEN_TIPOS.some(t => e[t])
  const porPase = info.via === 'pase'
  return (
    <div className="card estado" data-testid="estado-desbloqueado" data-via={info.via || 'reporte'}>
      <div className="row"><b>Estado ahora</b><span className={porPase ? 'warn' : 'ok'} data-testid="via">{porPase ? 'Pase gratis' : 'Desbloqueado'}</span></div>
      {!hayAlguno ? <div className="mut">Sin reportes recientes</div> : (
        <div className="filas">
          {ORDEN_TIPOS.map(t => (
            <div className="fila" key={t} data-testid={`estado-${t}`}>
              <span className="mut">{TIPOS[t].etiqueta}</span>
              {e[t] ? (
                <span><span className={`chip tono-${TONO[e[t].valor]}`}>{TIPOS[t].valores[e[t].valor]}</span>
                  <span className="mut"> · hace {e[t].hace_min} min</span></span>
              ) : <span className="mut">—</span>}
            </div>
          ))}
        </div>
      )}
      {porPase && <div className="mut">Solo ves este local. Haz check-in y reporta para ver todos.</div>}
    </div>
  )
}

function Bloqueado({ titulo, sub }) {
  return (
    <>
      <div className="bloq" aria-hidden="true">
        {ORDEN_TIPOS.map(t => (
          <div className="fila" key={t}><span className="mut">{TIPOS[t].etiqueta}</span><span className="chip difuso">{RELLENO[t]}</span></div>
        ))}
      </div>
      <div className="bloq-msg"><b>{titulo}</b><div className="mut">{sub}</div></div>
    </>
  )
}
