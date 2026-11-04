// Adaptador de Supabase con la misma interfaz que mockBackend.js.
import { supabase } from './supabase.js'

const aUsuario = u => (u ? { id: u.id, email: u.email } : null)

export const supabaseBackend = {
  modo: 'supabase',

  async getUser() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return aUsuario(data.session?.user)
  },

  onAuth(cb) {
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => cb(aUsuario(session?.user)))
    return () => data.subscription.unsubscribe()
  },

  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) throw error
    // Si "Confirm email" sigue activado en Supabase no hay sesión hasta confirmar el correo.
    return { user: aUsuario(data.user), necesitaConfirmar: !data.session }
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
    return { user: aUsuario(data.user) }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async rpc(nombre, args = {}) {
    const { data, error } = await supabase.rpc(nombre, args)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return data
  },

  // Realtime respeta la política RLS reportes_g2g: sin acceso, el servidor no envía eventos ajenos.
  suscribirReportes({ onInsert, onEstado }) {
    const canal = supabase
      .channel(`reportes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reportes' }, p => onInsert(p.new))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') onEstado('conectado')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onEstado('desconectado')
      })
    return () => { supabase.removeChannel(canal) }
  }
}
