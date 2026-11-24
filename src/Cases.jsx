import { useState } from 'react'
import { Mark } from './Mark.jsx'
import { formatLabel, formatValue } from './route.js'

function blank(variables) {
  return Object.fromEntries(variables.map((name) => [name, '']))
}

export function Cases({ agent, cases, onBack, onOpen, onCreate, onUpdate, onDelete, onSignOut }) {
  const [draft, setDraft] = useState(() => blank(agent.variables))
  const [editing, setEditing] = useState(null)
  const [editValues, setEditValues] = useState(null)
  const [confirmIndex, setConfirmIndex] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const variables = agent.variables

  async function run(action) {
    setPending(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar os casos.')
    } finally {
      setPending(false)
    }
  }

  function changeDraft(name, value) {
    setDraft((current) => ({ ...current, [name]: value }))
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
            <button type="button" className="back" onClick={onBack}>Agentes</button>
            <h1>{agent.name}</h1>
            <p className="lede">
              <code>{agent.id}.csv</code>
              {variables.length
                ? ` · ${variables.length} ${variables.length === 1 ? 'variável' : 'variáveis'}`
                : ' · este agente não pede variáveis dinâmicas'}
            </p>
          </div>
        </div>

        <form
          className="case-form"
          onSubmit={(event) => {
            event.preventDefault()
            run(async () => {
              await onCreate(draft)
              setDraft(blank(variables))
            })
          }}
        >
          <div className="case-fields">
            {variables.map((name) => (
              <label className="field" key={name}>
                <span>{formatLabel(name)}</span>
                <input
                  value={draft[name] ?? ''}
                  onChange={(event) => changeDraft(name, event.target.value)}
                />
              </label>
            ))}
          </div>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? 'Salvando...' : 'Adicionar caso'}
          </button>
        </form>
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {cases.length === 0 ? (
          <p className="empty-block">
            O CSV está só com o cabeçalho. Adicione um caso e clique no valor para abrir a conversa.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data cases">
              <caption>Casos de uso de {agent.name}</caption>
              <thead>
                <tr>
                  {(variables.length ? variables : ['caso']).map((name) => (
                    <th key={name}>{name === 'caso' ? 'Caso' : formatLabel(name)}</th>
                  ))}
                  <th><span className="sr">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((row, index) => {
                  const isEditing = editing === index
                  return (
                    <tr key={`${agent.id}-${index}`}>
                      {variables.length === 0 ? (
                        <td>
                          <button type="button" className="cell-link" onClick={() => onOpen(index)}>
                            Caso {index + 1}
                          </button>
                        </td>
                      ) : (
                        variables.map((name) => (
                          <td key={name}>
                            {isEditing ? (
                              <input
                                aria-label={formatLabel(name)}
                                value={editValues?.[name] ?? ''}
                                onChange={(event) => {
                                  const value = event.target.value
                                  setEditValues((current) => ({ ...current, [name]: value }))
                                }}
                              />
                            ) : (
                              <button type="button" className="cell-link" onClick={() => onOpen(index)}>
                                {formatValue(row[name])}
                              </button>
                            )}
                          </td>
                        ))
                      )}
                      <td className="row-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="primary slim"
                              disabled={pending}
                              onClick={() => run(async () => {
                                await onUpdate(index, editValues)
                                setEditing(null)
                                setEditValues(null)
                              })}
                            >
                              Salvar
                            </button>
                            <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
                          </>
                        ) : confirmIndex === index ? (
                          <>
                            <button
                              type="button"
                              className="danger-text"
                              disabled={pending}
                              onClick={() => run(async () => {
                                await onDelete(index)
                                setConfirmIndex(null)
                              })}
                            >
                              Confirmar
                            </button>
                            <button type="button" className="ghost" onClick={() => setConfirmIndex(null)}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            {variables.length ? (
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  setConfirmIndex(null)
                                  setEditing(index)
                                  setEditValues({ ...row })
                                }}
                              >
                                Editar
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                setEditing(null)
                                setConfirmIndex(index)
                              }}
                            >
                              Remover
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
