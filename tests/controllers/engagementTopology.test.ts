import * as facade from '../../src/controllers/engagement.controller'
import * as summary from '../../src/controllers/engagement/summary.controller'
import * as users from '../../src/controllers/engagement/users.controller'
import * as stats from '../../src/controllers/engagement/stats.controller'
import * as details from '../../src/controllers/engagement/details.controller'

test('Engagement facade delegates every handler to a focused owner', () => {
  expect(facade.getGlobalEngagementStats).toBe(summary.getGlobalEngagementStats)
  expect(facade.clearEngagementCache).toBe(summary.clearEngagementCache)
  expect(facade.getUsersEngagementDetails).toBe(users.getUsersEngagementDetails)
  expect(facade.getEngagementStats).toBe(stats.getEngagementStats)
  expect(facade.getEngagementDetails).toBe(details.getEngagementDetails)
})
