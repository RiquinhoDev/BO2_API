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

test('o catalogo cobre exatamente as 416 rotas do manifest', () => {
  expect(manifest).toHaveLength(416)
  expect(catalog).toHaveLength(416)
  expect(new Set(manifest.map(key)).size).toBe(416)
  expect(new Set(catalog.map(key)).size).toBe(416)
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

  expect(routesWith('public')).toEqual([
    'GET /api/clareza/carteira-search',
    'GET /api/clareza/carteira/analysis',
    'GET /api/clareza/carteira/data',
    'GET /api/clareza/carteira/search',
    'GET /api/clareza/comparador',
    'GET /api/clareza/data',
    'GET /api/clareza/earnings/data',
    'GET /api/clareza/radar',
    'GET /api/clareza/raiox',
    'GET /api/clareza/top10',
    'GET /api/health',
    'POST /api/auth/login',
    'POST /api/clareza/suggestions',
  ])
  expect(routesWith('signature')).toEqual([
    'POST /api/guru/webhook',
    'POST /api/webhooks/ac/email-opened',
    'POST /api/webhooks/ac/link-clicked',
  ])
  expect(routesWith('dead')).toEqual([])
  expect(routesWith('authenticated')).toHaveLength(400)
  expect(catalog.filter((route) => route.access === 'public').every((route) => route.evidence.startsWith('public:'))).toBe(true)
})
/**
 * Reads the route declaration that *starts* on `index`.
 *
 * The line must begin with the call itself — `router.get(`, `app.post(` or a
 * sub-router such as `v2.get(` — which rules out an incidental `.get(` further
 * inside an expression. The call is then accumulated until its parentheses
 * balance, so a multi-line declaration is read whole and the scan can never
 * fall through into the next one. Returning the method plus the first string
 * literal of that same call makes the evidence prove route identity, not merely
 * that some declaration of the right verb happens to sit on the line.
 */
function declarationAt(
  lines: string[],
  index: number,
): { method: string; mount: string } | null {
  const head = lines[index] ?? ''
  const opener = head.match(/^\s*[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\(/)
  if (!opener) return null

  let depth = 0
  let text = ''

  for (let cursor = index; cursor < lines.length; cursor++) {
    for (const character of lines[cursor]) {
      text += character
      if (character === '(') depth += 1
      else if (character === ')') {
        depth -= 1
        if (depth === 0) {
          const literal = text.match(/\(\s*(['"])(.*?)\1/)
          return literal ? { method: opener[1], mount: literal[2] } : null
        }
      }
    }
    text += '\n'
  }

  return null
}

const USERS_ROUTES_FILE = 'src/routes/users.routes.ts'
const USERS_ROUTES_MOUNT = '/api/users'

test('a evidencia aponta para a declaracao real da rota', () => {
  const unresolved: string[] = []
  const mismatched: string[] = []

  for (const route of catalog) {
    const match = route.evidence.match(/rota em (src\/.+):(\d+)$/)
    expect(match).not.toBeNull()

    const sourcePath = path.join(process.cwd(), match![1])
    const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)
    const declaration = declarationAt(lines, Number(match![2]) - 1)

    if (!declaration) {
      unresolved.push(`${route.method} ${route.path} -> ${match![1]}:${match![2]}`)
      continue
    }

    const sameMethod = declaration.method === route.method.toLowerCase()

    // `users.routes.ts` has a single known mount, so its entries are held to
    // exact equality: a suffix check lets `/student/:id/stats` be satisfied by
    // the declaration of `/:id/stats`, which is how several wrong pointers
    // stayed invisible. Other files still use the suffix rule because nested
    // routers (CursEduca mounts a sub-router under `/v2`) would need the whole
    // mount chain rebuilt before exact matching is meaningful there.
    let sameRoute: boolean

    if (match![1] === USERS_ROUTES_FILE) {
      // Never slice a prefix that is not there: an entry pointing at this file
      // while living under another mount is a defect, not something to coerce.
      if (!route.path.startsWith(USERS_ROUTES_MOUNT)) {
        mismatched.push(
          `${route.method} ${route.path} -> ${match![1]}:${match![2]} is not mounted under ` +
          USERS_ROUTES_MOUNT,
        )
        continue
      }
      sameRoute = declaration.mount === (route.path.slice(USERS_ROUTES_MOUNT.length) || '/')
    } else {
      sameRoute = route.path.endsWith(declaration.mount === '/' ? '' : declaration.mount)
    }

    if (!sameMethod || !sameRoute) {
      mismatched.push(
        `${route.method} ${route.path} -> ${match![1]}:${match![2]} declares ` +
        `${declaration.method.toUpperCase()} ${declaration.mount}`,
      )
    }
  }

  // Every entry must resolve to exactly one declaration; ambiguity is a defect
  // in the evidence, not something the assertion may tolerate.
  expect(unresolved).toEqual([])
  expect(mismatched).toEqual([])
})

/**
 * Deprecated because no consumer could be found, not because a successor
 * exists. They must never carry a Sunset or successor links until real traffic
 * has been observed.
 */
const UNCONSUMED_DEPRECATIONS = [
  '/api/users/unified',
  '/api/users/users/listUsers',
  '/api/users/infinite',
  '/api/users/infiniteStats',
] as const

test('marca apenas cron-tags e as listagens sem consumidor como deprecated', () => {
  const deprecated = catalog.filter((route) => route.deprecated)
  const namedDeprecations: readonly string[] = [...UNCONSUMED_DEPRECATIONS]

  expect(deprecated).toHaveLength(11)
  expect(
    deprecated.filter((route) => !namedDeprecations.includes(route.path)).every(
      (route) =>
        route.path.startsWith('/api/cron-tags/') || route.path.startsWith('/cron-tags/'),
    ),
  ).toBe(true)
  expect(deprecated.every((route) => Boolean(route.deprecatedReason?.trim()))).toBe(true)

  for (const routePath of UNCONSUMED_DEPRECATIONS) {
    const route = deprecated.find((candidate) => candidate.path === routePath)
    expect(route).toMatchObject({
      deprecated: true,
      consumer: 'desconhecido',
      deprecatedReason: 'no known repository consumer; observe real traffic before removal',
    })
    expect(route).not.toHaveProperty('sunset')
    expect(route).not.toHaveProperty('successorLinks')
  }

  // listUsers has a proven consumer outside these repositories — the legacy
  // Backoffice calls it from two rendered screens — so it must stay live and
  // is recorded as `externo`, not as a Front consumer and not as unknown.
  const listUsers = catalog.find((route) => route.path === '/api/users/listUsers')
  expect(listUsers).not.toHaveProperty('deprecated')
  expect(listUsers?.consumer).toBe('externo')
  expect(listUsers?.evidence).toContain('Backoffice legacy')
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

test('os buckets de instrumentacao mantem os dois primeiros segmentos literais', () => {
  const literalBucketSegment = /^[a-z0-9._~-]+$/i
  const unsafeBuckets = catalog
    .filter(({ path: routePath }) => routePath
      .split('/')
      .filter(Boolean)
      .slice(0, 2)
      .some((segment) => !literalBucketSegment.test(segment)))
    .map(key)

  expect(unsafeBuckets).toEqual([])
})

test('regista apenas as identidades CursEduca canonicas em runtime', () => {
  const identities = new Set(catalog.map(key))
  expect([...identities].filter((entry) => entry.includes('/api/curseduca/v2/'))).toEqual([])
  expect([...identities].filter((entry) => /^GET \/api\/curseduca\/(?:catalog\/stats|products(?:\/|$)|stats$)/.test(entry)).sort()).toEqual([
    'GET /api/curseduca/catalog/stats',
    'GET /api/curseduca/products',
    'GET /api/curseduca/products/:groupId',
    'GET /api/curseduca/products/:groupId/users',
    'GET /api/curseduca/stats',
  ])
})

test('proibe segmentos de versao ou legacy sem excecoes ocultas', () => {
  const forbiddenSegment = /^(?:v[123]|legacy)$/i
  expect(catalog.filter((route) => route.path.split('/').some((segment) => forbiddenSegment.test(segment))).map(key)).toEqual([])
})
