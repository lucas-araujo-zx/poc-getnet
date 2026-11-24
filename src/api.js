const TOKEN_KEY = 'getnet.lab.token'

export function readToken() {
  return sessionStorage.getItem(TOKEN_KEY) ?? ''
}

export function writeToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', token = '', body } = {}) {
  const headers = { 'x-getnet-path': path }
  if (token) {
    headers['x-getnet-token'] = token
  }
  if (body) {
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error('A API não respondeu JSON. Publique a bancada de novo.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Não foi possível concluir o pedido.')
  }
  return payload
}

export function login(token) {
  return request('/api/login', { method: 'POST', body: { token } })
}

export function listAgents(token) {
  return request('/api/agents', { token })
}

export function createAgent(token, id) {
  return request('/api/agents', { method: 'POST', token, body: { id } })
}

export function deleteAgent(token, id) {
  return request(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}

export function listCases(token, id) {
  return request(`/api/agents/${encodeURIComponent(id)}/cases`, { token })
}

export function createCase(token, id, values) {
  return request(`/api/agents/${encodeURIComponent(id)}/cases`, {
    method: 'POST',
    token,
    body: { values },
  })
}

export function updateCase(token, id, index, values) {
  return request(`/api/agents/${encodeURIComponent(id)}/cases/${index}`, {
    method: 'PUT',
    token,
    body: { values },
  })
}

export function deleteCase(token, id, index) {
  return request(`/api/agents/${encodeURIComponent(id)}/cases/${index}`, {
    method: 'DELETE',
    token,
  })
}

export function signedUrl(token, agentId, caseIndex) {
  const query = new URLSearchParams({
    agent_id: agentId,
    case_index: String(caseIndex),
  })
  return request(`/api/signed-url?${query}`, { token })
}

export function conversationResult(token, conversationId, agentId) {
  const query = new URLSearchParams({
    conversation_id: conversationId,
    agent_id: agentId,
  })
  return request(`/api/conversation?${query}`, { token })
}
