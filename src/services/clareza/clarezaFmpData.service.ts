import { cacheService } from '../cache.service'
import ClarezaMarketData from '../../models/ClarezaMarketData'
import { getFmpApiKey } from '../requestDrivenRuntimeConfig'
import { UNIVERSE } from './clarezaFmpUniverse'
import { CACHE_TTL, CLAREZA_CACHE_KEY, ClarezaStockEntry, errorMessage, fetchStock, runWithConcurrency } from './clarezaFmpAnalysisSupport'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// REFRESH COMPLETO (chamado pelo cron e pelo endpoint manual)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function refreshClarezaData(): Promise<{ total: number; errors: number }> {
  getFmpApiKey()

  console.log(`ðŸ“ˆ [Clareza] Iniciando refresh de ${UNIVERSE.length} aÃ§Ãµes...`)

  let errors = 0

  const results = await runWithConcurrency(
    UNIVERSE.map(stock => async () => {
      try {
        const data = await fetchStock(stock.ticker, stock.type === 'reit')
        return { ticker: stock.ticker, name: stock.name, type: stock.type, sector: stock.sector, data }
      } catch (err: unknown) {
        errors++
        console.error(`âŒ [Clareza] Erro em ${stock.ticker}:`, errorMessage(err))
        return { ticker: stock.ticker, name: stock.name, type: stock.type, sector: stock.sector, data: null }
      }
    }),
    // 12 aÃ§Ãµes em simultÃ¢neo â€” o fmpThrottle global jÃ¡ garante que a soma de
    // chamadas (deste + top10 + raio-x) nunca passa de 2.400/min, por isso
    // subir a concorrÃªncia aqui sÃ³ acelera o refresh, nÃ£o arrisca o limite.
    12
  )

  // Guardar em Redis
  await cacheService.set(CLAREZA_CACHE_KEY, results, CACHE_TTL)

  // Guardar em MongoDB (persistÃªncia durÃ¡vel â€” mesmo se Redis reiniciar)
  try {
    await ClarezaMarketData.create({
      fetchedAt:  new Date(),
      stockCount: UNIVERSE.length - errors,
      errors,
      stocks: results
    })
    // Manter apenas os Ãºltimos 5 snapshots
    const all = await ClarezaMarketData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map(d => d._id)
      await ClarezaMarketData.deleteMany({ _id: { $in: toDelete } })
    }
    console.log(`ðŸ’¾ [Clareza] Snapshot guardado na BD`)
  } catch (err: unknown) {
    console.error('âš ï¸ [Clareza] Erro ao guardar snapshot na BD:', errorMessage(err))
  }

  console.log(`âœ… [Clareza] Refresh completo â€” ${UNIVERSE.length - errors} ok, ${errors} erros`)

  return { total: UNIVERSE.length, errors }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET COM CACHE (Redis â†’ MongoDB â†’ FMP API)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getClarezaData(): Promise<ClarezaStockEntry[] | null> {
  // 1. Tentar Redis
  const cached = await cacheService.get<ClarezaStockEntry[]>(CLAREZA_CACHE_KEY)
  if (cached) return cached

  // 2. Redis miss â†’ tentar MongoDB (dados persistidos do Ãºltimo refresh)
  try {
    const latest = await ClarezaMarketData.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.stocks?.length) {
      console.log(`ðŸ“¦ [Clareza] Cache Redis vazio â€” a servir snapshot da BD (${latest.fetchedAt})`)
      // Repor em Redis para as prÃ³ximas chamadas
      await cacheService.set(CLAREZA_CACHE_KEY, latest.stocks, CACHE_TTL)
      return latest.stocks
    }
  } catch (err: unknown) {
    console.error('âš ï¸ [Clareza] Erro ao ler snapshot da BD:', errorMessage(err))
  }

  // 3. Nenhum dado disponivel. Nao chamar FMP em load publico.
  console.warn('[Clareza] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}
