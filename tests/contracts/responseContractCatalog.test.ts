import { spawnSync } from 'node:child_process'
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

function responseFixture() {
  return responseCatalog.map((decision) => ({
    ...decision,
    shapeKeys: [...decision.shapeKeys],
  }))
}

function runGenerator(mode: '--check' | '--write', catalogPath: string) {
  return spawnSync(process.execPath, [generator, mode], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RESPONSE_CONTRACT_ROUTE_CATALOG: routeCatalogPath,
      RESPONSE_CONTRACT_CATALOG: catalogPath,
    },
  })
}

describe('response contract catalog', () => {
  test('covers exactly every mounted route identity', () => {
    const routeIds = routeCatalog.map(routeId).sort()
    const contractIds = responseCatalog.map(routeId).sort()

    expect(responseCatalog).toHaveLength(439)
    expect(new Set(contractIds).size).toBe(439)
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
      family: 'domain-envelope',
      shapeKeys: ['data', 'filters', 'pagination', 'success'],
    })
    expect(responseCatalog.find((entry) => routeId(entry) === 'POST /api/hotmart/syncProgressOnly')).toMatchObject({
      family: 'domain-envelope',
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
      '_id', 'classId', 'className', 'combined', 'communicationByCourse', 'curseduca',
      'discord', 'email', 'hotmart', 'message', 'metadata', 'multiple', 'name',
      'students', 'success', 'timestamp', 'total',
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
        family: 'domain-envelope',
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

  test('producer drift fails check without writing the reviewed catalog', () => {
    const sourcePath = path.join(process.cwd(), 'src', 'services', 'users', 'usersV2OverviewAnalytics.service.ts')
    const catalogPath = path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json')
    const sourceBefore = fs.readFileSync(sourcePath, 'utf8')
    const catalogBefore = fs.readFileSync(catalogPath, 'utf8')
    const needle = '    return {\n      success: true,\n      data: {'
    const mutated = sourceBefore.replace(needle, '    return {\n      success: true,\n      meta: null,\n      data: {')
    expect(mutated).not.toBe(sourceBefore)

    try {
      fs.writeFileSync(sourcePath, mutated, 'utf8')
      const result = spawnSync(process.execPath, [generator, '--check'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('GET /api/users/v2/analytics')
      expect(fs.readFileSync(catalogPath, 'utf8')).toBe(catalogBefore)
    } finally {
      fs.writeFileSync(sourcePath, sourceBefore, 'utf8')
    }
  })

  test('a 501-only route becoming successful requires a new reviewed decision', () => {
    const sourcePath = path.join(process.cwd(), 'src', 'controllers', 'sync', 'operations.controller.ts')
    const catalogPath = path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json')
    const sourceBefore = fs.readFileSync(sourcePath, 'utf8')
    const catalogBefore = fs.readFileSync(catalogPath, 'utf8')
    const mutated = sourceBefore.replace('  res.status(501).json({', '  res.status(200).json({')
    expect(mutated).not.toBe(sourceBefore)

    try {
      fs.writeFileSync(sourcePath, mutated, 'utf8')
      const result = spawnSync(process.execPath, [generator, '--check'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('POST /api/sync/discord')
      expect(fs.readFileSync(catalogPath, 'utf8')).toBe(catalogBefore)
    } finally {
      fs.writeFileSync(sourcePath, sourceBefore, 'utf8')
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
