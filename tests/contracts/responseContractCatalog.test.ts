import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import responseCatalog from '../../src/contracts/response-contract-catalog.json'
import routeCatalog from '../../src/security/route-catalog.json'
import { RESPONSE_FAMILIES } from '../../src/contracts/responseContract'

const routeId = (entry: { method: string; path: string }): string =>
  `${entry.method} ${entry.path}`
const generator = path.join(process.cwd(), 'scripts', 'generate-response-contract-catalog.mjs')
const routeCatalogPath = path.join(process.cwd(), 'src', 'security', 'route-catalog.json')
const workspaceResponseCatalog = path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json')

function responseFixture() {
  return responseCatalog.map((decision) => ({
    ...decision,
    shapeKeys: [...decision.shapeKeys],
  }))
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const fileSha = (filePath: string): string => sha256(fs.readFileSync(filePath, 'utf8'))

function writeSourceOverlay(directory: string, sourcePath: string, contents: string): string {
  const overlayRoot = path.join(directory, 'source-overlay')
  const fixturePath = path.join(
    overlayRoot,
    'backend',
    path.relative(process.cwd(), sourcePath),
  )
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true })
  fs.writeFileSync(fixturePath, contents, 'utf8')
  return overlayRoot
}

const testSourceOverlayEnv = (overlayRoot: string): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY: '1',
  RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: overlayRoot,
})

function runGenerator(
  mode: '--check' | '--write',
  catalogPath: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, [generator, mode], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RESPONSE_CONTRACT_ROUTE_CATALOG: routeCatalogPath,
      RESPONSE_CONTRACT_CATALOG: catalogPath,
      ...extraEnv,
    },
  })
}

describe('response contract catalog', () => {
  test('covers exactly every mounted route identity', () => {
    const routeIds = routeCatalog.map(routeId).sort()
    const contractIds = responseCatalog.map(routeId).sort()

    expect(responseCatalog).toHaveLength(441)
    expect(new Set(contractIds).size).toBe(441)
    expect(contractIds).toEqual(routeIds)
  })

  test('contains only complete, reviewable response decisions', () => {
    const allowedFamilies = new Set<string>(RESPONSE_FAMILIES)

    for (const decision of responseCatalog) {
      expect(allowedFamilies.has(decision.family)).toBe(true)
      expect(decision.shapeKeys).toEqual([...decision.shapeKeys].sort())
      expect(new Set(decision.shapeKeys).size).toBe(decision.shapeKeys.length)
      expect(decision.evidence).toMatch(/\.ts:\d+$/)
      expect(
        decision.frontConsumer === null
          || /^src\/.+\.(?:ts|tsx)$/.test(decision.frontConsumer),
      ).toBe(true)
    }
  })

  test('allows only terminal families and has the finite reviewed Clareza public documents', () => {
    expect(RESPONSE_FAMILIES).toEqual([
      'success-data',
      'public-document',
      'redirect',
      'stream-or-file',
      'no-content',
    ])

    const publicDocuments = responseCatalog
      .filter((entry) => entry.family === 'public-document')
      .map(routeId)
      .sort()

    expect(publicDocuments).toEqual([
      'GET /api/clareza/carteira-search',
      'GET /api/clareza/carteira/data',
      'GET /api/clareza/comparador',
      'GET /api/clareza/data',
      'GET /api/clareza/earnings/data',
      'GET /api/clareza/raiox',
      'GET /api/clareza/raiox-diagnose',
      'GET /api/clareza/raiox-search',
      'GET /api/clareza/raiox/:ticker',
      'GET /api/clareza/reit-valuation/:ticker',
      'GET /api/clareza/reit/:ticker',
      'GET /api/clareza/stock/:ticker',
      'GET /api/clareza/top10',
    ])
  })

  test('is deterministically ordered by method and path', () => {
    const ids = responseCatalog.map(routeId)

    expect(ids).toEqual([...ids].sort())
  })

  test('check mode never writes the reviewed catalog', () => {
    const before = fs.readFileSync(
      path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json'),
      'utf8',
    )
    const result = spawnSync(process.execPath, [generator, '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    const after = fs.readFileSync(
      path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json'),
      'utf8',
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('219 Front calls; 194 consumers')
    expect(after).toBe(before)
  })

  test.each([
    ['missing', responseFixture().slice(1)],
    ['orphaned', [...responseFixture(), {
      method: 'GET',
      path: '/api/__orphaned',
      family: 'raw-json',
      shapeKeys: [],
      evidence: 'src/routes/__orphaned.ts:1',
      frontConsumer: null,
    }]],
    ['duplicate', [...responseFixture(), responseFixture()[0]]],
    ['unclassified', responseFixture().map((decision, index) =>
      index === 0 ? { ...decision, family: 'UNCLASSIFIED' } : decision)],
  ])('write mode fails closed for a %s decision set', (_label, fixture) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-'))
    const catalogPath = path.join(directory, 'catalog.json')
    const before = `${JSON.stringify(fixture, null, 2)}\n`

    try {
      fs.writeFileSync(catalogPath, before, 'utf8')
      const result = runGenerator('--write', catalogPath)

      expect(result.status).not.toBe(0)
      expect(fs.readFileSync(catalogPath, 'utf8')).toBe(before)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  test('write mode retains reviewed decisions by route identity', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-'))
    const catalogPath = path.join(directory, 'catalog.json')
    const fixture = responseFixture().reverse()

    try {
      fs.writeFileSync(catalogPath, JSON.stringify(fixture), 'utf8')
      const result = runGenerator('--write', catalogPath)
      const retained: unknown = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

      expect(result.status).toBe(0)
      expect(retained).toEqual(responseCatalog)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
  test('resolves producer contracts instead of defaulting expressions to raw-json', () => {
    expect(responseCatalog.find((entry) => routeId(entry) === 'GET /api/users/v2/analytics')).toMatchObject({
      family: 'success-data',
      shapeKeys: ['data', 'success'],
    })
    expect(responseCatalog.find((entry) => routeId(entry) === 'GET /api/users/v2/enrollments')).toMatchObject({
      family: 'success-data',
      shapeKeys: ['data', 'filters', 'pagination', 'success'],
    })
    expect(responseCatalog.find((entry) => routeId(entry) === 'POST /api/hotmart/syncProgressOnly')).toMatchObject({
      family: 'success-data',
      shapeKeys: ['message', 'stats'],
    })
  })

  test('records complete unions for spread and mixed response shapes', () => {
    expect(responseCatalog.find((entry) => routeId(entry) === 'GET /api/classes/:classId/details')?.shapeKeys).toEqual([
      '__v', '_id', 'classId', 'createdAt', 'curseducaId', 'curseducaUuid',
      'description', 'estado', 'isActive', 'lastSyncAt', 'name', 'productId',
      'recentHistory', 'source', 'stats', 'studentCount', 'students', 'success',
      'timestamp', 'updatedAt',
    ])
    expect(responseCatalog.find((entry) => routeId(entry) === 'GET /api/classes/users/search')?.shapeKeys).toEqual([
      '__v', '_id', 'achievementStats', 'achievements', 'classId', 'className',
      'combined', 'communicationByCourse', 'createdAt', 'curseduca', 'discord',
      'email', 'engagement', 'guru', 'hotmart', 'inactivation', 'message', 'metadata',
      'multiple', 'name', 'students', 'success', 'timestamp', 'total', 'updatedAt',
    ])
    expect(responseCatalog.find((entry) => routeId(entry) === 'GET /api/users/search')?.shapeKeys).toEqual([
      '_id', 'acTagsByProduct', 'acceptedTerms', 'accessCount', 'classId', 'className',
      'combined', 'createdAt', 'curseducaUserId', 'deletedAt', 'deletedBy',
      'discordIds', 'email', 'engagement', 'engagementCalculatedAt', 'engagementLevel',
      'engagementScore', 'estado', 'firstAccessDate', 'hotmartUserId', 'isDeletable',
      'isDeleted', 'lastAccessDate', 'lastActivityAt', 'lastEditedAt', 'lastEditedBy',
      'locale', 'message', 'multiple', 'name', 'notes', 'performanceMetrics',
      'plusAccess', 'priority', 'progress', 'purchaseDate', 'role', 'signupDate',
      'source', 'status', 'students', 'tags', 'timer', 'truncated', 'type',
      'updatedAt', 'username',
    ])
    expect(responseCatalog.some((entry) => entry.evidence.startsWith('dynamic response spread'))).toBe(false)
  })

  test('keeps the exact 13 routes without a successful exit explicitly reviewed', () => {
    const expected = [
      'GET /api/curseduca/debug',
      'GET /api/curseduca/groups',
      'GET /api/curseduca/members',
      'GET /api/curseduca/members/by',
      'GET /api/curseduca/report',
      'GET /api/curseduca/reports/access',
      'GET /api/curseduca/user',
      'GET /api/curseduca/users',
      'GET /api/users/by-email/:email',
      'POST /api/curseduca/cleanup',
      'POST /api/sync/discord',
      'POST /api/sync/discord/batch',
      'POST /api/sync/discord/csv',
    ]
    const reviewed = responseCatalog
      .filter((entry) => entry.evidence.startsWith('no successful exit (501-only); '))
      .map(routeId)
      .sort()

    expect(reviewed).toEqual(expected)
    for (const identity of expected) {
      expect(responseCatalog.find((entry) => routeId(entry) === identity)).toMatchObject({
        family: 'success-data',
        shapeKeys: [],
      })
    }
  })

  test('derives exact Front consumers and rejects the legacy users v2 false positive', () => {
    const consumers = responseCatalog.filter((entry) => entry.frontConsumer !== null)
    const consumer = (identity: string): string | null | undefined =>
      responseCatalog.find((entry) => routeId(entry) === identity)?.frontConsumer

    expect(consumers).toHaveLength(194)
    expect(consumer('GET /api/users/v2')).toBeNull()
    expect(consumer('GET /api/users/v2/analytics')).toBe('src/features/users-v2/usersV2.api.ts')
    expect(consumer('GET /api/users/v2/enrollments')).toBe('src/features/users-v2/usersV2.api.ts')
    expect(consumer('PUT /api/course-lessons/:pageId')).toBe('src/services/courseLessons.service.ts')
    expect(consumer('GET /api/activecampaign/courses/clareza/students')).toBe('src/features/activecampaign/activecampaign.api.ts')
    expect(consumer('POST /api/renewal/offers')).toBe('src/services/renewalOffers.service.ts')
    expect(consumer('POST /api/discord-renewal/messages/send')).toBe('src/services/discordRenewal.service.ts')
    expect(consumer('POST /api/renewal-ac/execute')).toBe('src/services/renewalAcSync.service.ts')
  })

  test('write mode rejects producer drift and preserves the reviewed catalog SHA', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-source-'))
    const sourcePath = path.join(process.cwd(), 'src', 'services', 'users', 'usersV2OverviewAnalytics.service.ts')
    const catalogPath = path.join(directory, 'catalog.json')
    const sourceShaBefore = fileSha(sourcePath)
    const catalogShaBefore = fileSha(workspaceResponseCatalog)
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
    const mutated = source.replace(
      '    return {\n      success: true,\n      data: {',
      '    return {\n      success: true,\n      writeReviewMutation: null,\n      data: {',
    )
    expect(mutated).not.toBe(source)

    try {
      fs.copyFileSync(workspaceResponseCatalog, catalogPath)
      const catalogBefore = fileSha(catalogPath)
      const overlayRoot = writeSourceOverlay(directory, sourcePath, mutated)
      const result = runGenerator('--write', catalogPath, testSourceOverlayEnv(overlayRoot))

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('GET /api/users/v2/analytics')
      expect(fileSha(catalogPath)).toBe(catalogBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(sourcePath)).toBe(sourceShaBefore)
      expect(fileSha(workspaceResponseCatalog)).toBe(catalogShaBefore)
    }
  })

  test.each([
    ['unmatched', "void httpClient.get('/__missing-response-contract-route')", 'unmatched Front call'],
    ['unresolved', 'declare function runtimePath(): string\nconst target = runtimePath()\nvoid httpClient.get(target)', 'unresolved Front call'],
  ])('fails check and write for an %s productive Front call without writing', (_label, body, expectedError) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-front-'))
    const extraRoot = path.join(directory, 'src')
    const extraFile = path.join(extraRoot, 'mutation.api.ts')
    const catalogPath = path.join(directory, 'catalog.json')
    const workspaceCatalogShaBefore = fileSha(workspaceResponseCatalog)

    try {
      fs.mkdirSync(extraRoot, { recursive: true })
      fs.copyFileSync(workspaceResponseCatalog, catalogPath)
      fs.writeFileSync(extraFile, `import { httpClient } from './services/httpClient'\n${body}\n`, 'utf8')
      const catalogBefore = fileSha(catalogPath)
      for (const mode of ['--check', '--write'] as const) {
        const result = runGenerator(mode, catalogPath, {
          RESPONSE_CONTRACT_FRONT_EXTRA_SOURCE: extraRoot,
        })
        expect(result.status).not.toBe(0)
        expect(`${result.stdout}${result.stderr}`).toContain(expectedError)
        expect(fileSha(catalogPath)).toBe(catalogBefore)
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(workspaceResponseCatalog)).toBe(workspaceCatalogShaBefore)
    }
  })

  test('resolves an awaited Promise body before extracting response properties', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-await-'))
    const routeFile = path.join(process.cwd(), 'src', 'routes', 'index.ts')
    const routeCatalogFixture = path.join(directory, 'routes.json')
    const responseCatalogFixture = path.join(directory, 'responses.json')
    const migrationInventoryFixture = path.join(directory, 'inventory.json')
    const frontRoot = path.join(directory, 'Front')
    const frontSrc = path.join(frontRoot, 'src')
    const routeFileShaBefore = fileSha(routeFile)
    const source = fs.readFileSync(routeFile, 'utf8').replace(/\r\n/g, '\n')
    const prefix = source.endsWith('\n') ? source : `${source}\n`
    const routeDeclaration = "__responseContractAwaitRouter.get('/promise', async (_req, res) => {"
    const mutated = `${prefix}${[
      'const __responseContractAwaitRouter = Router()',
      routeDeclaration,
      '  res.json(await Promise.resolve({ success: true, data: null }))',
      '})',
      '',
    ].join('\n')}`
    const routeLine = mutated.slice(0, mutated.indexOf(routeDeclaration)).split('\n').length
    const routes = [{
      method: 'GET',
      path: '/api/__awaited-promise',
      evidence: `consumer nao identificado; rota em src/routes/index.ts:${routeLine}`,
    }]
    const responses = [{
      method: 'GET',
      path: '/api/__awaited-promise',
      family: 'success-data',
      shapeKeys: ['data', 'success'],
      evidence: `src/routes/index.ts:${routeLine + 1}`,
      frontConsumer: null,
    }]

    try {
      fs.mkdirSync(frontSrc, { recursive: true })
      fs.writeFileSync(path.join(frontRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }), 'utf8')
      fs.writeFileSync(path.join(frontSrc, 'empty.ts'), 'export {}\n', 'utf8')
      const overlayRoot = writeSourceOverlay(directory, routeFile, mutated)
      fs.writeFileSync(routeCatalogFixture, JSON.stringify(routes), 'utf8')
      fs.writeFileSync(responseCatalogFixture, JSON.stringify(responses, null, 2) + '\n', 'utf8')
      fs.writeFileSync(migrationInventoryFixture, JSON.stringify([{
        identity: 'GET /api/__awaited-promise',
        owner: 'src/routes/index.ts',
        currentFamily: 'success-data',
        targetFamily: 'success-data',
        frontConsumer: null,
        status: 'complete',
      }], null, 2) + '\n', 'utf8')

      const result = runGenerator('--check', responseCatalogFixture, {
        ...testSourceOverlayEnv(overlayRoot),
        RESPONSE_CONTRACT_ROUTE_CATALOG: routeCatalogFixture,
        RESPONSE_CONTRACT_MIGRATION_INVENTORY: migrationInventoryFixture,
        RESPONSE_CONTRACT_FRONT_ROOT: frontRoot,
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(routeFile)).toBe(routeFileShaBefore)
    }
  })
  test('classes users search includes the complete lean IUser surface', () => {
    const shapeKeys = responseCatalog.find((entry) => routeId(entry) === 'GET /api/classes/users/search')?.shapeKeys
    expect(shapeKeys).toEqual(expect.arrayContaining([
      '__v', '_id', 'achievementStats', 'achievements', 'classId', 'className',
      'combined', 'communicationByCourse', 'createdAt', 'curseduca', 'discord',
      'email', 'engagement', 'guru', 'hotmart', 'inactivation', 'metadata', 'name',
      'updatedAt',
    ]))
  })

  test('a new IUser producer field invalidates the classes users search decision', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-source-'))
    const sourcePath = path.join(process.cwd(), 'src', 'models', 'user.types.ts')
    const catalogPath = path.join(directory, 'catalog.json')
    const sourceShaBefore = fileSha(sourcePath)
    const catalogShaBefore = fileSha(workspaceResponseCatalog)
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
    const mutated = source.replace('  email: string //', '  reviewMutation?: string\n  email: string //')
    expect(mutated).not.toBe(source)

    try {
      fs.copyFileSync(workspaceResponseCatalog, catalogPath)
      const catalogBefore = fileSha(catalogPath)
      const overlayRoot = writeSourceOverlay(directory, sourcePath, mutated)
      const result = runGenerator('--check', catalogPath, testSourceOverlayEnv(overlayRoot))
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('GET /api/classes/users/search')
      expect(fileSha(catalogPath)).toBe(catalogBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(sourcePath)).toBe(sourceShaBefore)
      expect(fileSha(workspaceResponseCatalog)).toBe(catalogShaBefore)
    }
  })

  test('producer drift fails check without writing the reviewed catalog', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-source-'))
    const sourcePath = path.join(process.cwd(), 'src', 'services', 'users', 'usersV2OverviewAnalytics.service.ts')
    const catalogPath = path.join(directory, 'catalog.json')
    const sourceShaBefore = fileSha(sourcePath)
    const catalogShaBefore = fileSha(workspaceResponseCatalog)
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
    const needle = '    return {\n      success: true,\n      data: {'
    const mutated = source.replace(needle, '    return {\n      success: true,\n      meta: null,\n      data: {')
    expect(mutated).not.toBe(source)

    try {
      fs.copyFileSync(workspaceResponseCatalog, catalogPath)
      const catalogBefore = fileSha(catalogPath)
      const overlayRoot = writeSourceOverlay(directory, sourcePath, mutated)
      const result = runGenerator('--check', catalogPath, testSourceOverlayEnv(overlayRoot))
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('GET /api/users/v2/analytics')
      expect(fileSha(catalogPath)).toBe(catalogBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(sourcePath)).toBe(sourceShaBefore)
      expect(fileSha(workspaceResponseCatalog)).toBe(catalogShaBefore)
    }
  })

  test('a 501-only route becoming successful requires a new reviewed decision', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-source-'))
    const sourcePath = path.join(process.cwd(), 'src', 'controllers', 'sync', 'operations.controller.ts')
    const catalogPath = path.join(directory, 'catalog.json')
    const sourceShaBefore = fileSha(sourcePath)
    const catalogShaBefore = fileSha(workspaceResponseCatalog)
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
    const mutated = source.replace('  res.status(501).json({', '  res.status(200).json({')
    expect(mutated).not.toBe(source)

    try {
      fs.copyFileSync(workspaceResponseCatalog, catalogPath)
      const catalogBefore = fileSha(catalogPath)
      const overlayRoot = writeSourceOverlay(directory, sourcePath, mutated)
      const result = runGenerator('--check', catalogPath, testSourceOverlayEnv(overlayRoot))
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('POST /api/sync/discord')
      expect(fileSha(catalogPath)).toBe(catalogBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(sourcePath)).toBe(sourceShaBefore)
      expect(fileSha(workspaceResponseCatalog)).toBe(catalogShaBefore)
    }
  })

  test('a mismatched Front consumer fails check without rewriting it', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-'))
    const catalogPath = path.join(directory, 'catalog.json')
    const fixture = responseFixture().map((decision) =>
      routeId(decision) === 'GET /api/users/v2'
        ? { ...decision, frontConsumer: 'src/features/activecampaign/activecampaign.api.ts' }
        : decision)
    const before = `${JSON.stringify(fixture, null, 2)}\n`

    try {
      fs.writeFileSync(catalogPath, before, 'utf8')
      const result = runGenerator('--check', catalogPath)
      expect(result.status).not.toBe(0)
      expect(fs.readFileSync(catalogPath, 'utf8')).toBe(before)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
