import mongoose from 'mongoose'
import StudentClassHistory, { type IStudentClassHistory } from '../../models/StudentClassHistory'
import SyncHistory, { type ISyncHistory } from '../../models/SyncHistory'
import User from '../../models/user'
import UserHistory, { type IUserHistory } from '../../models/UserHistory'
import type {
  ClassHistoryRow,
  StudentHistoryIdentity,
  StudentHistorySourcesReader,
  StudentHistoryStudentReader,
  SyncHistoryRow,
  UserHistoryRow,
} from './studentHistory.contract'

const CLASS_HISTORY_LIMIT = 20
const SYNC_HISTORY_LIMIT = 10

export class MongooseStudentHistoryStudentReader implements StudentHistoryStudentReader {
  async findForHistory(id: string): Promise<StudentHistoryIdentity | null> {
    const student = await User.findById(id)
    if (!student) return null

    // Pre-segregation documents kept these at the top level.
    const legacyDiscordIds: unknown = student.get('discordIds')
    const legacyHotmartUserId: unknown = student.get('hotmartUserId')
    const legacyCurseducaUserId: unknown = student.get('curseducaUserId')

    return {
      id: student._id,
      email: student.email,
      name: student.name,
      hasDiscord: !!(
        student.discord?.discordIds?.length ||
        (Array.isArray(legacyDiscordIds) && legacyDiscordIds.length)
      ),
      hasHotmart: !!(
        student.hotmart?.hotmartUserId ||
        (typeof legacyHotmartUserId === 'string' && legacyHotmartUserId)
      ),
      hasCurseduca: !!(
        student.curseduca?.curseducaUserId ||
        (typeof legacyCurseducaUserId === 'string' && legacyCurseducaUserId)
      ),
    }
  }
}

export class MongooseStudentHistorySourcesReader implements StudentHistorySourcesReader {
  /** Throws on an id that is not a valid ObjectId; the service degrades it. */
  async readUserHistory(
    id: string,
    email: string | undefined,
    limit: number,
  ): Promise<UserHistoryRow[]> {
    return UserHistory.find({
      $or: [
        { userId: new mongoose.Types.ObjectId(id) },
        { userEmail: email },
      ],
    })
      .sort({ changeDate: -1 })
      .limit(limit)
      .populate('syncId', 'startTime endTime status totalUsers source')
      .lean<IUserHistory[]>() as unknown as Promise<UserHistoryRow[]>
  }

  async readClassHistory(studentId: unknown): Promise<ClassHistoryRow[]> {
    return StudentClassHistory.find({ studentId })
      .sort({ dateMoved: -1 })
      .limit(CLASS_HISTORY_LIMIT)
      .lean<IStudentClassHistory[]>() as unknown as Promise<ClassHistoryRow[]>
  }

  async readSyncHistory(email: string | undefined): Promise<SyncHistoryRow[]> {
    return SyncHistory.find({
      $or: [
        { 'metadata.affectedEmails': email },
        { user: email },
      ],
    })
      .sort({ startedAt: -1 })
      .limit(SYNC_HISTORY_LIMIT)
      .select('type startedAt completedAt status stats source')
      .lean<ISyncHistory[]>() as unknown as Promise<SyncHistoryRow[]>
  }
}
