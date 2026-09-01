export const CLAREZA_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60

// Keep one extra daily window. A delayed or failed refresh must not evict the
// last known-good payload before the next scheduled attempt.
export const CLAREZA_DAILY_CACHE_TTL_SECONDS = 2 * CLAREZA_REFRESH_INTERVAL_SECONDS
