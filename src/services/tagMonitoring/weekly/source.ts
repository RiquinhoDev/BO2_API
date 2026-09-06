import activeCampaignService from '../../activeCampaign/activeCampaignService'
import User from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import logger from '../../../utils/logger'
import {
  assertOwnership,
  type EmailSelection,
  type WeeklyTagSnapshotOptions,
  uniqueEmails,
} from './contracts'
import {
  WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS,
  WeeklyTagSnapshotLimitError,
} from './limits'

export async function getEmailsToProcess(
  mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS',
  options: WeeklyTagSnapshotOptions,
): Promise<EmailSelection> {
  if (mode === 'STUDENTS_ONLY') {
    assertOwnership(options)
    const userProducts = await UserProduct.aggregate<{ _id: string }>([
      { $match: { userId: { $exists: true } } },
      { $group: { _id: '$userId' } },
      { $sort: { _id: 1 } },
      { $limit: WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS + 1 },
    ]).exec()
    assertOwnership(options)

    const truncated = userProducts.length > WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS
    if (truncated && options.dryRun !== true) throw new WeeklyTagSnapshotLimitError()
    const userIds = userProducts
      .slice(0, WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS)
      .map(row => row._id)
    if (userIds.length === 0) return { emails: [], truncated, remaining: truncated ? 1 : 0 }

    assertOwnership(options)
    const users = await User.find({ _id: { $in: userIds } })
      .select('email')
      .sort({ _id: 1 })
      .limit(userIds.length)
      .lean()
      .exec()
    assertOwnership(options)
    const emails = uniqueEmails(users.map(user => user.email))
    logger.info(`📊 STUDENTS_ONLY: ${emails.length} alunos encontrados (ACTIVE + INACTIVE)`)
    return { emails, truncated, remaining: truncated ? 1 : 0 }
  }

  assertOwnership(options)
  options.phaseHooks?.providerStarted()
  const allContacts = await activeCampaignService.getAllContactsBounded(WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS)
  assertOwnership(options)
  options.phaseHooks?.providerSucceeded()
  if (allContacts.truncated && options.dryRun !== true) throw new WeeklyTagSnapshotLimitError()
  const emails = uniqueEmails(allContacts.contacts.map(contact => contact.email))
  logger.info(`📊 ALL_CONTACTS: ${emails.length} contactos da AC`)
  return {
    emails,
    truncated: allContacts.truncated,
    remaining: allContacts.remaining,
  }
}
