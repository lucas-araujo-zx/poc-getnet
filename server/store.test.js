import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { dynamicVariableNames } from './variables.js'
import { rowsFromCsv, toCsv } from './csv.js'
import { addCase, readCaseRows, removeCase, replaceCase, saveNewAgent } from './store.js'

const AGENT = 'agent_demo1234567890'

test('variáveis dinâmicas vêm dos placeholders e do prompt, sem as de sistema', () => {
  const names = dynamicVariableNames({
    conversation_config: {
      agent: {
        prompt: { prompt: 'Olá {{nome_cliente}}. Hoje é {{system__time}}. Contrato {{contrato}}.' },
        dynamic_variables: {
          dynamic_variable_placeholders: {
            nome_cliente: 'Ana',
            system__agent_id: 'x',
            produto: 'Get Tap',
          },
        },
      },
    },
    workflow: {
      nodes: {
        start: { prompt: 'Confirme {{documento}} de {{nome_cliente}}.' },
      },
    },
  })
  assert.deepEqual(names, ['nome_cliente', 'produto', 'contrato', 'documento'])
})

test('o csv guarda cabeçalho, aspas e caso sem variáveis', () => {
  const header = ['nome', 'obs']
  const csv = toCsv(header, [['Ana', 'disse "sim"; e seguiu']])
  assert.equal(csv.startsWith('\uFEFF'), true)
  assert.deepEqual(rowsFromCsv(csv, header), [{ nome: 'Ana', obs: 'disse "sim"; e seguiu' }])
  assert.deepEqual(rowsFromCsv(toCsv([], [{}, {}]), []), [{}, {}])
  assert.deepEqual(rowsFromCsv(toCsv([], []), []), [])
})

test('cadastrar um agente cria o json e o csv só com cabeçalho', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'getnet-store-'))
  writeFileSync(join(dir, 'agents.json'), '{"agents":[]}\n')
  try {
    const saved = await saveNewAgent(dir, {
      id: AGENT,
      name: 'Atendimento',
      variables: ['nome', 'documento'],
      createdAt: '2026-11-24T00:00:00.000Z',
    })
    assert.equal(saved.agent.caseCount, 0)
    const csv = readFileSync(join(dir, `${AGENT}.csv`), 'utf8').replace(/^\uFEFF/, '')
    assert.equal(csv, 'nome;documento\n')
    const registry = JSON.parse(readFileSync(join(dir, 'agents.json'), 'utf8'))
    assert.equal(registry.agents[0].id, AGENT)

    const invalid = await addCase(dir, AGENT, { nome: 'x'.repeat(2001), documento: '1' })
    assert.equal(invalid.status, 400)

    const created = await addCase(dir, AGENT, { nome: 'Lia', documento: '123' })
    assert.equal(created.cases.length, 1)
    const edited = await replaceCase(dir, AGENT, 0, { nome: 'Lia Souza', documento: '123' })
    assert.equal(edited.cases[0].nome, 'Lia Souza')
    const removed = await removeCase(dir, AGENT, 0)
    assert.equal(removed.cases.length, 0)
    assert.equal((await readCaseRows(dir, saved.agent)).length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('o blob guarda o json e o csv e lê a versão gravada', async () => {
  const files = new Map()
  const dir = {
    kind: 'blob',
    client: {
      async get(pathname) {
        if (!files.has(pathname)) {
          return null
        }
        return { statusCode: 200, stream: new Response(files.get(pathname)).body }
      },
      async put(pathname, body) {
        files.set(pathname, String(body))
      },
      async del(pathname) {
        files.delete(pathname)
      },
    },
  }
  const saved = await saveNewAgent(dir, {
    id: AGENT,
    name: 'Voz',
    variables: ['nome'],
    createdAt: '2026-11-24T00:00:00.000Z',
  })
  assert.equal(saved.agent.caseCount, 0)
  assert.match(files.get('getnet-lab/agents.json'), /agent_demo1234567890/)
  assert.match(files.get(`getnet-lab/${AGENT}.csv`), /nome/)
  const created = await addCase(dir, AGENT, { nome: 'Lia' })
  assert.equal(created.cases[0].nome, 'Lia')
  const edited = await replaceCase(dir, AGENT, 0, { nome: 'Lia Costa' })
  assert.equal(edited.cases[0].nome, 'Lia Costa')
  assert.match(files.get(`getnet-lab/${AGENT}.csv`), /Lia Costa/)
})
