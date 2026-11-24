import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAgentId } from './agents.js'
import { normalizeValues, rowsFromCsv, toCsv } from './csv.js'
import { readText, removeText, writeText } from './files.js'

const here = dirname(fileURLToPath(import.meta.url))
const MAX_CASES = 500

export function defaultDataDir() {
  const project = join(here, '../data')
  const bundled = join(here, 'data')
  if (existsSync(join(project, 'agents.json'))) {
    return project
  }
  if (existsSync(join(bundled, 'agents.json'))) {
    return bundled
  }
  return project
}

export function csvName(id) {
  if (!isAgentId(id)) {
    throw new Error('id')
  }
  return `${id}.csv`
}

export function resolveStore(env = {}) {
  if (env.dataDir) {
    return env.dataDir
  }
  const token = String(env.blobToken || process.env.BLOB_READ_WRITE_TOKEN || '').trim()
  const onVercel = env.vercel === true || process.env.VERCEL === '1'
  if (onVercel || token) {
    return { kind: 'blob', token: token || undefined }
  }
  return defaultDataDir()
}

export async function readRegistry(dir) {
  let raw = ''
  try {
    raw = await readText(dir, 'agents.json')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
  const parsed = JSON.parse(raw)
  const agents = Array.isArray(parsed?.agents) ? parsed.agents : []
  return agents.filter((item) => item && isAgentId(item.id)).map((item) => ({
    id: item.id,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Agente sem nome',
    variables: Array.isArray(item.variables)
      ? item.variables.filter((name) => typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      : [],
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
  }))
}

export async function writeRegistry(dir, agents) {
  const payload = `${JSON.stringify({ agents }, null, 2)}\n`
  await writeText(dir, 'agents.json', payload, 'application/json; charset=utf-8')
}

export async function findAgent(dir, id) {
  if (!isAgentId(id)) {
    return null
  }
  const agents = await readRegistry(dir)
  return agents.find((item) => item.id === id) ?? null
}

export async function readCaseRows(dir, agent) {
  let text = ''
  try {
    text = await readText(dir, csvName(agent.id))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      await writeCases(dir, agent, [])
      return []
    }
    throw error
  }
  return rowsFromCsv(text, agent.variables)
}

export async function writeCases(dir, agent, rows) {
  const cells = rows.map((values) => agent.variables.map((name) => values[name] ?? ''))
  await writeText(dir, csvName(agent.id), toCsv(agent.variables, cells), 'text/csv; charset=utf-8')
}

export async function presentAgent(dir, agent) {
  let caseCount = 0
  try {
    caseCount = (await readCaseRows(dir, agent)).length
  } catch {
    caseCount = 0
  }
  return {
    id: agent.id,
    name: agent.name,
    variables: agent.variables,
    createdAt: agent.createdAt,
    caseCount,
  }
}

export async function listAgents(dir) {
  const agents = await readRegistry(dir)
  return Promise.all(agents.map((agent) => presentAgent(dir, agent)))
}

export async function saveNewAgent(dir, record) {
  const agents = await readRegistry(dir)
  if (agents.some((item) => item.id === record.id)) {
    return { error: 'exists' }
  }
  await writeCases(dir, record, [])
  try {
    await writeRegistry(dir, [...agents, record])
  } catch (error) {
    await removeText(dir, csvName(record.id))
    throw error
  }
  return { agent: await presentAgent(dir, record) }
}

export async function deleteAgent(dir, id) {
  const agents = await readRegistry(dir)
  if (!agents.some((item) => item.id === id)) {
    return false
  }
  await writeRegistry(dir, agents.filter((item) => item.id !== id))
  await removeText(dir, csvName(id))
  return true
}

async function mutate(dir, id, change) {
  const agent = await findAgent(dir, id)
  if (!agent) {
    return { status: 404, error: 'Agente não encontrado.' }
  }
  const cases = await readCaseRows(dir, agent)
  const next = change(agent, cases)
  if (next.error) {
    return next
  }
  await writeCases(dir, agent, next.cases)
  return { status: 200, agent: await presentAgent(dir, agent), cases: next.cases }
}

export function addCase(dir, id, input) {
  return mutate(dir, id, (agent, cases) => {
    if (cases.length >= MAX_CASES) {
      return { status: 400, error: 'Este agente já tem o máximo de casos.' }
    }
    const normalized = normalizeValues(agent.variables, input ?? {})
    if (normalized.error) {
      return { status: 400, error: normalized.error }
    }
    return { cases: [...cases, normalized.values] }
  })
}

export function replaceCase(dir, id, index, input) {
  return mutate(dir, id, (agent, cases) => {
    if (!Number.isInteger(index) || index < 0 || index >= cases.length) {
      return { status: 404, error: 'Caso não encontrado.' }
    }
    const normalized = normalizeValues(agent.variables, input)
    if (normalized.error) {
      return { status: 400, error: normalized.error }
    }
    const next = cases.slice()
    next[index] = normalized.values
    return { cases: next }
  })
}

export function removeCase(dir, id, index) {
  return mutate(dir, id, (_agent, cases) => {
    if (!Number.isInteger(index) || index < 0 || index >= cases.length) {
      return { status: 404, error: 'Caso não encontrado.' }
    }
    return { cases: cases.filter((_, current) => current !== index) }
  })
}

export async function caseAt(dir, id, index) {
  const agent = await findAgent(dir, id)
  if (!agent) {
    return { status: 404, error: 'Agente não encontrado.' }
  }
  const cases = await readCaseRows(dir, agent)
  if (!Number.isInteger(index) || index < 0 || index >= cases.length) {
    return { status: 404, error: 'Caso não encontrado.' }
  }
  return { status: 200, agent, values: cases[index] }
}
