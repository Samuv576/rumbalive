import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { LOCALES_DEMO, CENTRO_INICIAL } from '../data/localesDemo.js'

// Calibración: solo se permite copiar la coordenada si el GPS tiene un margen de error menor o igual a esto.
const PRECISION_OK_M = 20

export default function Calibracion() {
  const mapEl = useRef(null)
  const map = useRef(null)
  const meMarker = useRef(null)
  const meCircle = useRef(null)
  const [pos, setPos] = useState(null)
  const [err, setErr] = useState(null)
  const [copiado, setCopiado] = useState(false)

  // Mapa base (OpenStreetMap) + geofences de los locales de la demo
  useEffect(() => {
    if (map.current) return
    map.current = L.map(mapEl.current, { zoomControl: false }).setView(
      [CENTRO_INICIAL.lat, CENTRO_INICIAL.lng], CENTRO_INICIAL.zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map.current)

    LOCALES_DEMO.forEach(l => {
      L.circle([l.lat, l.lng], { radius: l.radio_m, color: '#e11d74', weight: 2, fillOpacity: 0.12 })
        .addTo(map.current).bindTooltip(l.nombre)
    })
    if (LOCALES_DEMO.length) {
      map.current.fitBounds(L.latLngBounds(LOCALES_DEMO.map(l => [l.lat, l.lng])).pad(0.4))
    }
  }, [])

  // Ubicación del usuario (requiere HTTPS o localhost)
  useEffect(() => {
    if (!('geolocation' in navigator)) { setErr('Este navegador no tiene geolocalización.'); return }
    const id = navigator.geolocation.watchPosition(
      p => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords
        setPos({ lat, lng, accuracy }); setErr(null)
        if (!map.current) return
        if (!meMarker.current) {
          meMarker.current = L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 }).addTo(map.current)
          meCircle.current = L.circle([lat, lng], { radius: accuracy, color: '#38bdf8', weight: 1, fillOpacity: 0.08 }).addTo(map.current)
          if (!LOCALES_DEMO.length) map.current.setView([lat, lng], 18)
        } else {
          meMarker.current.setLatLng([lat, lng]); meCircle.current.setLatLng([lat, lng]).setRadius(accuracy)
        }
      },
      e => setErr(e.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const precisionOk = pos ? pos.accuracy <= PRECISION_OK_M : false

  const copiar = async () => {
    if (!pos || !precisionOk) return
    const txt = `{ lat: ${pos.lat.toFixed(6)}, lng: ${pos.lng.toFixed(6)} }`
    try { await navigator.clipboard.writeText(txt); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sin portapapeles */ }
  }

  return (
    <div className="app">
      <div className="top">
        <h1>RumbaLive</h1>
        <span className="tag">Calibración · <a href="./">volver</a></span>
      </div>
      <div id="map" ref={mapEl} />
      <div className="panel">
        <div className="row"><b>Calibración de locales</b><span className="mut">{LOCALES_DEMO.length} configurados</span></div>
        {err && <div className="warn">{err}</div>}
        {pos ? (
          <>
            <div className="row"><span className="mut">Lat / Lng</span><span>{pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}</span></div>
            <div className="row">
              <span className="mut">Precisión GPS</span>
              <span className={precisionOk ? 'ok' : 'bad'}>±{Math.round(pos.accuracy)} m</span>
            </div>
            {!precisionOk && (
              <div className="bad" style={{ marginTop: 4 }}>
                Precisión insuficiente (debe ser ≤ {PRECISION_OK_M} m). Espera unos segundos o sal a cielo abierto antes de copiar.
              </div>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="sec" onClick={copiar} disabled={!precisionOk}>
                {copiado ? 'Copiado' : precisionOk ? 'Copiar coordenada' : 'Esperando mejor precisión…'}
              </button>
            </div>
          </>
        ) : !err && <div className="mut">Esperando ubicación…</div>}
      </div>
    </div>
  )
}
