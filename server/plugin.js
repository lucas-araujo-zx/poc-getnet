import { agentDisplayName, extractAgentId, tokensMatch } from './agents.js'
import { isConversationId, presentConversation } from './conversation.js'
import {
  addCase,
  caseAt,
  defaultDataDir,
  deleteAgent,
  findAgent,
  listAgents,
  presentAgent,
  readCaseRows,
  removeCase,
  replaceCase,
  saveNewAgent,
} from './store.js'
import { dynamicVariableNames } from './variables.js'

function authError(token, env) {
  if (!env.loginToken) {
    return {
      status: 503,
      error: 'O acesso desta bancada ainda não foi configurado.',
    }
  }
  if (!tokensMatch(token, env.loginToken)) {
    return { status: 401, error: 'Token inválido.' }
  }
  return null
}

async function elevenFetch(env, path, init) {
  if (!env.apiKey) {
    return { ok: false, status: 503, error: 'A ElevenLabs ainda não foi configurada.' }
  }
  let response
  try {
    response = await fetch(`https://api.elevenlabs.io${path}`, {
      ...init,
      headers: {
        'xi-api-key': env.apiKey,
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    return { ok: false, status: 502, error: 'Não foi possível falar com a ElevenLabs.' }
  }
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (response.ok) {
    return { ok: true, status: response.status, body }
  }
  if (response.status === 401) {
    return { ok: false, status: 401, error: 'A chave da ElevenLabs foi recusada.' }
  }
  if (response.status === 404) {
    return {
      ok: false,
      status: 404,
      error: 'Não encontrei esse agente na conta da ElevenLabs configurada.',
    }
  }
  return { ok: false, status: 502, error: 'Não foi possível falar com a ElevenLabs.' }
}

function dataDirOf(env) {
  return env.dataDir || defaultDataDir()
}

function storageError() {
  return { status: 503, payload: { error: 'A base de agentes não está disponível.' } }
}

function caseIndex(value) {
  if (!/^\d+$/.test(String(value ?? ''))) {
    return -1
  }
  const index = Number(value)
  return Number.isSafeInteger(index) ? index : -1
}

function agentFromPath(value) {
  try {
    return extractAgentId(decodeURIComponent(value))
  } catch {
    return ''
  }
}

function stored(result) {
  if (result.error) {
    return { status: result.status, payload: { error: result.error } }
  }
  return { status: result.status, payload: { agent: result.agent, cases: result.cases } }
}

async function registerAgent(env, dir, body) {
  const id = extractAgentId(body?.id)
  if (!id) {
    return { status: 400, payload: { error: 'Informe o ID do agente da ElevenLabs.' } }
  }
  let existing
  try {
    existing = findAgent(dir, id)
  } catch {
    return storageError()
  }
  if (existing) {
    return { status: 409, payload: { error: 'Esse agente já está cadastrado.' } }
  }
  const remote = await elevenFetch(env, `/v1/convai/agents/${encodeURIComponent(id)}`)
  if (!remote.ok) {
    return { status: remote.status, payload: { error: remote.error } }
  }
  const record = {
    id,
    name: agentDisplayName(remote.body) || 'Agente sem nome',
    variables: dynamicVariableNames(remote.body),
    createdAt: new Date().toISOString(),
  }
  try {
    const saved = saveNewAgent(dir, record)
    if (saved.error) {
      return { status: 409, payload: { error: 'Esse agente já está cadastrado.' } }
    }
    return { status: 201, payload: { agent: saved.agent } }
  } catch {
    return { status: 503, payload: { error: 'Não foi possível gravar o agente.' } }
  }
}

export async function dispatchApi({ method, pathname, searchParams, token, body }, env) {
  let path = pathname.replace(/\/+$/, '') || '/'
  try {
    path = decodeURI(path)
  } catch {
    return { status: 400, payload: { error: 'Não consegui ler o pedido.' } }
  }
  const dir = dataDirOf(env)

  if (path === '/api/login' && method === 'POST') {
    const error = authError(String(body?.token ?? '').trim(), env)
    if (error) {
      return { status: error.status, payload: { error: error.error } }
    }
    return { status: 200, payload: { ok: true } }
  }

  if (!path.startsWith('/api/')) {
    return null
  }

  const denied = authError(token, env)
  if (denied) {
    return { status: denied.status, payload: { error: denied.error } }
  }

  try {
    if (path === '/api/agents' && method === 'GET') {
      return { status: 200, payload: { agents: listAgents(dir) } }
    }
    if (path === '/api/agents' && method === 'POST') {
      return await registerAgent(env, dir, body)
    }

    const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/)
    if (agentMatch && method === 'DELETE') {
      const id = agentFromPath(agentMatch[1])
      if (!id) {
        return { status: 400, payload: { error: 'Informe o ID do agente da ElevenLabs.' } }
      }
      if (!deleteAgent(dir, id)) {
        return { status: 404, payload: { error: 'Agente não encontrado.' } }
      }
      return { status: 200, payload: { ok: true } }
    }

    const casesMatch = path.match(/^\/api\/agents\/([^/]+)\/cases$/)
    if (casesMatch && method === 'GET') {
      const id = agentFromPath(casesMatch[1])
      const agent = id ? findAgent(dir, id) : null
      if (!agent) {
        return { status: 404, payload: { error: 'Agente não encontrado.' } }
      }
      return {
        status: 200,
        payload: { agent: presentAgent(dir, agent), cases: readCaseRows(dir, agent) },
      }
    }
    if (casesMatch && method === 'POST') {
      const id = agentFromPath(casesMatch[1])
      if (!id) {
        return { status: 404, payload: { error: 'Agente não encontrado.' } }
      }
      return stored(addCase(dir, id, body?.values ?? {}))
    }

    const caseMatch = path.match(/^\/api\/agents\/([^/]+)\/cases\/(\d+)$/)
    if (caseMatch && (method === 'PUT' || method === 'DELETE')) {
      const id = agentFromPath(caseMatch[1])
      const index = caseIndex(caseMatch[2])
      if (!id || index < 0) {
        return { status: 404, payload: { error: 'Caso não encontrado.' } }
      }
      if (method === 'DELETE') {
        return stored(removeCase(dir, id, index))
      }
      return stored(replaceCase(dir, id, index, body?.values))
    }

    if (path === '/api/signed-url' && method === 'GET') {
      const id = extractAgentId(searchParams.get('agent_id'))
      const index = caseIndex(searchParams.get('case_index'))
      if (!id || index < 0) {
        return { status: 400, payload: { error: 'Escolha um caso.' } }
      }
      const selected = caseAt(dir, id, index)
      if (selected.error) {
        return { status: selected.status, payload: { error: selected.error } }
      }
      const remote = await elevenFetch(
        env,
        `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`,
      )
      if (!remote.ok) {
        return { status: remote.status, payload: { error: remote.error } }
      }
      if (typeof remote.body?.signed_url !== 'string' || !remote.body.signed_url) {
        return { status: 502, payload: { error: 'A ElevenLabs não devolveu a sessão.' } }
      }
      return {
        status: 200,
        payload: {
          signedUrl: remote.body.signed_url,
          dynamicVariables: selected.values,
          agent: {
            id: selected.agent.id,
            name: selected.agent.name,
            variables: selected.agent.variables,
          },
          case: { index, values: selected.values },
        },
      }
    }

    if (path === '/api/conversation' && method === 'GET') {
      const conversationId = searchParams.get('conversation_id') ?? ''
      const id = extractAgentId(searchParams.get('agent_id'))
      if (!isConversationId(conversationId)) {
        return { status: 400, payload: { error: 'Informe o ID da conversa.' } }
      }
      if (!id || !findAgent(dir, id)) {
        return { status: 404, payload: { error: 'Agente não encontrado.' } }
      }
      const remote = await elevenFetch(
        env,
        `/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      )
      if (!remote.ok) {
        return { status: remote.status, payload: { error: remote.error } }
      }
      const owner = typeof remote.body?.agent_id === 'string' ? remote.body.agent_id : ''
      if (owner && owner !== id) {
        return { status: 404, payload: { error: 'Conversa não encontrada.' } }
      }
      return { status: 200, payload: presentConversation(remote.body, conversationId) }
    }
  } catch {
    return storageError()
  }

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    return { status: 405, payload: { error: 'Método não permitido.' } }
  }
  return { status: 404, payload: { error: 'Não encontrado.' } }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function headerValue(req, name) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function requestUrl(req) {
  return new URL(req.url ?? '/', 'http://localhost')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 262144) {
        reject(new Error('payload'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('json'))
      }
    })
    req.on('error', reject)
  })
}

export function labApiPlugin(env) {
  const safe = {
    loginToken: env.loginToken?.trim() ?? '',
    apiKey: env.apiKey?.trim() ?? '',
    dataDir: env.dataDir || defaultDataDir(),
  }

  const attach = (middlewares) => {
    middlewares.use((req, res, next) => {
      const url = requestUrl(req)
      if (!url.pathname.startsWith('/api/')) {
        next()
        return
      }
      void (async () => {
        const withBody = ['POST', 'PUT', 'PATCH'].includes(req.method ?? 'GET')
        const payload = withBody ? await readBody(req) : undefined
        return dispatchApi(
          {
            method: req.method ?? 'GET',
            pathname: url.pathname,
            searchParams: url.searchParams,
            token: headerValue(req, 'x-getnet-token'),
            body: payload,
          },
          safe,
        )
      })()
        .then((result) => {
          if (!result) {
            next()
            return
          }
          json(res, result.status, result.payload)
        })
        .catch((error) => {
          if (!res.headersSent) {
            const invalid = error instanceof Error && (error.message === 'json' || error.message === 'payload')
            json(res, invalid ? 400 : 500, {
              error: invalid ? 'Não consegui ler o pedido.' : 'Falha interna.',
            })
          }
        })
    })
  }

  return {
    name: 'getnet-lab-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
