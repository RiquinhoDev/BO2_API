import inventory from '../../src/contracts/response-migration-inventory.json'

const integratedIdentities = [
  'DELETE /api/sync/history/clean',
  'DELETE /api/tag-monitoring/critical-tags/:id/permanent',
  'DELETE /api/tag-rules/:id',
  'DELETE /api/testimonials/:id',
  'GET /api/ac/contact/:email/tags',
  'GET /api/activecampaign/cron-logs',
  'GET /api/activecampaign/product-tags/stats',
  'GET /api/classes/users/search',
  'GET /api/discord-renewal/scheduled/:key/preview',
  'GET /api/guru/analytics/fix-multi-subscriptions',
  'GET /api/guru/analytics/mrr',
  'GET /api/guru/stats',
  'GET /api/guru/sync/all',
  'GET /api/guru/sync/email/:email',
  'GET /api/guru/sync/preview',
  'GET /api/guru/sync/stats',
  'GET /api/guru/sync/users',
  'GET /api/guru/webhooks',
  'GET /api/guru/webhooks/grouped-by-month',
  'GET /api/sync/stats',
  'GET /api/tag-rules',
  'PATCH /api/renewal/offers/:id',
  'POST /api/analytics/product-sales/rebuild',
  'POST /api/course-lessons/sync',
  'POST /api/discord-renewal/execute',
  'POST /api/discord-renewal/scheduled/:key/test',
  'POST /api/events/:id/interest',
  'POST /api/guru/inactivation/bulk',
  'POST /api/guru/inactivation/cleanup-duplicates',
  'POST /api/guru/inactivation/fix-to-active',
  'POST /api/guru/inactivation/mark-discrepancies',
  'POST /api/guru/inactivation/mark-stale-inactive',
  'POST /api/guru/inactivation/quarantine',
  'POST /api/guru/inactivation/restore',
  'POST /api/guru/inactivation/revert',
  'POST /api/guru/inactivation/single',
  'POST /api/guru/trials/check-expired',
  'POST /api/guru/trials/inactivate',
  'POST /api/guru/trials/revert',
  'POST /api/guru/trials/sync',
  'POST /api/guru/webhooks/migrate-source',
  'POST /api/renewal-ac/changes/:id/revert',
  'POST /api/renewal-ac/execute',
  'POST /api/renewal/offers',
  'POST /api/renewal/sync',
  'POST /api/sync/history',
  'POST /api/sync/history/:syncId/retry',
  'POST /api/tag-rules/:id/test',
  'POST /api/testimonials',
  'POST /api/testimonials/request',
  'PUT /api/course-lessons/:pageId',
  'PUT /api/testimonials/:id',
] as const

test('records the exact final 52-identity integration', () => {
  expect(integratedIdentities).toHaveLength(52)
  for (const identity of integratedIdentities) {
    expect(inventory.find(entry => entry.identity === identity)).toMatchObject({
      currentFamily: 'success-data',
      targetFamily: 'success-data',
      status: 'complete',
    })
  }
  expect(inventory.filter(entry => entry.status === 'complete')).toHaveLength(374)
  expect(inventory.filter(entry => entry.status === 'pending-migration')).toHaveLength(38)
})
