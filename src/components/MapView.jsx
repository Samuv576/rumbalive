import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { CENTRO_INICIAL } from '../data/localesDemo.js'

const ROSA = '#e11d74'

// Mapa con el círculo del geofence de cada local (tocar uno lo selecciona) y la posición del usuario.
export default function MapView({ locales, selId, onSelect, pos }) {
  const el = useRef(null)
  const mapa = useRef(null)
  const capaLocales = useRef(null)
  const yo = useRef({ punto: null, aro: null })
  const encuadrado = useRef(false)

  useEffect(() => {
    if (mapa.current) return
    mapa.current = L.map(el.current, { zoomControl: false }).setView([CENTRO_INICIAL.lat, CENTRO_INICIAL.lng], CENTRO_INICIAL.zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa.current)
    capaLocales.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current.remove(); mapa.current = null; encuadrado.current = false }
  }, [])

  useEffect(() => {
    if (!mapa.current) return
    capaLocales.current.clearLayers()
    locales.forEach(l => {
      const sel = l.id === selId
      const grupo = L.layerGroup()
      L.circle([l.lat, l.lng], { radius: l.radio_geofence_m, color: ROSA, weight: sel ? 3 : 1.5, fillOpacity: sel ? 0.28 : 0.12 }).addTo(grupo)
      const pin = L.circleMarker([l.lat, l.lng], { radius: sel ? 9 : 7, color: '#fff', weight: 2, fillColor: ROSA, fillOpacity: 1 }).addTo(grupo)
      pin.bindTooltip(l.nombre, { permanent: sel, direction: 'top', offset: [0, -8] })
      grupo.eachLayer(c => c.on('click', () => onSelect(l.id)))
      grupo.addTo(capaLocales.current)
    })
    if (locales.length && !encuadrado.current) {
      encuadrado.current = true
      mapa.current.fitBounds(L.latLngBounds(locales.map(l => [l.lat, l.lng])).pad(0.4))
    }
  }, [locales, selId, onSelect])

  useEffect(() => {
    if (!mapa.current) return
    if (!pos) {
      yo.current.punto?.remove(); yo.current.aro?.remove(); yo.current = { punto: null, aro: null }
      return
    }
    if (!yo.current.punto) {
      yo.current.aro = L.circle([pos.lat, pos.lng], { radius: pos.accuracy || 5, color: '#38bdf8', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(mapa.current)
      yo.current.punto = L.circleMarker([pos.lat, pos.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1, interactive: false }).addTo(mapa.current)
    } else {
      yo.current.punto.setLatLng([pos.lat, pos.lng]); yo.current.aro.setLatLng([pos.lat, pos.lng]).setRadius(pos.accuracy || 5)
    }
  }, [pos])

  return <div id="map" ref={el} data-testid="mapa" />
}
