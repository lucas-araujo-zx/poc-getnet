import { useEffect, useState } from 'react'
import {
  clearToken,
  createAgent,
  createCase,
  deleteAgent,
  deleteCase,
  listAgents,
  listCases,
  login,
  readToken,
  updateCase,
  writeToken,
} from './api.js'
import { Agents } from './Agents.jsx'
import { Cases } from './Cases.jsx'
import { Login } from './Login.jsx'
import { go, parseRoute } from './route.js'
import { Talk } from './Talk.jsx'

export function App() {
  const [token, setToken] = useState(readToken)
  const [agents, setAgents] = useState(null)
  const [bundle, setBundle] = useState(null)
  const [route, setRoute] = useState(parseRoute)
  const [booting, setBooting] = useState(Boolean(readToken()))
  const [loadingCases, setLoadingCases] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    function sync() {
      setRoute(parseRoute())
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!token) {
      setAgents(null)
      setBundle(null)
      setBooting(false)
      return undefined
    }
    let cancelled = false
    setBooting(true)
    listAgents(token)
      .then((data) => {
        if (!cancelled) {
          setAgents(data.agents ?? [])
        }
      })
      .catch((error) => {
        if (!cancelled) {
          clearToken()
          setToken('')
          setAgents(null)
          setLoginError(error.message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBooting(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token || !route.agentId) {
      setBundle(null)
      setPageError('')
      return undefined
    }
    let cancelled = false
    setLoadingCases(true)
    setBundle(null)
    setPageError('')
    listCases(token, route.agentId)
      .then((data) => {
        if (!cancelled) {
          setBundle(data)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBundle(null)
          setPageError(error.message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCases(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, route.agentId])

  async function handleLogin(next) {
    setLoginLoading(true)
    setLoginError('')
    try {
      await login(next)
      writeToken(next)
      setToken(next)
      go('/')
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setLoginLoading(false)
    }
  }

  function signOut() {
    clearToken()
    setToken('')
    setAgents(null)
    setBundle(null)
    go('/')
  }

  async function refreshAgents() {
    const data = await listAgents(token)
    setAgents(data.agents ?? [])
  }

  async function refreshCases() {
    const data = await listCases(token, route.agentId)
    setBundle(data)
    await refreshAgents()
  }

  if (!token) {
    return (
      <Login
        error={loginError}
        loading={loginLoading}
        onSubmit={handleLogin}
      />
    )
  }

  if (!agents) {
    return (
      <div className="app" aria-busy={booting}>
        <main className="page">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton short" />
        </main>
      </div>
    )
  }

    if (route.agentId) {
      const current = bundle?.agent?.id === route.agentId ? bundle : null
      if (!current) {
        if (pageError && !loadingCases) {
          return (
            <div className="app">
              <main className="page">
                <p className="form-error" role="alert">{pageError}</p>
                <button type="button" className="ghost" onClick={() => go('/')}>Voltar aos agentes</button>
              </main>
            </div>
          )
        }
        return (
          <div className="app">
            <main className="page">
              <div className="skeleton" />
              <div className="skeleton short" />
            </main>
          </div>
        )
      }
    if (route.name === 'talk') {
      const values = bundle.cases[route.caseIndex]
      if (!values) {
        return (
          <div className="app">
            <main className="page">
              <p className="form-error" role="alert">Esse caso não está mais no CSV.</p>
              <button type="button" className="ghost" onClick={() => go(`/agents/${encodeURIComponent(bundle.agent.id)}`)}>
                Voltar aos casos
              </button>
            </main>
          </div>
        )
      }
      return (
        <Talk
          key={`${bundle.agent.id}-${route.caseIndex}`}
          token={token}
          agent={bundle.agent}
          values={values}
          caseIndex={route.caseIndex}
          onBack={() => go(`/agents/${encodeURIComponent(bundle.agent.id)}`)}
          onSignOut={signOut}
        />
      )
    }
    return (
      <Cases
        agent={bundle.agent}
        cases={bundle.cases}
        onBack={() => go('/')}
        onOpen={(index) => go(`/agents/${encodeURIComponent(bundle.agent.id)}/cases/${index}`)}
        onCreate={async (values) => {
          await createCase(token, bundle.agent.id, values)
          await refreshCases()
        }}
        onUpdate={async (index, values) => {
          await updateCase(token, bundle.agent.id, index, values)
          await refreshCases()
        }}
        onDelete={async (index) => {
          await deleteCase(token, bundle.agent.id, index)
          await refreshCases()
        }}
        onSignOut={signOut}
      />
    )
  }

  return (
    <Agents
      agents={agents}
      onOpen={(id) => go(`/agents/${encodeURIComponent(id)}`)}
      onCreate={async (id) => {
        await createAgent(token, id)
        await refreshAgents()
      }}
      onDelete={async (id) => {
        await deleteAgent(token, id)
        await refreshAgents()
      }}
      onSignOut={signOut}
    />
  )
}
