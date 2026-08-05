import { UserProduct } from '../../models'
import User from '../../models/user'
import type {
  PopulatedUserProductRecord,
  StudentSearchCriteria,
  StudentSearchReader,
  UserTransformSource,
} from './studentSearch.contract'

type MongoFilter = Record<string, unknown>

const STUDENT_PROJECTION =
  'email name hotmart curseduca discord combined status metadata username tags notes source type deletedAt deletedBy communicationByCourse'
const PRODUCT_PROJECTION =
  'userId productId platform status classes enrolledAt isPrimary activeCampaignData'

export class MongooseStudentSearchReader implements StudentSearchReader {
  /**
   * The regexes are built from the raw term, unescaped and uncapped, exactly as
   * the legacy handler did. An invalid pattern throws from here and surfaces as
   * a 500, which is the current behaviour; hardening is a separate slice.
   */
  private buildFilter(criteria: StudentSearchCriteria): MongoFilter {
    const matchConditions: MongoFilter = {}
    const platformConditions: MongoFilter[] = []

    if (criteria.email) {
      matchConditions.email = { $regex: new RegExp(criteria.email, 'i') }
    }

    if (criteria.name) {
      matchConditions.name = { $regex: new RegExp(criteria.name, 'i') }
    }

    if (criteria.discordId) {
      platformConditions.push(
        { 'discord.discordIds': { $in: [criteria.discordId] } },
        { discordIds: { $in: [criteria.discordId] } },
      )
    }

    if (criteria.hotmartUserId) {
      platformConditions.push(
        { 'hotmart.hotmartUserId': criteria.hotmartUserId },
        { hotmartUserId: criteria.hotmartUserId },
      )
    }

    if (criteria.curseducaUserId) {
      platformConditions.push(
        { 'curseduca.curseducaUserId': criteria.curseducaUserId },
        { curseducaUserId: criteria.curseducaUserId },
      )
    }

    if (platformConditions.length > 0) {
      matchConditions.$or = platformConditions
    }

    return matchConditions
  }

  async findStudents(criteria: StudentSearchCriteria): Promise<UserTransformSource[]> {
    return User.find(this.buildFilter(criteria))
      .select(STUDENT_PROJECTION)
      .lean<UserTransformSource[]>()
  }

  async findProducts(userIds: unknown[]): Promise<PopulatedUserProductRecord[]> {
    return UserProduct.find({ userId: { $in: userIds } })
      .populate('productId', 'code name')
      .select(PRODUCT_PROJECTION)
      .lean<PopulatedUserProductRecord[]>()
  }
}
