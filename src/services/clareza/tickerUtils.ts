// ─────────────────────────────────────────────────────────────
// NORMALIZAÇÃO / VALIDAÇÃO DE TICKER — partilhado por todas as
// ferramentas Clareza (tremómetro, top10, raio-x, reit/stock).
//
// Suporta tickers internacionais com sufixo de bolsa (ex: RACE.MI,
// NESN.SW, SIE.DE, 005930.KS) além dos tickers US normais.
// ─────────────────────────────────────────────────────────────

// Sufixos de bolsa de UMA só letra. Colidem em forma com as classes de ações
// US (BRK.B) mas não são classes — têm de manter o ponto.
//   L = London Stock Exchange (IWDA.L, ULVR.L, DGE.L, DPLM.L, IUVD.L…)
const SINGLE_LETTER_EXCHANGES = new Set(['L'])

/**
 * Normaliza um ticker para o formato esperado pela FMP:
 *  • maiúsculas, sem espaços;
 *  • sufixo de UMA letra após o ponto (classe de ações US, ex: BRK.B)
 *    é convertido para traço → BRK-B, EXCETO quando essa letra é um
 *    sufixo de bolsa (ver SINGLE_LETTER_EXCHANGES);
 *  • sufixos de 2-3 letras após o ponto (bolsa internacional, ex:
 *    RACE.MI, NESN.SW, SIE.DE, ASML.AS) mantêm o ponto — a FMP usa-o
 *    literalmente para identificar a bolsa.
 *
 * Sem a exceção do .L, todo o ticker de Londres saía daqui como ULVR-L,
 * símbolo que a FMP não conhece → resposta vazia. Afetava 212 dos ativos
 * do universo do Raio-X da Carteira, incluindo o IWDA.L.
 */
export function normalizeTicker(raw: string): string {
  const t = String(raw || '').trim().toUpperCase()
  return t.replace(/^([A-Z0-9]+)\.([A-Z])$/, (match, base, suffix) =>
    SINGLE_LETTER_EXCHANGES.has(suffix) ? match : `${base}-${suffix}`
  )
}

/**
 * Valida um ticker já normalizado. Aceita início por letra OU dígito
 * (tickers como 005930.KS ou 000660.KS começam por dígito), letras,
 * dígitos, ponto e traço, até 10 caracteres.
 */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(ticker)
}
