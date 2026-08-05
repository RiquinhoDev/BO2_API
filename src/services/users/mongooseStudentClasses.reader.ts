import User from '../../models/user'
import type {
  CurseducaEnrolledClass,
  HotmartEnrolledClass,
  StudentClassesReader,
  StudentClassesSource,
} from './studentClasses.contract'

/**
 * A corrupt `enrolledClasses` that is not an array is normalised to an empty
 * list instead of throwing — the legacy handler guarded with `Array.isArray`
 * and that tolerance is preserved here.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export class MongooseStudentClassesReader implements StudentClassesReader {
  async findForClasses(userId: string): Promise<StudentClassesSource | null> {
    const user = await User.findById(userId).lean()
    if (!user) return null

    return {
      userId: user._id,
      email: user.email,
      name: user.name,
      hotmartClasses: asArray<HotmartEnrolledClass>(user.hotmart?.enrolledClasses),
      curseducaClasses: asArray<CurseducaEnrolledClass>(user.curseduca?.enrolledClasses),
      primaryClass: user.combined?.primaryClass || null,
    }
  }
}
