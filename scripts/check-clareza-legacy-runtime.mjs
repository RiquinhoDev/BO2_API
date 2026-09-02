import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const legacyRoutes = [
  ['get', '/data'],
  ['post', '/refresh'],
  ['get', '/reit-valuation/:ticker'],
  ['get', '/reit/:ticker'],
  ['get', '/stock/:ticker'],
  ['post', '/top10/refresh'],
  ['get', '/raiox-search'],
  ['get', '/raiox-diagnose'],
  ['get', '/raiox/:ticker'],
  ['post', '/raiox/refresh'],
  ['get', '/carteira/legacy-data'],
  ['get', '/carteira-search'],
  ['post', '/carteira/refresh'],
  ['post', '/earnings/refresh'],
  ['post', '/comparador/refresh'],
  ['get', '/raiox/refresh/status'],
]

const legacyFiles = [
  'src/controllers/clarezaController.ts',
  'src/security/clarezaRefreshAuthorization.ts',
  'src/models/ClarezaCarteiraData.ts',
  'src/models/ClarezaComparadorData.ts',
  'src/models/ClarezaEarningsData.ts',
  'src/models/ClarezaMarketData.ts',
  'src/models/ClarezaRaioxData.ts',
  'src/models/ClarezaTop10Data.ts',
  'src/services/clareza/clarezaEarningsService.ts',
  'src/services/clareza/clarezaFmpAnalysisSupport.ts',
  'src/services/clareza/clarezaFmpData.service.ts',
  'src/services/clareza/clarezaFmpReit.service.ts',
  'src/services/clareza/clarezaFmpService.ts',
  'src/services/clareza/clarezaFmpStock.service.ts',
  'src/services/clareza/clarezaFmpUniverse.ts',
  'src/services/clareza/clarezaRaioxService.ts',
  'src/services/clareza/clarezaTop10Service.ts',
  'src/services/clareza/cachePolicy.ts',
  'src/services/clareza/tickerUtils.ts',
  'src/services/clareza/carteira/carteiraUniverse.ts',
  'src/services/clareza/carteira/carteira.runtime.ts',
  'src/services/clareza/carteira/carteira.service.ts',
  'src/services/clareza/carteira/carteiraMetrics.ts',
  'src/services/clareza/carteira/carteiraStore.ts',
  'src/services/clareza/carteira/fmpCarteiraClient.ts',
  'src/services/clareza/comparador/comparador.runtime.ts',
  'src/services/clareza/comparador/comparador.service.ts',
  'src/services/clareza/comparador/comparadorStore.ts',
  'src/services/clareza/comparador/comparadorFmpClient.ts',
  'src/services/clareza/comparador/comparadorPolicy.ts',
  'src/services/clareza/comparador/comparador.types.ts',
  'src/services/clareza/operations/raioxRefreshRuntime.ts',
  'src/services/clareza/raiox/data.ts',
  'src/services/clareza/raiox/refreshUniverse.ts',
  'src/services/clareza/raiox/runtime.ts',
  'src/services/clareza/core/coreRaioxComplementReader.ts',
  'src/services/clareza/operations/coreLegacyRetirement.ts',
]

const routeSource = readFileSync(resolve('src/routes/clareza.routes.ts'), 'utf8')
const findings = []

for (const [method, path] of legacyRoutes) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`router\\.${method}\\(\\s*['"]${escaped}['"]`).test(routeSource)) {
    findings.push(`${method.toUpperCase()} /api/clareza${path}`)
  }
}

for (const file of legacyFiles) {
  if (existsSync(resolve(file))) findings.push(file)
}

if (findings.length) {
  console.error(`Clareza legacy runtime remains (${findings.length}):`)
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log('Clareza legacy runtime inventory OK: 16 routes and 37 files absent.')
