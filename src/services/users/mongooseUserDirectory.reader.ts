import User from '../../models/user'
import type { UserDirectoryReader, UserDirectoryRecord } from './userDirectory.service'

type MongoFilter = Record<string, unknown>

const DIRECTORY_FIELDS =
  'name email username status combined hotmart curseduca discord discordIds hotmartUserId curseducaUserId'

/**
 * Owns the Mongoose reads for the user directory, moved verbatim from the
 * legacy handler: the same projected fields, skip/limit page and full count.
 */
export class MongooseUserDirectoryReader implements UserDirectoryReader {
  async findPage(filter: MongoFilter, skip: number, limit: number): Promise<UserDirectoryRecord[]> {
    return User.find(filter)
      .select(DIRECTORY_FIELDS)
      .skip(skip)
      .limit(limit)
      .lean<UserDirectoryRecord[]>()
  }

  count(filter: MongoFilter): Promise<number> {
    return User.countDocuments(filter)
  }
}
