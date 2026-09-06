import { HttpError } from '../../../security/errorHandling'
import { MAX_PROVIDER_READ_ITEMS } from '../../../security/providerReadBatchPolicy'

export const WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS = MAX_PROVIDER_READ_ITEMS
export const WEEKLY_TAG_SNAPSHOT_CLEANUP_MAX_CANDIDATES = MAX_PROVIDER_READ_ITEMS
export const WEEKLY_TAG_SNAPSHOT_MAX_NOTIFICATION_DETAILS = MAX_PROVIDER_READ_ITEMS

export class WeeklyTagSnapshotLimitError extends HttpError {
  constructor() {
    super({
      status: 413,
      code: 'WEEKLY_TAG_SNAPSHOT_LIMIT_EXCEEDED',
      publicMessage: `Snapshot semanal limitado a ${WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS} contactos`,
    })
  }
}

export class WeeklyTagCriticalTagLimitError extends HttpError {
  constructor() {
    super({
      status: 413,
      code: 'WEEKLY_TAG_CRITICAL_TAG_LIMIT_EXCEEDED',
      publicMessage: `Snapshot semanal limitado a ${WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS} tags críticas`,
    })
  }
}

export class WeeklyTagNotificationLimitError extends HttpError {
  constructor() {
    super({
      status: 413,
      code: 'WEEKLY_TAG_NOTIFICATION_LIMIT_EXCEEDED',
      publicMessage: `Notificações semanais limitadas a ${WEEKLY_TAG_SNAPSHOT_MAX_NOTIFICATION_DETAILS} detalhes`,
    })
  }
}
