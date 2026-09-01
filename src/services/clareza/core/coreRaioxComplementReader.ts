import ClarezaRaioxData from '../../../models/ClarezaRaioxData'

type JsonRecord = Readonly<Record<string, unknown>>
export interface CoreHistoryComplement {
  readonly annualIncome: readonly JsonRecord[]
  readonly earnings: readonly JsonRecord[]
}

const record = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const history = (value: unknown): readonly JsonRecord[] => (
  Array.isArray(value) ? value.filter(record).slice(0, 12) : []
)

export function projectRaioxComplements(
  stocks: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, CoreHistoryComplement> {
  const result = new Map<string, CoreHistoryComplement>()
  for (const [rawTicker, rawPayload] of Object.entries(stocks)) {
    const ticker = rawTicker.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9.-]{0,24}$/.test(ticker) || !record(rawPayload)) continue
    result.set(ticker, {
      annualIncome: history(rawPayload.inc),
      earnings: history(rawPayload.ea),
    })
  }
  return result
}

export async function readLatestRaioxComplements(): Promise<ReadonlyMap<string, CoreHistoryComplement>> {
  const latest = await ClarezaRaioxData.findOne({}, { stocks: 1 }).sort({ fetchedAt: -1 }).lean()
  return projectRaioxComplements(latest?.stocks ?? {})
}
