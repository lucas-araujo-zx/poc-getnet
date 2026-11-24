import { timingSafeEqual } from 'node:crypto'

const AGENT_ID = /^[a-zA-Z0-9_-]{8,128}$/

export function isAgentId(value) {
  return AGENT_ID.test(String(value ?? '').trim())
}

export function extractAgentId(value) {
  const text = String(value ?? '').trim()
  if (isAgentId(text)) {
    return text
  }
  const found = text.match(/agent_[a-zA-Z0-9_-]{8,120}/)
  if (found && isAgentId(found[0])) {
    return found[0]
  }
  return ''
}

export function tokensMatch(given, expected) {
  const left = Buffer.from(String(given ?? ''))
  const right = Buffer.from(String(expected ?? ''))
  if (!right.length || left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

export function agentDisplayName(agent) {
  const value = agent?.name
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 160)
  }
  return ''
}
