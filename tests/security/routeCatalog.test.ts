import fs from 'node:fs'
import path from 'node:path'

type ManifestRoute = { method: string; path: string }
type CatalogRoute = ManifestRoute & {
  access: string
  consumer: string
  writes: boolean
  destructive: boolean
  evidence: string
  deprecated?: boolean
  deprecatedReason?: string
}

const securityDir = path.join(process.cwd(), 'src', 'security')
const manifest = JSON.parse(
  fs.readFileSync(path.join(securityDir, 'route-manifest.json'), 'utf8'),
) as ManifestRoute[]
const catalog = JSON.parse(
  fs.readFileSync(path.join(securityDir, 'route-catalog.json'), 'utf8'),
) as CatalogRoute[]
const key = ({ method, path: routePath }: ManifestRoute) => `${method} ${routePath}`

test('o catalogo cobre exatamente as 448 rotas do manifest', () => {
  expect(manifest).toHaveLength(448)
  expect(catalog).toHaveLength(448)
  expect(new Set(manifest.map(key)).size).toBe(448)
  expect(new Set(catalog.map(key)).size).toBe(448)
  expect(catalog.map(key).sort()).toEqual(manifest.map(key).sort())
})

test('cada decisao regista apenas factos e nunca politica de papeis', () => {
  const allowedAccess = new Set(['public', 'authenticated', 'signature', 'dead'])
  const allowedConsumers = /^(front|externo|desconhecido|webhook:[a-z0-9-]+)$/

  for (const route of catalog) {
    expect(allowedAccess.has(route.access)).toBe(true)
    expect(route.access).not.toMatch(/^role:/)
    expect(route.consumer).toMatch(allowedConsumers)
    expect(typeof route.writes).toBe('boolean')
    expect(typeof route.destructive).toBe('boolean')
    expect(route.evidence.trim()).not.toBe('')
  }
})

test('a superficie excecional fica curta e explicita', () => {
  const routesWith = (access: string) => catalog.filter((route) => route.access === access).map(key).sort()

  expect(routesWith('public')).toEqual(['GET /api/health', 'POST /api/auth/login'])
  expect(routesWith('signature')).toEqual([
    'POST /api/guru/webhook',
    'POST /api/webhooks/ac/email-opened',
    'POST /api/webhooks/ac/link-clicked',
  ])
  expect(routesWith('dead')).toEqual([])
  expect(routesWith('authenticated')).toHaveLength(443)
  expect(catalog.filter((route) => route.access === 'public').every((route) => route.evidence.startsWith('public:'))).toBe(true)
})
test('a evidencia aponta para a declaracao real da rota', () => {
  for (const route of catalog) {
    const match = route.evidence.match(/rota em (src\/.+):(\d+)$/)
    expect(match).not.toBeNull()

    const sourcePath = path.join(process.cwd(), match![1])
    const sourceLine = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)[Number(match![2]) - 1]
    expect(sourceLine).toContain(`.${route.method.toLowerCase()}(`)
  }
})

test('marca apenas as 18 montagens cron-tags como deprecated', () => {
  const deprecated = catalog.filter((route) => route.deprecated)

  expect(deprecated).toHaveLength(18)
  expect(
    deprecated.every(
      (route) =>
        route.path.startsWith('/api/cron-tags/') || route.path.startsWith('/cron-tags/'),
    ),
  ).toBe(true)
  expect(deprecated.every((route) => Boolean(route.deprecatedReason?.trim()))).toBe(true)
})
