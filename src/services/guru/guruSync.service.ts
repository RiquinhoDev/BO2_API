import {
  fetchAllSubscriptions,
  fetchAllSubscriptionsPaginated,
  fetchSubscriptionsByMonth,
  fetchAllSubscriptionsComplete,
  fetchSubscriptionById,
  fetchContactByEmail,
  fetchContactSubscriptions,
} from './sync/client'
import { saveSubscriptionToDb } from './sync/persistence'
import { syncAllSubscriptions, checkEmailInGuru } from './sync/orchestration'

export type { GuruSubscription } from './sync/client'
export {
  fetchAllSubscriptions,
  fetchAllSubscriptionsPaginated,
  fetchSubscriptionsByMonth,
  fetchAllSubscriptionsComplete,
  fetchSubscriptionById,
  fetchContactByEmail,
  fetchContactSubscriptions,
  saveSubscriptionToDb,
  syncAllSubscriptions,
  checkEmailInGuru,
}

export default {
  fetchAllSubscriptions,
  fetchAllSubscriptionsPaginated,
  fetchSubscriptionsByMonth,
  fetchAllSubscriptionsComplete,
  fetchSubscriptionById,
  fetchContactByEmail,
  fetchContactSubscriptions,
  saveSubscriptionToDb,
  syncAllSubscriptions,
  checkEmailInGuru,
}
