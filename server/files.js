import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { del, get, put } from '@vercel/blob'

const PREFIX = 'getnet-lab/'

export function isBlobStore(dir) {
  return Boolean(dir && typeof dir === 'object' && dir.kind === 'blob')
}

function pathname(name) {
  return `${PREFIX}${name}`
}

function missing() {
  const error = new Error('missing')
  error.code = 'ENOENT'
  return error
}

function blobOptions(dir, extra) {
  return dir.token ? { ...extra, token: dir.token } : extra
}

export async function readText(dir, name) {
  if (!isBlobStore(dir)) {
    return readFileSync(join(dir, name), 'utf8')
  }
  const api = dir.client ?? { get, put, del }
  const result = await api.get(pathname(name), blobOptions(dir, {
    access: 'private',
    useCache: false,
  }))
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw missing()
  }
  return new Response(result.stream).text()
}

export async function writeText(dir, name, body, contentType) {
  if (!isBlobStore(dir)) {
    mkdirSync(dir, { recursive: true })
    const target = join(dir, name)
    if (name === 'agents.json') {
      const temp = join(dir, `.agents.${process.pid}.json`)
      writeFileSync(temp, body)
      renameSync(temp, target)
      return
    }
    writeFileSync(target, body)
    return
  }
  const api = dir.client ?? { get, put, del }
  await api.put(pathname(name), body, blobOptions(dir, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  }))
}

export async function removeText(dir, name) {
  if (!isBlobStore(dir)) {
    try {
      unlinkSync(join(dir, name))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
    return
  }
  try {
    await (dir.client ?? { del }).del(pathname(name), blobOptions(dir, {}))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/not found|404/i.test(message)) {
      throw error
    }
  }
}
