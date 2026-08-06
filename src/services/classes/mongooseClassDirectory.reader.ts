import { Class } from '../../models/Class'
import { User } from '../../models'
import type { ClassDirectoryReader, ClassListFilters, DirectoryClass } from './classDirectory.service'

type Query = Record<string, unknown>

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

    const withStats = await Promise.all(classes.map(async cls => {
      const studentCount = cls.source === 'curseduca_sync' && cls.curseducaUuid
        ? await User.countDocuments({ 'curseduca.groupCurseducaUuid': cls.curseducaUuid, 'combined.status': 'ACTIVE' })
        : await User.countDocuments({ classId: cls.classId, status: 'ACTIVE' })
      return { ...cls, studentCount }
    }))

    return { classes: withStats, total }
  }
}
