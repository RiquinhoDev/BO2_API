// Pure field/coercion helpers for the universal sync pipeline. No I/O, no
// module state, no clock — safe to share and unit-test in isolation.

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

export const getDocId = (doc: unknown, label: string): string => {
  const d = doc as { _id?: unknown; id?: unknown }
  const raw = d?._id ?? d?.id

  if (raw === undefined || raw === null) {
    throw new Error(`${label} sem _id/id`)
  }

  return String(raw)
}

export const toDateOrNull = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

export const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const mongoErrorCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'number' ? error.code : undefined
}
