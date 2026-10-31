import { ORDEN_TIPOS, TIPOS } from '../config.js'

const TONO = {
  sin_fila: 'v', corta: 'v', media: 'a', larga: 'r',
  gratis: 'v', con_costo: 'a',
  bajo: 'v', medio: 'a', alto: 'o', lleno: 'r'
}

// Datos de relleno para el estado bloqueado: NO son reales, el servidor no envía nada si no hay acceso.
const RELLENO = { fila: 'Corta', cover: 'Gratis', aforo: 'Medio' }

export default function EstadoLocal({ user, local, info, onLogin }) {
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
    return (
      <div className="card estado" data-testid="estado-bloqueado">
        <Bloqueado titulo="Reporta para desbloquear" sub="Haz check-in en un local y reporta fila, cover o aforo: ves el estado de todos los locales por 3 horas." />
      </div>
    )
  }

  const e = info.estado || {}
  const hayAlguno = ORDEN_TIPOS.some(t => e[t])
  return (
    <div className="card estado" data-testid="estado-desbloqueado">
      <div className="row"><b>Estado ahora</b><span className="ok">Desbloqueado</span></div>
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
