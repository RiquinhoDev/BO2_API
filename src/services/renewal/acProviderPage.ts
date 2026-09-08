export function readProviderArray<T>(
  data: unknown,
  key: string,
  requestedLimit: number,
  errorPrefix: string,
): T[] {
  if (!data || typeof data !== 'object') throw new Error(`${errorPrefix}_INVALID_RESPONSE`)
  const page = (data as Record<string, unknown>)[key]
  if (!Array.isArray(page)) throw new Error(`${errorPrefix}_INVALID_RESPONSE`)
  if (page.length > requestedLimit) {
    throw new Error(`${errorPrefix}_PAGE_EXCEEDS_REQUESTED_LIMIT`)
  }
  return page as T[]
}
