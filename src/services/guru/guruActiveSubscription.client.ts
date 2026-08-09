import { GURU_ACTIVE_STATUSES } from './guru.constants'
import { fetchContactByEmail, fetchContactSubscriptions } from './guruSync.service'

export interface GuruActiveSubscriptionLookup {
  hasActiveSubscription(email: string): Promise<boolean>
}

const isActive = (status: string): boolean =>
  GURU_ACTIVE_STATUSES.includes(status)
  || status === 'paid'
  || status === 'trialing'

export const guruActiveSubscriptionLookup: GuruActiveSubscriptionLookup = {
  async hasActiveSubscription(email) {
    const contact = await fetchContactByEmail(email)
    if (!contact?.id) return false
    const subscriptions = await fetchContactSubscriptions(String(contact.id))
    return subscriptions.some(subscription => isActive(
      (subscription.last_status || subscription.status || '').toLowerCase(),
    ))
  },
}