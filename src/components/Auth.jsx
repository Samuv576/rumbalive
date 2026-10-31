import { useState } from 'react'
import { backend } from '../lib/backend.js'
import { textoErrorAuth } from '../lib/mensajes.js'

export default function Auth({ onCerrar }) {
  const [modo, setModo] = useState('entrar') // 'entrar' | 'registro'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [cargando, setCargando] = useState(false)

  const enviar = async e => {
    e.preventDefault()
    setError(null); setInfo(null); setCargando(true)
    try {
      if (modo === 'registro') {
        const r = await backend.signUp(email, password)
        if (r.necesitaConfirmar) { setInfo('Te enviamos un correo para confirmar tu cuenta. Después inicia sesión.'); setModo('entrar') }
        else onCerrar()
      } else {
        await backend.signIn(email, password)
        onCerrar()
      }
    } catch (err) {
      setError(textoErrorAuth(err))
    } finally { setCargando(false) }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Acceso">
      <form className="modal-card" onSubmit={enviar}>
        <div className="row"><b>{modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}</b>
          <button type="button" className="lnk" onClick={onCerrar} aria-label="Cerrar">✕</button></div>
        <label>Correo
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>Contraseña
          <input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <div className="bad" role="alert">{error}</div>}
        {info && <div className="ok" role="status">{info}</div>}
        <button type="submit" disabled={cargando}>{cargando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="lnk" onClick={() => { setModo(modo === 'entrar' ? 'registro' : 'entrar'); setError(null) }}>
          {modo === 'entrar' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </form>
    </div>
  )
}
