import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from '../lib/backend.js'
import { estadoLocal } from '../lib/api.js'
import { textoMotivo } from '../lib/mensajes.js'
import { REFRESCO_S } from '../config.js'

// Estado Give-to-Get de cada local + Realtime + reconciliación.
// estados[localId] = { acceso:false, motivo } | { acceso:true, estado:{ fila?, cover?, aforo? } }
// conexion: 'conectando' | 'conectado' | 'desconectado'
export function useEstados(user, locales) {
  const [estados, setEstados] = useState({})
  const [conexion, setConexion] = useState('conectando')
  const [errorEstado, setErrorEstado] = useState(null)
  const localesRef = useRef(locales)
  localesRef.current = locales
  const userId = user?.id ?? null

  const refrescarLocal = useCallback(async id => {
    if (!userId || !id) return
    try {
      const r = await estadoLocal(id)
      setEstados(prev => ({ ...prev, [id]: r }))
      setErrorEstado(prev => prev?.localId === id ? null : prev)
    } catch (error) {
      setErrorEstado({ localId: id, mensaje: textoMotivo(error?.motivo || error?.message) })
      // Se conserva lo último que se vio; el próximo refresco lo reconcilia.
    }
  }, [userId])

  const refrescarTodo = useCallback(async () => {
    if (!userId) return
    await Promise.all(localesRef.current.map(l => refrescarLocal(l.id)))
  }, [userId, refrescarLocal])

  // Cambio de usuario o de lista de locales: se limpia y se vuelve a consultar.
  useEffect(() => {
    setEstados({})
    refrescarTodo()
  }, [userId, locales, refrescarTodo])

  // Realtime: otro usuario reportó → refrescar solo ese local. Reconexión → refrescar todo (TC-08).
  useEffect(() => {
    if (!userId) { setConexion('conectando'); return }
    setConexion('conectando')
    const cancelar = backend.suscribirReportes({
      onInsert: fila => refrescarLocal(fila.local_id),
      onEstado: s => { setConexion(s); if (s === 'conectado') refrescarTodo() }
    })
    return cancelar
  }, [userId, refrescarLocal, refrescarTodo])

  // Respaldo: refresco periódico (actualiza «hace X min» y vence el acceso de 180 min) y al volver a la app.
  useEffect(() => {
    if (!userId) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') refrescarTodo() }, REFRESCO_S * 1000)
    const alVolver = () => { if (document.visibilityState === 'visible') refrescarTodo() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', refrescarTodo)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', refrescarTodo)
    }
  }, [userId, refrescarTodo])

  return { estados, conexion, errorEstado, refrescarTodo, refrescarLocal }
}
