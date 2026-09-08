// ════════════════════════════════════════════════════════════
// 📁 src/utils/currencyEstimate.ts
// Estimativa aproximada em EUR de valores multi-moeda — câmbios FIXOS
// (não em tempo real), só para dar ordem de grandeza. Editáveis por
// env var (FX_RATE_<MOEDA>_EUR) sem precisar de deploy.
// ════════════════════════════════════════════════════════════

import { getRenewalParitySettings } from '../config/renewalEnvironment'

export interface EurEstimate {
  estimatedTotalEUR: number
  unconvertedCurrencies: string[]
}

export function estimateEUR(byCurrency: Record<string, number>): EurEstimate {
  const rates: Readonly<Record<string, number>> = {
    EUR: 1,
    ...getRenewalParitySettings().fxRatesToEur,
  }
  let total = 0
  const unconvertedCurrencies: string[] = []
  for (const [currency, amount] of Object.entries(byCurrency)) {
    const rate = rates[currency]
    if (rate == null) {
      unconvertedCurrencies.push(currency)
      continue
    }
    total += amount * rate
  }
  return { estimatedTotalEUR: Math.round(total * 100) / 100, unconvertedCurrencies }
}

export default estimateEUR
