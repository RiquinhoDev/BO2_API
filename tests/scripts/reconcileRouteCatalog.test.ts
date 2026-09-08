import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('chooses the most specific route when declaration suffixes overlap', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-catalog-specificity-'))
  const security = path.join(root, 'src', 'security')
  const routes = path.join(root, 'src', 'routes')
  fs.mkdirSync(security, { recursive: true })
  fs.mkdirSync(routes, { recursive: true })
  fs.writeFileSync(path.join(routes, 'example.routes.ts'), [
    'const router = { get: (..._args: unknown[]) => undefined }',
    '',
    '',
    '',
    "router.get('/data', () => undefined)",
    "router.get('/earnings/data', () => undefined)",
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(routes, 'engagement.routes.ts'), [
    'const router = { get: (..._args: unknown[]) => undefined }',
    "router.get('/stats', () => undefined)",
    '',
    '',
    "router.get('/engagement/stats', () => undefined)",
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(routes, 'curseduca.routes.ts'), [
    'const router = { get: (..._args: unknown[]) => undefined }',
    "router.get('/dashboard', () => undefined)",
    "router.get('/stats', () => undefined)",
    '',
  ].join('\n'))
  const metadata = (routePath: string, file = 'example.routes.ts', line = 2) => ({
    method: 'GET', path: routePath, access: 'authenticated', consumer: 'desconhecido',
    writes: false, destructive: false,
    evidence: `consumer nao identificado; rota em src/routes/${file}:${line}`,
  })
  fs.writeFileSync(path.join(security, 'route-catalog.json'), JSON.stringify([
    metadata('/api/example/data'),
    metadata('/api/example/earnings/data', 'example.routes.ts', 3),
    metadata('/api/engagement/stats', 'engagement.routes.ts', 2),
    metadata('/api/engagement/engagement/stats', 'engagement.routes.ts', 5),
    metadata('/api/curseduca/dashboard', 'curseduca.routes.ts', 2),
  ], null, 2) + '\n')
  fs.writeFileSync(path.join(security, 'route-manifest.json'), '[]\n')

  try {
    execFileSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'reconcile-route-catalog.mjs'), '--write',
    ], { cwd: root, stdio: 'pipe' })
    const catalog = JSON.parse(fs.readFileSync(path.join(security, 'route-catalog.json'), 'utf8'))
    expect(catalog.find((entry: { path: string }) => entry.path.endsWith('/earnings/data')).evidence)
      .toMatch(/example\.routes\.ts:6$/)
    expect(catalog.find((entry: { path: string }) => entry.path === '/api/engagement/stats').evidence)
      .toMatch(/engagement\.routes\.ts:2$/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
