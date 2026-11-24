export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const source = String(text ?? '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ';') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

function escapeCell(value) {
  const text = String(value ?? '')
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function isHeader(row, variables) {
  return row.length === variables.length && variables.every((name, index) => row[index].trim() === name)
}

export function rowsFromCsv(text, variables) {
  if (!variables.length) {
    return String(text ?? '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim() === '-')
      .map(() => ({}))
  }
  const table = parseCsv(text)
  if (!table.length) {
    return []
  }
  const [first, ...rest] = table
  const data = isHeader(first, variables) ? rest : table
  return data.map((columns) => {
    const values = {}
    variables.forEach((name, index) => {
      values[name] = (columns[index] ?? '').trim()
    })
    return values
  })
}

export function toCsv(variables, rows) {
  if (!variables.length) {
    return `\uFEFF${rows.map(() => '-').join('\n')}${rows.length ? '\n' : ''}`
  }
  const lines = [variables, ...rows].map((row) => row.map(escapeCell).join(';'))
  return `\uFEFF${lines.join('\n')}\n`
}

export function normalizeValues(variables, input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : null
  if (!source) {
    return { error: 'Informe os valores do caso.' }
  }
  const values = {}
  for (const name of variables) {
    const raw = source[name]
    const text = raw == null ? '' : String(raw).replace(/\r\n/g, '\n').trim()
    if (text.length > 2000) {
      return { error: `O campo ${name} passou de 2000 caracteres.` }
    }
    values[name] = text
  }
  return { values }
}
