import { Class } from '../../models/Class'
import { User, UserProduct } from '../../models'
import type { ClassRosterReader, ClassRosterSummary, RosterUser } from './classRoster.service'

type Filter = Record<string, unknown>
type Sort = Record<string, 1 | -1>

interface EnrollmentIdLean {
  userId?: unknown
}

/**
 * Owns every Mongoose read for the class roster, moved verbatim from the legacy
 * handler and StudentService.searchStudents. getClassById migrates only the
 * light Class.findOne lookup (name/source), with no wrapper over a shared service.
 */
export class MongooseClassRosterReader implements ClassRosterReader {
  async getClassById(classId: string): Promise<ClassRosterSummary | null> {
    return Class.findOne({ classId }).lean<ClassRosterSummary | null>()
  }

  async findCurseducaMemberIds(classId: string, includeInactive: boolean): Promise<unknown[]> {
    const enrollments = await UserProduct.find({
      platform: 'curseduca',
      'classes.classId': String(classId),
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
    })
      .select('userId')
      .lean<EnrollmentIdLean[]>()
    return enrollments.map(enrollment => enrollment.userId)
  }

  async findStudents(filter: Filter, sort: Sort, limit: number, offset: number): Promise<RosterUser[]> {
    return User.find(filter)
      .sort(sort)
      .limit(limit)
      .skip(offset)
      .lean<RosterUser[]>()
  }

  countStudents(filter: Filter): Promise<number> {
    return User.countDocuments(filter)
  }

  async searchStudents(query: Filter, limit: number, offset: number): Promise<RosterUser[]> {
    return User.find(query)
      .limit(limit)
      .skip(offset)
      .sort({ name: 1, _id: 1 })
      .lean<RosterUser[]>()
  }

  countSearch(query: Filter): Promise<number> {
    return User.countDocuments(query)
  }

  async resolveClassNames(classIds: string[]): Promise<Map<string, string>> {
    if (classIds.length === 0) return new Map()
    const classes = await Class.find(
      { classId: { $in: classIds } },
      { classId: 1, name: 1 },
    ).lean<Array<{ classId?: string; name?: string }>>()
    const byId = new Map<string, string>()
    for (const cls of classes) {
      if (cls.classId && cls.name) byId.set(cls.classId, cls.name)
    }
    return byId
  }
}
