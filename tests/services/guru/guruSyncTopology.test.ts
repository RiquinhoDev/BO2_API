import guruSync, * as facade from '../../../src/services/guru/guruSync.service'
import * as client from '../../../src/services/guru/sync/client'
import * as persistence from '../../../src/services/guru/sync/persistence'
import * as orchestration from '../../../src/services/guru/sync/orchestration'

describe('Guru sync topology', () => {
  it('keeps every public function delegated through the compatibility facade', () => {
    expect(facade.fetchAllSubscriptions).toBe(client.fetchAllSubscriptions)
    expect(facade.fetchAllSubscriptionsPaginated).toBe(client.fetchAllSubscriptionsPaginated)
    expect(facade.fetchSubscriptionsByMonth).toBe(client.fetchSubscriptionsByMonth)
    expect(facade.fetchAllSubscriptionsComplete).toBe(client.fetchAllSubscriptionsComplete)
    expect(facade.fetchSubscriptionById).toBe(client.fetchSubscriptionById)
    expect(facade.fetchContactByEmail).toBe(client.fetchContactByEmail)
    expect(facade.fetchContactSubscriptions).toBe(client.fetchContactSubscriptions)
    expect(facade.saveSubscriptionToDb).toBe(persistence.saveSubscriptionToDb)
    expect(facade.syncAllSubscriptions).toBe(orchestration.syncAllSubscriptions)
    expect(facade.checkEmailInGuru).toBe(orchestration.checkEmailInGuru)

    expect(guruSync.fetchAllSubscriptions).toBe(client.fetchAllSubscriptions)
    expect(guruSync.saveSubscriptionToDb).toBe(persistence.saveSubscriptionToDb)
    expect(guruSync.syncAllSubscriptions).toBe(orchestration.syncAllSubscriptions)
  })
})
