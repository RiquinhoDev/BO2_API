/**
 * Ports for the aggregated class list of a single user. The reader normalises
 * both platform shapes (including the defensive array check against corrupt
 * documents); the service only merges and counts.
 */

export interface HotmartEnrolledClass {
  classId: string
  className: string
  isActive: boolean
  enrolledAt?: Date
}

export interface CurseducaEnrolledClass {
  classId: string
  className: string
  isActive: boolean
  /** Curseduca names this `enteredAt`; it maps onto the shared `enrolledAt`. */
  enteredAt?: Date
  expiresAt?: Date
  role?: string
  curseducaId?: string
  curseducaUuid?: string
}

/** Denormalised pointer to the user's main class, stored under `combined`. */
export interface PrimaryClassView {
  classId: string
  className: string
  source: 'hotmart' | 'curseduca'
}

export interface StudentClassesSource {
  userId: unknown
  email?: string
  name?: string
  hotmartClasses: HotmartEnrolledClass[]
  curseducaClasses: CurseducaEnrolledClass[]
  primaryClass: PrimaryClassView | null
}

export interface StudentClassesReader {
  findForClasses(userId: string): Promise<StudentClassesSource | null>
}

export interface UserClassView {
  classId: string
  className: string
  source: 'hotmart' | 'curseduca'
  isActive: boolean
  enrolledAt?: Date
  expiresAt?: Date
  role?: string
  curseducaId?: string
  curseducaUuid?: string
}

/** Exact legacy `data` payload of GET /api/users/:userId/all-classes. */
export interface StudentClassesResult {
  userId: unknown
  email?: string
  name?: string
  allClasses: UserClassView[]
  primaryClass: PrimaryClassView | null
  stats: {
    totalClasses: number
    activeClasses: number
    hotmartClasses: number
    curseducaClasses: number
  }
}
