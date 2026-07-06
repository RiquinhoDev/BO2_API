// TEMP local test harness — NOT part of the repo, lives in scratchpad.
// Goal: exercise the real /api/clareza/carteira/* routes end-to-end against
// the real FMP API, without depending on the (currently unreachable from
// here) Redis Cloud host in .env. We monkeypatch the cacheService singleton
// with an in-memory store BEFORE the routes/services import it.
import 'dotenv/config'
import path from 'path'

const API_ROOT = 'C:\\Users\\User\\Documents\\GitHub\\Riquinho\\api\\Front\\BO2_API'

async function main() {
  process.env.CLAREZA_REFRESH_TOKEN = process.env.CLAREZA_REFRESH_TOKEN || 'local-test-token'

  const { cacheService } = require('./src/services/cache.service')

  const store = new Map<string, string>()
  cacheService.connect = async () => { console.log('[mock cache] connect() no-op') }
  cacheService.get = async (key: string) => {
    const v = store.get(key)
    return v ? JSON.parse(v) : null
  }
  cacheService.set = async (key: string, value: any) => {
    store.set(key, JSON.stringify(value))
  }
  cacheService.getRaw = async (key: string) => store.get(key) ?? null
  cacheService.setRaw = async (key: string, value: string) => { store.set(key, value) }

  // Trim the universe so the smoke test finishes in seconds instead of ~10min
  // across 731 real tickers. Keep one of each kind + one REIT to exercise every
  // code path (fetchStock/fetchEtf/fetchCrypto, isReit branch).
  const carteiraService = require('./src/services/clareza/clarezaCarteiraService')
  const originalUniverse = carteiraService.UNIVERSE as any[]
  const sample = [
    ...originalUniverse.filter(i => i.kind === 'stock' && i.type !== 'reit').slice(0, 6),
    ...originalUniverse.filter(i => i.kind === 'stock' && i.type === 'reit').slice(0, 2),
    ...originalUniverse.filter(i => i.kind === 'fund').slice(0, 4),
    ...originalUniverse.filter(i => i.kind === 'crypto').slice(0, 2)
  ]
  originalUniverse.length = 0
  originalUniverse.push(...sample)
  console.log(`[harness] universo reduzido para teste: ${originalUniverse.length} ativos`, sample.map(s => s.ticker))

  const express = require('express')
  const cors = require('cors')
  const clarezaRoutes = require('./src/routes/clareza.routes').default

  const app = express()
  app.use(cors({ origin: '*' }))
  app.use(express.json())
  app.use('/api/clareza', clarezaRoutes)

  await cacheService.connect()

  const PORT = 3901
  app.listen(PORT, () => {
    console.log(`[harness] a correr em http://localhost:${PORT}/api/clareza`)
  })
}

main().catch(err => {
  console.error('[harness] erro fatal:', err)
  process.exit(1)
})
