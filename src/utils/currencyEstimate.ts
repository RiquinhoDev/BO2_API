// ════════════════════════════════════════════════════════════
// 📁 src/utils/currencyEstimate.ts
// Estimativa aproximada em EUR de valores multi-moeda — câmbios FIXOS
// (não em tempo real), só para dar ordem de grandeza. Editáveis por
// env var (FX_RATE_<MOEDA>_EUR) sem precisar de deploy.
// ════════════════════════════════════════════════════════════

const APPROX_EUR_RATE: Record<string, number> = {
  EUR: 1,
  USD: Number(process.env.FX_RATE_USD_EUR) || 0.92,
  GBP: Number(process.env.FX_RATE_GBP_EUR) || 1.17,
  CHF: Number(process.env.FX_RATE_CHF_EUR) || 1.05,
  CAD: Number(process.env.FX_RATE_CAD_EUR) || 0.68,
  BRL: Number(process.env.FX_RATE_BRL_EUR) || 0.16
}

export interface EurEstimate {
  estimatedTotalEUR: number
  unconvertedCurrencies: string[]
}

export function estimateEUR(byCurrency: Record<string, number>): EurEstimate {
  let total = 0
  const unconvertedCurrencies: string[] = []
  for (const [currency, amount] of Object.entries(byCurrency)) {
    const rate = APPROX_EUR_RATE[currency]
    if (rate == null) {
      unconvertedCurrencies.push(currency)
      continue
    }
    total += amount * rate
  }
  return { estimatedTotalEUR: Math.round(total * 100) / 100, unconvertedCurrencies }
}

export default estimateEUR
