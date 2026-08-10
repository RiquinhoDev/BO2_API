// ════════════════════════════════════════════════════════════
// 📁 universalSync — public barrel for the universal-sync module.
// The single import surface for consumers: the orchestration entry point plus
// the few helpers that were historically re-exported from universalSyncService.
// ════════════════════════════════════════════════════════════

import { executeUniversalSync } from './executeUniversalSync'

export { executeUniversalSync } from './executeUniversalSync'
export { calculateEngagementMetricsForUserProduct } from './engagement/engagementMetrics'
export { clearProductsCache } from './productsCache'
export { buildCanonicalActiveUserStatusUpdate } from './canonicalUserStatus'

export default {
  executeUniversalSync
}
