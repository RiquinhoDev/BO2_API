// ─────────────────────────────────────────────────────────────
// LIMITADOR GLOBAL DE CHAMADAS À FMP
//
// Partilhado por TODAS as ferramentas Clareza (tremómetro, top10, raio-x —
// refresh e on-demand). Garante que a SOMA das chamadas à FMP nunca passa do
// limite do plano, evitando rejeições "Over Limit".
//
// Plano Ultimate: 3.000 chamadas/min. Fica-se pelos ~80% (2.400/min) para
// deixar margem a outras integrações que partilhem a mesma chave/conta e a
// picos de pesquisas on-demand em simultâneo com o cron.
//
// Token bucket:
//  • refill 2.400/min (40/s) → ritmo sustentado, com margem vs 3.000/min;
//  • capacidade 150          → cobre o burst de uma pesquisa on-demand
//                               (~15-20 chamadas/empresa) quase instantâneo,
//                               mesmo com o universo (mais tickers) a
//                               refrescar em paralelo no cron.
//
// Pior caso em qualquer janela de 60s ≈ capacidade + refill = 150 + 2400
// = 2550 chamadas → sempre < 3000. Assume 1 instância do processo (sem
// réplicas). Se subires de plano outra vez, sobe REFILL_PER_MIN/CAPACITY
// na mesma proporção (~80% do limite/min do plano).
// ─────────────────────────────────────────────────────────────

const CAPACITY = 150
const REFILL_PER_MIN = 2400
const REFILL_PER_MS = REFILL_PER_MIN / 60000

let tokens = CAPACITY
let last = Date.now()
const waiters: Array<() => void> = []
let timer: NodeJS.Timeout | null = null

function refill(): void {
  const now = Date.now()
  if (now > last) {
    tokens = Math.min(CAPACITY, tokens + (now - last) * REFILL_PER_MS)
    last = now
  }
}

function drain(): void {
  refill()
  while (tokens >= 1 && waiters.length) {
    tokens -= 1
    waiters.shift()!()
  }
  if (waiters.length && !timer) {
    const waitMs = Math.max(10, Math.ceil((1 - tokens) / REFILL_PER_MS))
    timer = setTimeout(() => { timer = null; drain() }, waitMs)
  }
}

/**
 * Aguarda autorização para fazer UMA chamada à FMP. Resolve de imediato quando
 * há tokens (e ninguém à espera); caso contrário entra em fila FIFO e é servido
 * ao ritmo do refill. Chamar uma vez por cada request à FMP.
 */
export function fmpThrottle(): Promise<void> {
  return new Promise<void>((resolve) => {
    refill()
    if (tokens >= 1 && waiters.length === 0) {
      tokens -= 1
      resolve()
      return
    }
    waiters.push(resolve)
    drain()
  })
}
