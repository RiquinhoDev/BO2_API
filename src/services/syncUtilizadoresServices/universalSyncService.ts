// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/universalSyncService.ts
// Thin barrel over the universalSync/* modules. Kept so existing consumers
// (default.executeUniversalSync) and tests keep importing from this path; the
// consumers are rewired and this file removed in the following slices.
// ════════════════════════════════════════════════════════════

import { executeUniversalSync } from './universalSync/executeUniversalSync'

export { executeUniversalSync } from './universalSync/executeUniversalSync'
export { calculateEngagementMetricsForUserProduct } from './universalSync/engagement/engagementMetrics'
export { clearProductsCache } from './universalSync/productsCache'
export { buildCanonicalActiveUserStatusUpdate } from './universalSync/canonicalUserStatus'

export default {
  executeUniversalSync
}
