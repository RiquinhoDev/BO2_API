import { timingSafeEqual } from 'node:crypto'
import { getClarezaRefreshToken } from '../services/requestDrivenRuntimeConfig'

export function isClarezaRefreshAuthorized(providedToken: string): boolean {
  const expectedToken = getClarezaRefreshToken()
  if (!expectedToken || !providedToken) return false

  const expected = Buffer.from(expectedToken)
  const provided = Buffer.from(providedToken)
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}
