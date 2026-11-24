import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { tokensMatch } from './agents.js'
import { dispatchApi } from './plugin.js'

const AGENT = 'agent_demo1234567890'
const OTHER = 'agent_outro123456789'

function lab(dir, apiKey = 'chave') {
  return {
    loginToken: 'token-da-bancada',
    apiKey,
    dataDir: dir,
  }
}

function call(dir, method, pathname, token, search = '', body, apiKey) {
  return dispatchApi(
    {
      method,
      pathname,
      searchParams: new URLSearchParams(search),
      token,
      body,
    },
    lab(dir, apiKey),
  )
}

function withFetch(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => {
    globalThis.fetch = original
  }
}

test('tokensMatch aceita o mesmo segredo e rejeita outro', () => {
  assert.equal(tokensMatch('token-da-bancada', 'token-da-bancada'), true)
  assert.equal(tokensMatch('outro', 'token-da-bancada'), false)
  assert.equal(tokensMatch('token-da-bancada', ''), false)
})

test('login, cadastro, casos e resultado da conversa', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'getnet-api-'))
  writeFileSync(join(dir, 'agents.json'), '{"agents":[]}\n')
  const restore = withFetch(async (url) => {
    const href = String(url)
    if (href.includes('/agents/')) {
      return new Response(JSON.stringify({
        name: 'Getnet Voz',
        conversation_config: {
          agent: {
            prompt: { prompt: 'Olá {{nome}}.' },
            dynamic_variables: { dynamic_variable_placeholders: { nome: 'Ana', documento: '' } },
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (href.includes('get-signed-url')) {
      return new Response(JSON.stringify({ signed_url: 'wss://exemplo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (href.includes('/conversations/conv_4801m64ptqcke33aq74hz968qm1m')) {
      return new Response(JSON.stringify({
        conversation_id: 'conv_4801m64ptqcke33aq74hz968qm1m',
        agent_id: AGENT,
        status: 'done',
        analysis: { transcript_summary: 'Atendimento concluído.', call_successful: 'success' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      conversation_id: 'conv_9991m64ptqcke33aq74hz968qm1m',
      agent_id: OTHER,
      status: 'done',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  })

  try {
    const denied = await call(dir, 'POST', '/api/login', '', '', { token: 'errado' })
    assert.equal(denied.status, 401)
    const ok = await call(dir, 'POST', '/api/login', '', '', { token: 'token-da-bancada' })
    assert.equal(ok.status, 200)

    const locked = await call(dir, 'GET', '/api/agents', '')
    assert.equal(locked.status, 401)

    const created = await call(dir, 'POST', '/api/agents', 'token-da-bancada', '', { id: AGENT })
    assert.equal(created.status, 201)
    assert.equal(created.payload.agent.name, 'Getnet Voz')
    assert.deepEqual(created.payload.agent.variables, ['nome', 'documento'])
    assert.equal(existsSync(join(dir, `${AGENT}.csv`)), true)

    const duplicate = await call(dir, 'POST', '/api/agents', 'token-da-bancada', '', { id: AGENT })
    assert.equal(duplicate.status, 409)

    const added = await call(dir, 'POST', `/api/agents/${AGENT}/cases`, 'token-da-bancada', '', {
      values: { nome: 'Lia', documento: '42' },
    })
    assert.equal(added.status, 200)
    assert.equal(added.payload.cases[0].nome, 'Lia')

    const edited = await call(dir, 'PUT', `/api/agents/${AGENT}/cases/0`, 'token-da-bancada', '', {
      values: { nome: 'Lia Souza', documento: '42' },
    })
    assert.equal(edited.payload.cases[0].nome, 'Lia Souza')

    const session = await call(dir, 'GET', '/api/signed-url', 'token-da-bancada', `agent_id=${AGENT}&case_index=0`)
    assert.equal(session.status, 200)
    assert.equal(session.payload.signedUrl, 'wss://exemplo')
    assert.equal(session.payload.dynamicVariables.nome, 'Lia Souza')

    const result = await call(
      dir,
      'GET',
      '/api/conversation',
      'token-da-bancada',
      `conversation_id=conv_4801m64ptqcke33aq74hz968qm1m&agent_id=${AGENT}`,
    )
    assert.equal(result.status, 200)
    assert.equal(result.payload.summary, 'Atendimento concluído.')

    const foreign = await call(
      dir,
      'GET',
      '/api/conversation',
      'token-da-bancada',
      `conversation_id=conv_9991m64ptqcke33aq74hz968qm1m&agent_id=${AGENT}`,
    )
    assert.equal(foreign.status, 404)

    const removed = await call(dir, 'DELETE', `/api/agents/${AGENT}/cases/0`, 'token-da-bancada')
    assert.equal(removed.payload.cases.length, 0)
    const gone = await call(dir, 'DELETE', `/api/agents/${AGENT}`, 'token-da-bancada')
    assert.equal(gone.status, 200)
    assert.equal(existsSync(join(dir, `${AGENT}.csv`)), false)
  } finally {
    restore()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sem a chave da ElevenLabs o agente não é gravado', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'getnet-key-'))
  writeFileSync(join(dir, 'agents.json'), '{"agents":[]}\n')
  try {
    const missing = await call(dir, 'POST', '/api/agents', 'token-da-bancada', '', { id: AGENT }, '')
    assert.equal(missing.status, 503)
    assert.equal(existsSync(join(dir, `${AGENT}.csv`)), false)
    const list = await call(dir, 'GET', '/api/agents', 'token-da-bancada', '', undefined, '')
    assert.deepEqual(list.payload.agents, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
