import * as facade from '../../src/controllers/guru.analytics.controller'
import * as churn from '../../src/controllers/guruAnalytics/churn.controller'
import * as comparison from '../../src/controllers/guruAnalytics/comparison.controller'
import * as subscriptions from '../../src/controllers/guruAnalytics/subscriptionRepair.controller'

test('Guru analytics facade delegates every handler to a focused owner', () => {
  expect(facade.getChurnLiveStatus).toBe(churn.getChurnLiveStatus)
  expect(facade.getChurnLive).toBe(churn.getChurnLive)
  expect(facade.getChurnMetrics).toBe(churn.getChurnMetrics)
  expect(facade.getMRRMetrics).toBe(churn.getMRRMetrics)
  expect(facade.compareGuruVsClareza).toBe(comparison.compareGuruVsClareza)
  expect(facade.fixMultiSubscriptions).toBe(subscriptions.fixMultiSubscriptions)
})
