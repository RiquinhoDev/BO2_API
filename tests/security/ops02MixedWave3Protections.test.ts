import fs from 'node:fs'
import path from 'node:path'
import { getOps02Decision } from '../../src/security/ops02Policy'
import { UNIVERSE as clarezaUniverse } from '../../src/services/clareza/clarezaFmpUniverse'
import { RAIOX_UNIVERSE } from '../../src/services/clareza/raiox/data'
import { UNIVERSE as carteiraUniverse } from '../../src/services/clareza/carteira/carteiraUniverse'
import { COMPANIES } from '../../src/services/clareza/clarezaEarningsService'
import { CLAREZA_TOP10_WATCHLIST_SIZE } from '../../src/services/clareza/clarezaTop10Service'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function decision(method: string, route: string) {
  const result = getOps02Decision(method, route)
  if (!result) throw new Error(`Missing OPS-02 decision for ${method} ${route}`)
  return result
}

const clarezaRefreshes: readonly [string, number, string, string, string, string, string][] = [
  [
    'POST /api/clareza/refresh',
    clarezaUniverse.length,
    'src/services/clareza/clarezaFmpData.service.ts',
    'UNIVERSE.map',
    'cacheService.set(CLAREZA_CACHE_KEY, results, CACHE_TTL)',
    'src/services/clareza/clarezaFmpData.service.ts',
    'await ClarezaMarketData.create({',
  ],
  [
    'POST /api/clareza/top10/refresh',
    CLAREZA_TOP10_WATCHLIST_SIZE,
    'src/services/clareza/clarezaTop10Service.ts',
    'WATCHLIST.map',
    'cacheService.set(CLAREZA_TOP10_CACHE_KEY, payload, CACHE_TTL)',
    'src/services/clareza/clarezaTop10Service.ts',
    'await ClarezaTop10Data.create({',
  ],
  [
    'POST /api/clareza/raiox/refresh',
    RAIOX_UNIVERSE.length,
    'src/services/clareza/raiox/runtime.ts',
    'for (const stock of RAIOX_UNIVERSE)',
    'cacheService.set(RAIOX_INDEX_KEY, index, RAIOX_TTL)',
    'src/services/clareza/raiox/runtime.ts',
    'await ClarezaRaioxData.create({',
  ],
  [
    'POST /api/clareza/carteira/refresh',
    carteiraUniverse.length,
    'src/services/clareza/carteira/carteira.service.ts',
    'this.universe.map',
    'this.store.writeCache(results, this.config.cacheTtl)',
    'src/services/clareza/carteira/carteiraStore.ts',
    'await ClarezaCarteiraData.create(snapshot)',
  ],
  [
    'POST /api/clareza/earnings/refresh',
    COMPANIES.length,
    'src/services/clareza/clarezaEarningsService.ts',
    'COMPANIES.map',
    'cacheService.set(CLAREZA_EARNINGS_CACHE_KEY, payload, CACHE_TTL)',
    'src/services/clareza/clarezaEarningsService.ts',
    'await ClarezaEarningsData.create({',
  ],
  [
    'POST /api/clareza/comparador/refresh',
    clarezaUniverse.length,
    'src/services/clareza/comparador/comparador.service.ts',
    'refresh(dependencies.universe, emptySnapshot(), false)',
    'await dependencies.store.write(result.snapshot, result.failed.length)',
    'src/services/clareza/comparador/comparadorStore.ts',
    'await this.model.create({',
  ],
]

describe('OPS-02 mixed provider-read wave three protections', () => {
  test.each(clarezaRefreshes)(
    '%s records the finite Clareza universe cap but keeps replay hardening open',
    (route, limit, file, capMarker, replayMarker, writeFile, writeMarker) => {
      const [method, pathName] = route.split(' ', 2)
      const result = decision(method ?? '', pathName ?? '')
      const text = source(file)

      expect(result.scope).toBe('mixed')
      expect(result.provider).toBe('fmp')
      expect(result.authorization).toBe('super-admin')
      expect(result.bulk).toBe(true)
      expect(result.cap).toEqual({
        status: 'verified',
        reason: 'clareza-static-universe-max-items',
        limit,
      })
      expect(result.idempotency).toEqual({
        status: 'required',
        reason: 'local-reconciliation-replay-unverified',
      })
      expect(result.killSwitch).toEqual({
        status: 'not-applicable',
        reason: 'provider-read-only',
      })
      expect(result.dryRun).toEqual({
        status: 'not-applicable',
        reason: 'provider-read-only',
      })
      expect(result.status).toBe('needs-hardening')
      expect(text).toContain(capMarker)
      expect(text).toContain(replayMarker)
      expect(source(writeFile)).toContain(writeMarker)
    },
  )

  test('Guru snapshot update replaces one unique period on replay', () => {
    const model = source('src/models/GuruMonthlySnapshot.ts')
    const controller = source('src/controllers/guruSnapshots/crud.controller.ts')
    const deleteIndex = controller.indexOf('findOneAndDelete({')
    const recreateIndex = controller.indexOf('createSnapshotFromSubscriptions(yearNum, monthNum, allSubs)')

    const result = decision('PUT', '/api/guru/snapshots/:year/:month')

    expect(result.scope).toBe('mixed')
    expect(result.provider).toBe('guru')
    expect(result.authorization).toBe('super-admin')
    expect(result.bulk).toBe(false)
    expect(result.cap).toEqual({
      status: 'not-applicable',
      reason: 'not-caller-bulk',
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'guru-snapshot-period-replacement-converges',
    })
    expect(result.killSwitch).toEqual({
      status: 'not-applicable',
      reason: 'provider-read-only',
    })
    expect(result.dryRun).toEqual({
      status: 'not-applicable',
      reason: 'provider-read-only',
    })
    expect(result.status).toBe('reviewed')
    expect(model).toContain("GuruMonthlySnapshotSchema.index({ year: 1, month: 1 }, { unique: true })")
    expect(deleteIndex).toBeGreaterThanOrEqual(0)
    expect(recreateIndex).toBeGreaterThan(deleteIndex)
  })
})
