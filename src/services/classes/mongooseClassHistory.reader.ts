import { Class } from '../../models/Class'
import { User } from '../../models'
import StudentClassHistory from '../../models/StudentClassHistory'
import UserHistory from '../../models/UserHistory'
import SyncHistory from '../../models/SyncHistory'
import type {
  ChangeDoc,
  ClassHistoryReader,
  ClassSummary,
  HistoryRecord,
  MovementDoc,
  StudentRef,
  SyncDoc,
  UserDoc,
} from './classHistory.service'

type Query = Record<string, unknown>

const USER_CHANGE_TYPES = ['EMAIL_CHANGE', 'PLATFORM_UPDATE', 'STATUS_CHANGE', 'INACTIVATION']

/**
 * Owns every Mongoose read for class history, moved verbatim from the legacy
 * handlers. getClassById migrates only the Class.findOne lookup the complete
 * history needs (no studentCount, no wrapper over a shared service).
 */
export class MongooseClassHistoryReader implements ClassHistoryReader {
  async getClassById(classId: string): Promise<ClassSummary | null> {
    return Class.findOne({ classId }).lean() as unknown as Promise<ClassSummary | null>
  }

  countHistory(query: Query): Promise<number> {
    return StudentClassHistory.countDocuments(query)
  }

  findHistory(query: Query, limit: number, offset: number): Promise<HistoryRecord[]> {
    return StudentClassHistory.find(query)
      .populate('studentId', 'name email')
      .sort({ dateMoved: -1 })
      .limit(limit)
      .skip(offset)
      .lean() as unknown as Promise<HistoryRecord[]>
  }

  listMovements(classId: string, limit: number, offset: number): Promise<MovementDoc[]> {
    return StudentClassHistory.find({ $or: [{ classId }, { previousClassId: classId }] })
      .populate('studentId', 'name email')
      .sort({ dateMoved: -1 })
      .limit(limit)
      .skip(offset)
      .lean() as unknown as Promise<MovementDoc[]>
  }

  async listStudents(classData: ClassSummary, classId: string): Promise<StudentRef[]> {
    if (classData.source === 'curseduca_sync' && classData.curseducaUuid) {
      return User.find({ 'curseduca.groupCurseducaUuid': classData.curseducaUuid })
        .select('_id email')
        .lean() as unknown as Promise<StudentRef[]>
    }
    return User.find({ classId })
      .select('_id email')
      .lean() as unknown as Promise<StudentRef[]>
  }

  listUserChanges(studentIds: unknown[], limit: number, offset: number): Promise<ChangeDoc[]> {
    return UserHistory.find({ userId: { $in: studentIds }, changeType: { $in: USER_CHANGE_TYPES } })
      .sort({ changeDate: -1 })
      .limit(limit)
      .skip(offset)
      .lean() as unknown as Promise<ChangeDoc[]>
  }

  listSyncs(classId: string): Promise<SyncDoc[]> {
    return SyncHistory.find({ type: { $in: ['hotmart', 'curseduca'] }, status: 'completed', 'metadata.classIds': classId })
      .sort({ startedAt: -1 })
      .limit(10)
      .lean() as unknown as Promise<SyncDoc[]>
  }

  findUserByDiscord(discordId: string): Promise<UserDoc | null> {
    return User.findOne({ 'discord.discordIds': discordId }).lean() as unknown as Promise<UserDoc | null>
  }

  findUserByEmail(email: string): Promise<UserDoc | null> {
    return User.findOne({ email }).lean() as unknown as Promise<UserDoc | null>
  }

  countByStudent(studentId: unknown): Promise<number> {
    return StudentClassHistory.countDocuments({ studentId })
  }

  findByStudent(studentId: unknown, limit: number, offset: number): Promise<HistoryRecord[]> {
    return StudentClassHistory.find({ studentId })
      .sort({ dateMoved: -1 })
      .limit(limit)
      .skip(offset)
      .lean() as unknown as Promise<HistoryRecord[]>
  }
}
