import { spawnSync } from 'node:child_process'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import responseCatalog from '../../src/contracts/response-contract-catalog.json'

const generator = path.join(process.cwd(), 'scripts', 'generate-response-contract-catalog.mjs')
const catalogPath = path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json')
const inventoryPath = path.join(process.cwd(), 'src', 'contracts', 'response-migration-inventory.json')
const routeCatalogPath = path.join(process.cwd(), 'src', 'security', 'route-catalog.json')
const clarezaControllerPath = path.join(process.cwd(), 'src', 'controllers', 'clarezaController.ts')
const publicDocumentIdentities = [
  'GET /api/clareza/carteira-search',
  'GET /api/clareza/carteira/analysis',
  'GET /api/clareza/carteira/data',
  'GET /api/clareza/carteira/legacy-data',
  'GET /api/clareza/carteira/search',
  'GET /api/clareza/comparador',
  'GET /api/clareza/data',
  'GET /api/clareza/earnings/data',
  'GET /api/clareza/radar',
  'GET /api/clareza/raiox',
  'GET /api/clareza/raiox-diagnose',
  'GET /api/clareza/raiox-search',
  'GET /api/clareza/raiox/:ticker',
  'GET /api/clareza/reit-valuation/:ticker',
  'GET /api/clareza/reit/:ticker',
  'GET /api/clareza/stock/:ticker',
  'GET /api/clareza/top10',
  'GET /api/health',
  'GET /api/info',
]

const routeId = (entry: { method: string; path: string }): string => `${entry.method} ${entry.path}`


function runChecker(extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [generator, '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RESPONSE_CONTRACT_ROUTE_CATALOG: routeCatalogPath,
      ...extraEnv,
    },
  })
}

function writeSourceOverlay(directory: string, source: string): string {
  const overlayRoot = path.join(directory, 'source-overlay')
  const overlayFile = path.join(overlayRoot, 'backend', path.relative(process.cwd(), clarezaControllerPath))
  fs.mkdirSync(path.dirname(overlayFile), { recursive: true })
  fs.writeFileSync(overlayFile, source, 'utf8')
  return overlayRoot
}

describe('Clareza public-document catalog protection', () => {
  test('keeps exactly the reviewed public documents in catalog and migration inventory', () => {
    const catalogPublicDocuments = responseCatalog
      .filter((entry) => entry.family === 'public-document')
      .map(routeId)
      .sort()
    const inventory: Array<{
      identity: string
      currentFamily: string
      targetFamily: string
      status: string
    }> = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
    const inventoryPublicDocuments = inventory
      .filter((entry) => entry.currentFamily === 'public-document')
      .sort((left, right) => left.identity.localeCompare(right.identity))

    expect(catalogPublicDocuments).toEqual(publicDocumentIdentities)
    expect(inventoryPublicDocuments.map((entry) => entry.identity)).toEqual(publicDocumentIdentities)
    for (const entry of inventoryPublicDocuments) {
      expect(entry.targetFamily).toBe('public-document')
      expect(entry.status).toBe('complete')
    }
    const refreshes = inventory.filter((entry) => entry.identity.startsWith('POST /api/clareza/')
      && entry.identity.endsWith('/refresh'))
    expect(refreshes).toHaveLength(6)
    for (const refresh of refreshes) {
      expect(refresh.targetFamily).toBe('success-data')
      expect(refresh.status).toBe('complete')
    }
    expect(inventory.find((entry) => entry.identity === 'POST /api/clareza/suggestions')).toMatchObject({
      currentFamily: 'success-data', targetFamily: 'success-data', status: 'complete',
    })
  })

  test('rejects a success-data wrapper mutation for a public Clareza GET without rewriting the catalog', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clareza-public-document-mutation-'))
    const catalogBefore = fs.readFileSync(catalogPath, 'utf8')
    const controllerBefore = fs.readFileSync(clarezaControllerPath, 'utf8')
    const mutationNeedle = '      return res.json(data)'
    const mutatedController = controllerBefore.replace(
      mutationNeedle,
      '      return res.json({ success: true, data })',
    )

    expect(mutatedController).not.toBe(controllerBefore)
    try {
      const overlayRoot = writeSourceOverlay(directory, mutatedController)
      const result = runChecker({
        RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY: '1',
        RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: overlayRoot,
      })

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('GET /api/clareza/data')
      expect(fs.readFileSync(catalogPath, 'utf8')).toBe(catalogBefore)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expect(fs.readFileSync(clarezaControllerPath, 'utf8')).toBe(controllerBefore)
    }
  })

  test('accepts the restored public-document source and reviewed catalog', () => {
    const result = runChecker()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('416 decisions; 213 Front calls; 188 consumers')
  })
})
