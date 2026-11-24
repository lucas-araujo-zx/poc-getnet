export function formatLabel(key) {
  const cleaned = String(key ?? '').replace(/[_-]+/g, ' ').trim()
  if (!cleaned) {
    return String(key ?? '')
  }
  return cleaned.charAt(0).toLocaleUpperCase('pt-BR') + cleaned.slice(1)
}

export function formatValue(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

export function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  const talk = hash.match(/^\/agents\/([^/]+)\/cases\/(\d+)$/)
  if (talk) {
    return {
      name: 'talk',
      agentId: decodeURIComponent(talk[1]),
      caseIndex: Number(talk[2]),
    }
  }
  const cases = hash.match(/^\/agents\/([^/]+)$/)
  if (cases) {
    return {
      name: 'cases',
      agentId: decodeURIComponent(cases[1]),
      caseIndex: null,
    }
  }
  return { name: 'agents', agentId: '', caseIndex: null }
}

export function go(path) {
  const next = path.startsWith('#') ? path : `#${path}`
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  window.location.hash = next
}
