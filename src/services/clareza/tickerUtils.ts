// ─────────────────────────────────────────────────────────────
// NORMALIZAÇÃO / VALIDAÇÃO DE TICKER — partilhado por todas as
// ferramentas Clareza (tremómetro, top10, raio-x, reit/stock).
//
// Suporta tickers internacionais com sufixo de bolsa (ex: RACE.MI,
// NESN.SW, SIE.DE, 005930.KS) além dos tickers US normais.
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza um ticker para o formato esperado pela FMP:
 *  • maiúsculas, sem espaços;
 *  • sufixo de UMA letra após o ponto (classe de ações US, ex: BRK.B)
 *    é convertido para traço → BRK-B;
 *  • sufixos de 2-3 letras após o ponto (bolsa internacional, ex:
 *    RACE.MI, NESN.SW, SIE.DE, ASML.AS) mantêm o ponto — a FMP usa-o
 *    literalmente para identificar a bolsa.
 */
export function normalizeTicker(raw: string): string {
  const t = String(raw || '').trim().toUpperCase()
  return t.replace(/^([A-Z0-9]+)\.([A-Z])$/, '$1-$2')
}

/**
 * Valida um ticker já normalizado. Aceita início por letra OU dígito
 * (tickers como 005930.KS ou 000660.KS começam por dígito), letras,
 * dígitos, ponto e traço, até 10 caracteres.
 */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(ticker)
}
