import {
  getPublishedCarteira,
  getPublishedEarnings,
  getPublishedLegacyMarketData,
  getPublishedRadar,
  getPublishedRaiox,
  getPublishedTop10,
} from './corePublished.runtime'
import { selectRaioxUniverse } from '../universe/clarezaUniverse.catalog'
import logger from '../../../utils/logger'

// Aquece a cache Redis logo a seguir à publicação (de madrugada) e a cada
// arranque do processo. Usa `.refresh()`, não uma leitura normal: com o TTL
// longo, um `get` devolveria o valor de ontem e a geração nova nunca
// entrava. Cada peça é melhor-esforço: uma falhar não impede as outras, e
// nenhuma falha aqui derruba o resultado do dia (ver warmBestEffort em
// clareza.job.ts). Depois disto correr, ninguém que visite o site durante o
// dia toca na Mongo.
const WARM_READS: readonly (readonly [string, () => Promise<unknown>])[] = [
  ['radar', () => getPublishedRadar.refresh()],
  ['data', () => getPublishedLegacyMarketData.refresh()],
  ['carteira', () => getPublishedCarteira.refresh()],
  ['earnings', () => getPublishedEarnings.refresh()],
  ['top10', () => getPublishedTop10.refresh()],
]

// O Raio-X da Ação é por símbolo (~350 chaves), nunca cabia numa leitura
// agregada. Aquece-se cada uma. Em lotes para não abrir 350 ligações à
// Mongo de uma vez; 12 de cada vez chega e é um job de fundo, ninguém
// espera. (Optimização futura: cada asset() volta a ler a coleção inteira
// de companions — dava para carregar uma vez e reaproveitar.)
const RAIOX_WARM_BATCH = 12

async function warmInBatches<T>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(work))
  }
}

async function warmRaioxSymbols(): Promise<void> {
  const tickers = selectRaioxUniverse().map((asset) => asset.ticker)
  let failed = 0
  await warmInBatches(tickers, RAIOX_WARM_BATCH, async (ticker) => {
    try {
      await getPublishedRaiox.refresh(ticker)
    } catch {
      failed += 1
    }
  })
  if (failed > 0) {
    logger.warn(`Clareza cache warmup: raiox falhou em ${failed}/${tickers.length} símbolos`)
  }
}

export async function warmPublishedReadsCache(): Promise<void> {
  await Promise.all(
    WARM_READS.map(async ([name, read]) => {
      try {
        await read()
      } catch (error) {
        logger.error(`Clareza cache warmup: ${name} failed`, error)
      }
    }),
  )
  await warmRaioxSymbols()
}
