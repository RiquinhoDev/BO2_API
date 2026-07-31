import fs from 'node:fs'
import path from 'node:path'
import { routeTemplateMatchesPath } from '../../src/observability/routeUsageInstrumentation'

type ManifestRoute = { method: string; path: string }
type CatalogRoute = ManifestRoute & {
  access: string
  consumer: string
  writes: boolean
  destructive: boolean
  evidence: string
  deprecated?: boolean
  deprecatedReason?: string
  successorLinks?: string[]
}

const securityDir = path.join(process.cwd(), 'src', 'security')
const manifest = JSON.parse(
  fs.readFileSync(path.join(securityDir, 'route-manifest.json'), 'utf8'),
) as ManifestRoute[]
const catalog = JSON.parse(
  fs.readFileSync(path.join(securityDir, 'route-catalog.json'), 'utf8'),
) as CatalogRoute[]
const key = ({ method, path: routePath }: ManifestRoute) => `${method} ${routePath}`

type SourceRoute = CatalogRoute & {
  sourceFile: string
  sourceLine: number
}

function sourceRoute(route: CatalogRoute): SourceRoute | undefined {
  const match = route.evidence.match(/rota em (src\/.+):(\d+)$/)
  if (!match) return undefined
  return {
    ...route,
    sourceFile: match[1],
    sourceLine: Number(match[2]),
  }
}

function isLiteralPath(routePath: string): boolean {
  return routePath
    .split('/')
    .every((segment) => !segment.startsWith(':') && !segment.startsWith('*'))
}

test('o catalogo cobre exatamente as 439 rotas do manifest', () => {
  expect(manifest).toHaveLength(439)
  expect(catalog).toHaveLength(439)
  expect(new Set(manifest.map(key)).size).toBe(439)
  expect(new Set(catalog.map(key)).size).toBe(439)
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
  expect(routesWith('authenticated')).toHaveLength(434)
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

test('marca apenas cron-tags e o legacy users v2 como deprecated', () => {
  const deprecated = catalog.filter((route) => route.deprecated)

  expect(deprecated).toHaveLength(19)
  expect(
    deprecated.filter((route) => route.path !== '/api/users/v2').every(
      (route) =>
        route.path.startsWith('/api/cron-tags/') || route.path.startsWith('/cron-tags/'),
    ),
  ).toBe(true)
  expect(deprecated.every((route) => Boolean(route.deprecatedReason?.trim()))).toBe(true)

  const legacy = deprecated.find((route) => route.path === '/api/users/v2')
  expect(legacy).toMatchObject({
    deprecated: true,
    deprecatedReason: 'Polymorphic Users V2 contract; use explicit resources',
    successorLinks: [
      '</api/users/v2/enrollments>; rel="successor-version"',
      '</api/users/v2/analytics>; rel="alternate"',
    ],
  })
  expect(legacy).not.toHaveProperty('sunset')
})

test('nenhuma rota dinamica anterior sombreia uma rota literal posterior', () => {
  const routes = catalog
    .map(sourceRoute)
    .filter((route): route is SourceRoute => Boolean(route))
  const violations: string[] = []

  for (const earlier of routes) {
    if (isLiteralPath(earlier.path)) continue

    for (const later of routes) {
      if (
        later.sourceFile !== earlier.sourceFile
        || later.method !== earlier.method
        || later.sourceLine <= earlier.sourceLine
        || !isLiteralPath(later.path)
      ) {
        continue
      }

      if (routeTemplateMatchesPath(earlier.path, later.path)) {
        violations.push(
          `${earlier.method} ${earlier.path} (${earlier.sourceFile}:${earlier.sourceLine})`
          + ` sombreia ${later.path} (:${later.sourceLine})`,
        )
      }
    }
  }

  expect(violations).toEqual([])
})
