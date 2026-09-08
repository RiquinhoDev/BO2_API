import { HttpError } from '../security/errorHandling'

/** Bound offset traversal as well as each page; callers must surface an incomplete scan. */
export function renewalReadOffset(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new HttpError({ status: 400, code: 'INVALID_PAGE_OFFSET', publicMessage: 'offset inválido' })
  }
  const offset = Number(value)
  if (!Number.isSafeInteger(offset) || offset > 100_000) {
    throw new HttpError({ status: 400, code: 'INVALID_PAGE_OFFSET', publicMessage: 'offset fora do limite de leitura' })
  }
  return offset
}
