import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import responseCatalog from '../../src/contracts/response-contract-catalog.json'
import routeCatalog from '../../src/security/route-catalog.json'
import { successResponse } from '../../src/contracts/responseContract'
import type { SuccessResponse } from '../../src/contracts/responseContract'

const generator = path.join(process.cwd(), 'scripts', 'generate-response-contract-catalog.mjs')
const workspaceRouteCatalog = path.join(process.cwd(), 'src', 'security', 'route-catalog.json')
const workspaceResponseCatalog = path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json')
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const fileSha = (filePath: string): string => sha256(fs.readFileSync(filePath, 'utf8'))
const serialize = (value: object): string => `${JSON.stringify(value, null, 2)}\n`

function runChecker(routeCatalogPath: string, responseCatalogPath: string) {
  return spawnSync(process.execPath, [generator, '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RESPONSE_CONTRACT_ROUTE_CATALOG: routeCatalogPath,
      RESPONSE_CONTRACT_CATALOG: responseCatalogPath,
    },
  })
}

describe('canonical response contract for new code', () => {
  test('wraps data without taking status, header, or send ownership', () => {
    const data = { id: 'student-1', active: true }
    const response: SuccessResponse<typeof data> = successResponse(data)

    expect(response).toEqual({ success: true, data })
    expect(response.data).toBe(data)
  })

  test('keeps typed transport metadata optional and separate from data', () => {
    const data = { id: 'student-1' }
    const meta = { total: 1, page: 1 }
    const response: SuccessResponse<typeof data, typeof meta> = successResponse(data, meta)

    expect(response).toEqual({ success: true, data, meta })
    expect(response.meta).toBe(meta)
  })
})

describe('response contract ratchet', () => {
  test('fails closed and names a new route without a reviewed decision', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-ratchet-'))
    const routeFixture = path.join(directory, 'routes.json')
    const responseFixture = path.join(directory, 'responses.json')
    const routeShaBefore = fileSha(workspaceRouteCatalog)
    const responseShaBefore = fileSha(workspaceResponseCatalog)
    const identity = 'GET /api/__contract_probe'

    try {
      fs.copyFileSync(workspaceRouteCatalog, routeFixture)
      fs.copyFileSync(workspaceResponseCatalog, responseFixture)
      fs.writeFileSync(routeFixture, serialize([
        ...routeCatalog,
        {
          method: 'GET',
          path: '/api/__contract_probe',
          access: 'authenticated',
          consumer: 'desconhecido',
          writes: false,
          destructive: false,
          evidence: 'consumer nao identificado; rota em src/routes/index.ts:1',
        },
      ]), 'utf8')
      const routeFixtureShaBefore = fileSha(routeFixture)
      const responseFixtureShaBefore = fileSha(responseFixture)

      const result = runChecker(routeFixture, responseFixture)

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(`missing response decision: ${identity}`)
      expect(fileSha(routeFixture)).toBe(routeFixtureShaBefore)
      expect(fileSha(responseFixture)).toBe(responseFixtureShaBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(workspaceRouteCatalog)).toBe(routeShaBefore)
      expect(fileSha(workspaceResponseCatalog)).toBe(responseShaBefore)
    }
  })

  test('fails closed when a forbidden raw-json terminal family is reintroduced', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-ratchet-'))
    const routeFixture = path.join(directory, 'routes.json')
    const responseFixture = path.join(directory, 'responses.json')
    const routeShaBefore = fileSha(workspaceRouteCatalog)
    const responseShaBefore = fileSha(workspaceResponseCatalog)
    const target = responseCatalog.find((decision) =>
      decision.method === 'DELETE' && decision.path === '/api/ac/cache/clear')
    if (target === undefined) {
      throw new Error('response contract fixture target is missing')
    }
    const identity = `${target.method} ${target.path}`
    const oldFamily = target.family
    const newFamily = oldFamily === 'raw-json' ? 'domain-envelope' : 'raw-json'
    const mutated = responseCatalog.map((decision) =>
      decision === target ? { ...decision, family: newFamily } : decision)

    try {
      fs.copyFileSync(workspaceRouteCatalog, routeFixture)
      fs.copyFileSync(workspaceResponseCatalog, responseFixture)
      fs.writeFileSync(responseFixture, serialize(mutated), 'utf8')
      const routeFixtureShaBefore = fileSha(routeFixture)
      const responseFixtureShaBefore = fileSha(responseFixture)

      const result = runChecker(routeFixture, responseFixture)

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        `forbidden terminal response family: ${identity}`,
      )
      expect(fileSha(routeFixture)).toBe(routeFixtureShaBefore)
      expect(fileSha(responseFixture)).toBe(responseFixtureShaBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fileSha(workspaceRouteCatalog)).toBe(routeShaBefore)
      expect(fileSha(workspaceResponseCatalog)).toBe(responseShaBefore)
    }
  })
  test.each(['domain-envelope', 'raw-json', '501-only'])('rejects a reintroduced %s decision without writing', (family) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-ratchet-'))
    const routeFixture = path.join(directory, 'routes.json')
    const responseFixture = path.join(directory, 'responses.json')
    const target = responseCatalog.find((decision) =>
      decision.method === 'DELETE' && decision.path === '/api/ac/cache/clear')
    if (target === undefined) throw new Error('response contract fixture target is missing')

    try {
      fs.copyFileSync(workspaceRouteCatalog, routeFixture)
      fs.copyFileSync(workspaceResponseCatalog, responseFixture)
      fs.writeFileSync(responseFixture, serialize(responseCatalog.map((decision) =>
        decision === target ? { ...decision, family } : decision)), 'utf8')
      const before = fileSha(responseFixture)

      const result = runChecker(routeFixture, responseFixture)

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        `forbidden terminal response family: ${target.method} ${target.path}`,
      )
      expect(fileSha(responseFixture)).toBe(before)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
