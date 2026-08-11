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
})
