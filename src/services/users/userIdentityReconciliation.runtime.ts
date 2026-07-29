import { MongooseUserIdentityReconciliationRepository } from './mongooseUserIdentityReconciliation.repository'
import { UserIdentityReconciliationService } from './userIdentityReconciliation.service'

export const userIdentityReconciliationService =
  new UserIdentityReconciliationService(
    new MongooseUserIdentityReconciliationRepository(),
  )
