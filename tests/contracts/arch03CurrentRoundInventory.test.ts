import inventory from '../../src/contracts/response-migration-inventory.json'

const integratedIdentities = [
  'DELETE /api/cron/jobs/:id',
  'DELETE /api/products/:id',
  'GET /api/analytics/class/:classId',
  'GET /api/analytics/class/:classId/alerts',
  'GET /api/analytics/class/:classId/engagement',
  'GET /api/analytics/class/:classId/health',
  'GET /api/analytics/health-score/:classId',
  'GET /api/analytics/outdated',
  'GET /api/analytics/product-sales/period',
  'GET /api/classes/:classId/details',
  'GET /api/classes/fetchClassData',
  'GET /api/classes/history',
  'GET /api/classes/studentHistory/:discordId',
  'GET /api/classes/studentHistoryByEmail/:email',
  'GET /api/cron/jobs/:id',
  'GET /api/events/:id',
  'GET /api/events/upcoming',
  'GET /api/products/:id',
  'GET /api/products/:id/analytics',
  'GET /api/products/:id/students',
  'GET /api/products/engagement-stats',
  'GET /api/products/users',
  'GET /api/sync/reports/:id',
  'GET /api/sync/reports/stats',
  'GET /api/testimonials/report',
  'GET /api/users/idsDiferentes',
  'GET /api/users/unmatchedUsers',
  'POST /api/analytics/class/:classId/recalculate',
  'POST /api/cron/jobs',
  'POST /api/cron/jobs/:id/toggle',
  'POST /api/cron/jobs/:id/trigger',
  'POST /api/events/types',
  'POST /api/products',
  'PUT /api/cron/jobs/:id',
  'PUT /api/events/types/:id',
  'PUT /api/products/:id',
] as const

test('records the factual 36-identity ARCH03 round without counting a planned no-op', () => {
  expect(integratedIdentities).toHaveLength(36)
  for (const identity of integratedIdentities) {
    expect(inventory.find(entry => entry.identity === identity)).toMatchObject({
      currentFamily: 'success-data',
      targetFamily: 'success-data',
      status: 'complete',
    })
  }
})
