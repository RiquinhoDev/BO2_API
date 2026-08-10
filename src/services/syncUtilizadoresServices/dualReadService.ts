import { warmUpCache, clearUnifiedCache, getAllUsersUnified, getUniqueUsersFromUnified, getCacheStats } from './dualRead/runtime'

export type { UnifiedUserProduct } from './dualRead/mapping'
export { warmUpCache, clearUnifiedCache, getAllUsersUnified, getUniqueUsersFromUnified, getCacheStats }

export default {
  getAllUsersUnified,
  getUniqueUsersFromUnified,
  warmUpCache,
  clearUnifiedCache,
  getCacheStats,
}
