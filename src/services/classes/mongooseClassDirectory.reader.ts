import { Class } from '../../models/Class'
import { User } from '../../models'
import type { ClassDirectoryReader, ClassListFilters, DirectoryClass } from './classDirectory.service'

type Query = Record<string, unknown>

interface EnrolledCount {
  _id: string
  n: number
}

/**
 * Owns the Mongoose reads for the class directory, migrated verbatim from
 * ClassesService.listClasses: the same query construction, concurrent find+count
 * and per-class studentCount (CursEduca by groupCurseducaUuid + combined.status
 * ACTIVE, otherwise classId + status ACTIVE). The debug-only totalInDatabase
 * probe and its logs — never part of the response — are dropped.
 */
export class MongooseClassDirectoryReader implements ClassDirectoryReader {
  async listClasses(filters: ClassListFilters): Promise<{ classes: DirectoryClass[]; total: number }> {
    const query: Query = {}
    if (filters.isActive !== undefined) query.isActive = filters.isActive
    if (filters.source) query.source = filters.source
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { classId: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ]
    }

    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === 'desc' ? -1 : 1 }

    const [classes, total] = await Promise.all([
      Class.find(query).sort(sort).limit(filters.limit).skip(filters.offset).lean() as unknown as Promise<DirectoryClass[]>,
      Class.countDocuments(query),
    ])

    const hotmartIds = classes
      .filter((cls) => cls.source !== 'curseduca_sync')
      .map((cls) => cls.classId)
      .filter((classId): classId is string => Boolean(classId))
    const curseducaIds = classes
      .filter((cls) => cls.source === 'curseduca_sync')
      .map((cls) => typeof cls.curseducaId === 'string' ? cls.curseducaId : cls.classId)
      .filter((classId): classId is string => Boolean(classId))

    const [hotmartCounts, curseducaCounts] = await Promise.all([
      hotmartIds.length
        ? User.aggregate<EnrolledCount>([
          { $match: { 'hotmart.enrolledClasses.classId': { $in: hotmartIds } } },
          { $unwind: '$hotmart.enrolledClasses' },
          { $match: { 'hotmart.enrolledClasses.classId': { $in: hotmartIds } } },
          { $group: { _id: '$hotmart.enrolledClasses.classId', n: { $sum: 1 } } },
        ])
        : Promise.resolve([]),
      curseducaIds.length
        ? User.aggregate<EnrolledCount>([
          { $match: { 'combined.allClasses': { $elemMatch: { classId: { $in: curseducaIds }, source: 'curseduca' } } } },
          { $unwind: '$combined.allClasses' },
          { $match: { 'combined.allClasses.classId': { $in: curseducaIds }, 'combined.allClasses.source': 'curseduca' } },
          { $group: { _id: '$combined.allClasses.classId', n: { $sum: 1 } } },
        ])
        : Promise.resolve([]),
    ])

    const hotmartCountById = new Map(hotmartCounts.map((row) => [String(row._id), Number(row.n)]))
    const curseducaCountById = new Map(curseducaCounts.map((row) => [String(row._id), Number(row.n)]))
    const withStats = classes.map((cls) => ({
      ...cls,
      studentCount: cls.source === 'curseduca_sync'
        ? curseducaCountById.get(String(cls.curseducaId ?? cls.classId)) ?? 0
        : hotmartCountById.get(String(cls.classId)) ?? 0,
    }))

    return { classes: withStats, total }
  }
}
