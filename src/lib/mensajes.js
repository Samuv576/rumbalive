// Traducción de los códigos del servidor a mensajes para la persona. Sin lenguaje de castigo.
const MOTIVOS = {
  fuera_de_geofence: 'Acércate más al local para continuar.',
  dwell_time_no_cumplido: 'Espera unos minutos desde tu check-in para reportar.',
  demasiado_pronto: 'Ya reportaste eso hace poco. Inténtalo en un par de minutos.',
  valor_invalido: 'Esa opción no es válida. Elige una de los botones.',
  local_no_existe: 'Ese local ya no está disponible.',
  no_autenticado: 'Inicia sesión para continuar.',
  coordenadas_invalidas: 'No pudimos leer tu ubicación. Inténtalo de nuevo.',
  error_red: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  error: 'Algo salió mal. Inténtalo de nuevo.'
}
export const textoMotivo = m => MOTIVOS[m] || MOTIVOS.error

// Errores de Supabase Auth (vienen en inglés) → español.
export function textoErrorAuth(e) {
  const m = String(e?.message || e || '').toLowerCase()
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene una cuenta. Inicia sesión.'
  if (m.includes('at least') && m.includes('character')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento.'
  if (m.includes('valid email') || m.includes('invalid email') || m.includes('email address') && m.includes('invalid')) return 'Escribe un correo válido.'
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to')) return MOTIVOS.error_red
  return 'No pudimos completar la acción. Inténtalo de nuevo.'
}

export function textoUbicacion(estado) {
  if (estado === 'denegado') return 'Permiso de ubicación denegado. Actívalo en el navegador para hacer check-in y reportar.'
  if (estado === 'no_disponible') return 'No pudimos obtener tu ubicación. Sal a cielo abierto e inténtalo de nuevo.'
  return null
}
