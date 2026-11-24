const MUSTACHE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

function accept(name, seen, names) {
  const value = String(name ?? '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return
  }
  if (value.toLowerCase().startsWith('system__')) {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)
  names.push(value)
}

function eachNode(node, depth, visit) {
  if (depth > 24 || node == null) {
    return
  }
  if (typeof node === 'string') {
    visit(node)
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      eachNode(item, depth + 1, visit)
    }
    return
  }
  if (typeof node !== 'object') {
    return
  }
  visit(node)
  for (const value of Object.values(node)) {
    eachNode(value, depth + 1, visit)
  }
}

export function dynamicVariableNames(agent) {
  const names = []
  const seen = new Set()
  eachNode(agent, 0, (node) => {
    if (typeof node === 'string') {
      return
    }
    const placeholders = node.dynamic_variable_placeholders
    if (placeholders && typeof placeholders === 'object' && !Array.isArray(placeholders)) {
      for (const key of Object.keys(placeholders)) {
        accept(key, seen, names)
      }
    }
  })
  eachNode(agent, 0, (node) => {
    if (typeof node !== 'string') {
      return
    }
    for (const match of node.matchAll(MUSTACHE)) {
      accept(match[1], seen, names)
    }
  })
  return names
}
