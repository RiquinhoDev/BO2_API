import {
  getPublishedCarteira,
  getPublishedEarnings,
  getPublishedLegacyMarketData,
  getPublishedRadar,
  getPublishedTop10,
} from './corePublished.runtime'
import logger from '../../../utils/logger'

// Aquece a cache Redis destas leituras logo a seguir à publicação, de
// madrugada — visto em produção: a Mongo pode ter um soluço (15-20s numa
// leitura trivial, mesmo indexada). Se acontecer aqui, é o job a aguentar
// sozinho às 03h, não quem visita o site às 9h. Cada leitura é
// independente e melhor esforço: uma falhar não impede as outras, e
// nenhuma falha aqui derruba o resultado do dia (ver warmBestEffort em
// clareza.job.ts).
const WARM_READS: readonly (readonly [string, () => Promise<unknown>])[] = [
  ['radar', () => getPublishedRadar()],
  ['data', () => getPublishedLegacyMarketData()],
  ['carteira', () => getPublishedCarteira()],
  ['earnings', () => getPublishedEarnings()],
  ['top10', () => getPublishedTop10()],
]

export async function warmPublishedReadsCache(): Promise<void> {
  await Promise.all(WARM_READS.map(async ([name, read]) => {
    try {
      await read()
    } catch (error) {
      logger.error(`Clareza cache warmup: ${name} failed`, error)
    }
  }))
}
