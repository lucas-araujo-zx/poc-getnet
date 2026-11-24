import { useState } from 'react'
import { Mark } from './Mark.jsx'

function formatWhen(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function Agents({ agents, onOpen, onCreate, onDelete, onSignOut }) {
  const [agentId, setAgentId] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [confirmId, setConfirmId] = useState('')

  async function submit(event) {
    event.preventDefault()
    const next = agentId.trim()
    if (!next) {
      setError('Cole o ID do agente.')
      return
    }
    setPending(true)
    setError('')
    try {
      await onCreate(next)
      setAgentId('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar o agente.')
    } finally {
      setPending(false)
    }
  }

  async function remove(id) {
    setError('')
    try {
      await onDelete(id)
      setConfirmId('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o agente.')
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Mark />
        <p className="topbar-label">Bancada de agentes</p>
        <button type="button" className="ghost" onClick={onSignOut}>Sair</button>
      </header>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="kicker">Agentes cadastrados</p>
            <h1>Escolha um agente ou cadastre um ID novo.</h1>
          </div>
        </div>

        <form className="register" onSubmit={submit}>
          <label className="field">
            <span>ID do agente ElevenLabs</span>
            <input
              value={agentId}
              spellCheck={false}
              autoCapitalize="off"
              placeholder="agent_..."
              onChange={(event) => setAgentId(event.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? 'Consultando...' : 'Cadastrar'}
          </button>
        </form>
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {agents.length === 0 ? (
          <p className="empty-block">
            Nenhum agente ainda. Ao cadastrar um ID, a bancada grava o agente e cria um CSV só com as variáveis dinâmicas que a conversa precisa.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>Agentes disponíveis para teste</caption>
              <thead>
                <tr>
                  <th>Agente</th>
                  <th>Variáveis</th>
                  <th>Casos</th>
                  <th>Cadastro</th>
                  <th><span className="sr">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <button type="button" className="row-link" onClick={() => onOpen(agent.id)}>
                        <strong>{agent.name}</strong>
                        <code>{agent.id}</code>
                      </button>
                    </td>
                    <td>{agent.variables.length ? agent.variables.join(', ') : 'Nenhuma'}</td>
                    <td>{agent.caseCount}</td>
                    <td>{formatWhen(agent.createdAt)}</td>
                    <td className="row-actions">
                      {confirmId === agent.id ? (
                        <>
                          <button type="button" className="danger-text" onClick={() => remove(agent.id)}>Confirmar</button>
                          <button type="button" className="ghost" onClick={() => setConfirmId('')}>Cancelar</button>
                        </>
                      ) : (
                        <button type="button" className="ghost" onClick={() => setConfirmId(agent.id)}>Remover</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
