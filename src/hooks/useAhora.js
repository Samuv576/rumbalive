import { useEffect, useState } from 'react'

// Reloj que se actualiza cada `ms` mientras `activo` sea true (para las cuentas regresivas).
export function useAhora(activo = true, ms = 1000) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    if (!activo) return
    setAhora(Date.now())
    const id = setInterval(() => setAhora(Date.now()), ms)
    return () => clearInterval(id)
  }, [activo, ms])
  return ahora
}
