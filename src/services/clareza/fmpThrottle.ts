// ─────────────────────────────────────────────────────────────
// LIMITADOR GLOBAL DE CHAMADAS À FMP
//
// Partilhado por TODAS as ferramentas Clareza (tremómetro, top10, raio-x —
// refresh e on-demand). Garante que a SOMA das chamadas à FMP nunca passa do
// limite do plano (300/min), evitando rejeições "Over Limit".
//
// Token bucket:
//  • refill 240/min  → ritmo sustentado, com margem de segurança vs 300/min;
//  • capacidade 30   → permite um burst curto (ex.: 1 pesquisa on-demand de
//                       ~14 chamadas é servida de imediato quando há folga).
//
// Pior caso em qualquer janela de 60s ≈ capacidade + refill = 30 + 240 = 270
// chamadas → sempre < 300. Assume 1 instância do processo (sem réplicas).
// ─────────────────────────────────────────────────────────────

const CAPACITY = 30
const REFILL_PER_MIN = 240
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
