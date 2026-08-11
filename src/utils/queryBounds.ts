export const MAX_QUERY_LIMIT = 200

export function boundedQueryLimit(value: unknown, fallback = 100): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(fallback, MAX_QUERY_LIMIT)
  return Math.min(Math.floor(parsed), MAX_QUERY_LIMIT)
}
