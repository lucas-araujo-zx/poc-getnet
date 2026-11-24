import { build } from 'esbuild'
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, '.vercel/output')
const funcDir = join(output, 'functions/api/login.func')

await rm(output, { recursive: true, force: true })
await mkdir(funcDir, { recursive: true })
await cp(join(root, 'dist'), join(output, 'static'), { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: ['server/vercel-handler.js'],
  outfile: join(funcDir, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'bundle',
})
await writeFile(join(funcDir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
await writeFile(
  join(funcDir, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      maxDuration: 30,
    },
    null,
    2,
  )}\n`,
)

for (const alias of ['api/agents.func', 'api/signed-url.func', 'api/conversation.func', 'api/[...path].func']) {
  const dest = join(output, 'functions', alias)
  await mkdir(dirname(dest), { recursive: true })
  await symlink(relative(dirname(dest), funcDir), dest)
}

await writeFile(
  join(output, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api/login' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  )}\n`,
)
