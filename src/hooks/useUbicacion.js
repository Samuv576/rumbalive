import { useEffect, useState } from 'react'

// Ubicación de alta precisión. estado: 'buscando' | 'ok' | 'denegado' | 'no_disponible'.
// Con el permiso denegado `pos` es siempre null: la app no puede dar un check-in por válido (TC-09).
// `simulada` solo se usa en modo demo (selector de ubicación para probar desde un computador).
export function useUbicacion(simulada = null) {
  const [pos, setPos] = useState(null)
  const [estado, setEstado] = useState('buscando')

  useEffect(() => {
    if (!('geolocation' in navigator)) { setEstado('no_disponible'); return }
    const id = navigator.geolocation.watchPosition(
      p => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords
        setPos({ lat, lng, accuracy }); setEstado('ok')
      },
      e => {
        if (e.code === 1) { setPos(null); setEstado('denegado') }
        else setEstado(prev => (prev === 'ok' ? 'ok' : 'no_disponible')) // timeout/indisponible: conserva la última posición
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  if (simulada) return { pos: simulada, estado: 'ok' }
  return { pos: estado === 'denegado' ? null : pos, estado }
}
