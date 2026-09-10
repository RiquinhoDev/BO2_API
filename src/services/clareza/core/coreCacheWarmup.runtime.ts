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
// agregada. Aquece-se cada uma. Em lotes para não abrir centenas de
// ligações à Mongo de uma vez; é um job de fundo, ninguém espera.
// (Optimização futura: cada asset() volta a ler a coleção inteira de
// companions — dava para carregar uma vez e reaproveitar.)
const RAIOX_WARM_BATCH = 12
// Quando o Atlas está lento, uma leitura passa do maxTimeMS e falha. Não
// vale a pena deixar o símbolo frio até à próxima noite: repete-se, mais
// devagar, os que faltaram — os soluços do Atlas são intermitentes.
const RAIOX_RETRY_BATCH = 4
const RAIOX_RETRY_PASSES = 3

async function warmInBatches<T>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(work))
  }
}

async function warmPass(
  tickers: readonly string[],
  batch: number,
): Promise<string[]> {
  const failures: string[] = []
  await warmInBatches(tickers, batch, async (ticker) => {
    try {
      await getPublishedRaiox.refresh(ticker)
    } catch {
      failures.push(ticker)
    }
  })
  return failures
}

async function warmRaioxSymbols(): Promise<void> {
  const total = selectRaioxUniverse().length
  let pending = selectRaioxUniverse().map((asset) => asset.ticker)

  pending = await warmPass(pending, RAIOX_WARM_BATCH)
  for (let pass = 0; pass < RAIOX_RETRY_PASSES && pending.length > 0; pass += 1) {
    pending = await warmPass(pending, RAIOX_RETRY_BATCH)
  }

  if (pending.length > 0) {
    logger.warn(
      `Clareza cache warmup: raiox ficou frio em ${pending.length}/${total} símbolos ` +
        `após ${RAIOX_RETRY_PASSES + 1} passagens`,
    )
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
