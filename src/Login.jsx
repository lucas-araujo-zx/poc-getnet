import { useEffect, useState } from 'react'
import { Mark } from './Mark.jsx'

export function Login({ error, loading, onSubmit }) {
  const [token, setToken] = useState('')
  const [localError, setLocalError] = useState('')
  const [unlockField, setUnlockField] = useState(false)

  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function handleSubmit(event) {
    event.preventDefault()
    const next = token.trim()
    if (!next) {
      setLocalError('Cole o token de acesso.')
      return
    }
    setLocalError('')
    onSubmit(next)
  }

  const message = localError || error

  return (
    <div className="login-page">
      <a className="skip-link" href="#entrar">Ir para o acesso</a>
      <header className="topbar">
        <Mark />
        <p className="topbar-label">Bancada de agentes</p>
      </header>
      <section className="login-stage">
        <div className="login-copy">
          <p className="kicker">Ambiente de teste</p>
          <h1>Converse com os agentes da Getnet.</h1>
          <p>
            O token abre a bancada. Depois você cadastra o ID do agente,
            preenche os casos e inicia a chamada por voz ou por texto.
          </p>
        </div>
        <form id="entrar" className="login-panel" autoComplete="off" onSubmit={handleSubmit}>
          <div className="login-autofill-trap" aria-hidden="true">
            <input type="text" tabIndex={-1} autoComplete="username" />
          </div>
          <label className="field">
            <span>Token de acesso</span>
            <input
              type="password"
              name="getnet_access"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Cole o token recebido"
              value={token}
                readOnly={!unlockField}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                onPointerDown={() => setUnlockField(true)}
                onFocus={() => setUnlockField(true)}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
          {message ? <p className="form-error" role="alert">{message}</p> : null}
        </form>
      </section>
    </div>
  )
}
