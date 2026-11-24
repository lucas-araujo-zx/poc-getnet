import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAgentId } from './agents.js'
import { normalizeValues, rowsFromCsv, toCsv } from './csv.js'

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

function registryPath(dir) {
  return join(dir, 'agents.json')
}

export function csvFile(dir, id) {
  if (!isAgentId(id)) {
    throw new Error('id')
  }
  return join(dir, `${id}.csv`)
}

export function readRegistry(dir) {
  const parsed = JSON.parse(readFileSync(registryPath(dir), 'utf8'))
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

export function writeRegistry(dir, agents) {
  mkdirSync(dir, { recursive: true })
  const payload = `${JSON.stringify({ agents }, null, 2)}\n`
  const temp = join(dir, `.agents.${process.pid}.json`)
  writeFileSync(temp, payload)
  renameSync(temp, registryPath(dir))
}

export function findAgent(dir, id) {
  if (!isAgentId(id)) {
    return null
  }
  return readRegistry(dir).find((item) => item.id === id) ?? null
}

export function readCaseRows(dir, agent) {
  const file = csvFile(dir, agent.id)
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      writeCases(dir, agent, [])
      return []
    }
    throw error
  }
  return rowsFromCsv(text, agent.variables)
}

export function writeCases(dir, agent, rows) {
  const cells = rows.map((values) => agent.variables.map((name) => values[name] ?? ''))
  writeFileSync(csvFile(dir, agent.id), toCsv(agent.variables, cells))
}

export function presentAgent(dir, agent) {
  let caseCount = 0
  try {
    caseCount = readCaseRows(dir, agent).length
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

export function listAgents(dir) {
  return readRegistry(dir).map((agent) => presentAgent(dir, agent))
}

export function saveNewAgent(dir, record) {
  const agents = readRegistry(dir)
  if (agents.some((item) => item.id === record.id)) {
    return { error: 'exists' }
  }
  writeCases(dir, record, [])
  try {
    writeRegistry(dir, [...agents, record])
  } catch (error) {
    try {
      unlinkSync(csvFile(dir, record.id))
    } catch {
      // O CSV órfão fica para a próxima tentativa limpar.
    }
    throw error
  }
  return { agent: presentAgent(dir, record) }
}

export function deleteAgent(dir, id) {
  const agents = readRegistry(dir)
  if (!agents.some((item) => item.id === id)) {
    return false
  }
  writeRegistry(dir, agents.filter((item) => item.id !== id))
  try {
    unlinkSync(csvFile(dir, id))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
  return true
}

function mutate(dir, id, change) {
  const agent = findAgent(dir, id)
  if (!agent) {
    return { status: 404, error: 'Agente não encontrado.' }
  }
  const cases = readCaseRows(dir, agent)
  const next = change(agent, cases)
  if (next.error) {
    return next
  }
  writeCases(dir, agent, next.cases)
  return { status: 200, agent: presentAgent(dir, agent), cases: next.cases }
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

export function caseAt(dir, id, index) {
  const agent = findAgent(dir, id)
  if (!agent) {
    return { status: 404, error: 'Agente não encontrado.' }
  }
  const cases = readCaseRows(dir, agent)
  if (!Number.isInteger(index) || index < 0 || index >= cases.length) {
    return { status: 404, error: 'Caso não encontrado.' }
  }
  return { status: 200, agent, values: cases[index] }
}
