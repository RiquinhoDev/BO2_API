import type {
  StudentClassesReader,
  StudentClassesResult,
  StudentClassesSource,
  UserClassView,
} from './studentClasses.contract'

function mergeClasses(source: StudentClassesSource): UserClassView[] {
  const merged: UserClassView[] = []

  // Hotmart first, then curseduca: the legacy order is part of the contract.
  for (const cls of source.hotmartClasses) {
    merged.push({
      classId: cls.classId,
      className: cls.className,
      source: 'hotmart',
      isActive: cls.isActive,
      enrolledAt: cls.enrolledAt,
      role: 'student',
    })
  }

  for (const cls of source.curseducaClasses) {
    merged.push({
      classId: cls.classId,
      className: cls.className,
      source: 'curseduca',
      isActive: cls.isActive,
      enrolledAt: cls.enteredAt,
      expiresAt: cls.expiresAt,
      role: cls.role,
      curseducaId: cls.curseducaId,
      curseducaUuid: cls.curseducaUuid,
    })
  }

  return merged
}

export class StudentClassesService {
  constructor(private readonly reader: StudentClassesReader) {}

  async get(userId: string): Promise<StudentClassesResult | null> {
    const source = await this.reader.findForClasses(userId)
    if (!source) return null

    const allClasses = mergeClasses(source)

    return {
      userId: source.userId,
      email: source.email,
      name: source.name,
      allClasses,
      primaryClass: source.primaryClass,
      stats: {
        totalClasses: allClasses.length,
        activeClasses: allClasses.filter(cls => cls.isActive).length,
        hotmartClasses: allClasses.filter(cls => cls.source === 'hotmart').length,
        curseducaClasses: allClasses.filter(cls => cls.source === 'curseduca').length,
      },
    }
  }
}
