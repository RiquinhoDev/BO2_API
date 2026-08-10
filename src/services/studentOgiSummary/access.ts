import { timingSafeEqual } from 'node:crypto'
import User from '../../models/user'
import { verifyStudentAccessToken } from '../../security/jwt'
import { getStudentSummaryToken } from '../requestDrivenRuntimeConfig'
import { resolveAccessEnd } from '../renewal/turmaParser'

export interface StudentAccessSource {
  name?: string
  email: string
  hotmart?: {
    enrolledClasses?: Array<{ className?: string; isActive?: boolean }>
    purchaseDate?: Date
    signupDate?: Date
  }
  inactivation?: { isManuallyInactivated?: boolean }
}

export interface StudentAccessResult {
  found: boolean
  email: string
  name?: string
  active: boolean
  expiresAt: Date | null
  className: string | null
  purchaseDate: Date | null
  manuallyInactivated: boolean
  reason: 'OK' | 'INACTIVATED' | 'EXPIRED' | 'NO_DATA'
  source: 'bo2'
}

export function normalizeStudentEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function resolveStudentEmailFromToken(token: string): string {
  const payload = verifyStudentAccessToken<{ email?: string }>(token)
  if (!payload.email) throw new Error('STUDENT_TOKEN_EMAIL_MISSING')
  return normalizeStudentEmail(payload.email)
}

export function isValidSummaryAccessToken(token?: string): boolean {
  const expectedToken = getStudentSummaryToken()
  if (!expectedToken || !token) return false

  const expected = Buffer.from(expectedToken)
  const received = Buffer.from(token)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function getActiveHotmartClassName(user: StudentAccessSource): string | undefined {
  const classes = user.hotmart?.enrolledClasses ?? []
  const activeClass = classes.find(item => item.className && item.isActive !== false)
    ?? classes.find(item => item.className)
  return activeClass?.className
}

export async function getStudentAccess(email: string): Promise<StudentAccessResult | null> {
  const user = await User.findOne({ email: normalizeStudentEmail(email) })
    .select('name email hotmart.enrolledClasses hotmart.purchaseDate hotmart.signupDate inactivation')
    .lean<StudentAccessSource>()
    .exec()

  if (!user) return null

  const activeClassName = getActiveHotmartClassName(user)
  const purchaseDate = user.hotmart?.purchaseDate ?? user.hotmart?.signupDate ?? null
  const expiresAt = resolveAccessEnd(purchaseDate, activeClassName)
  const manuallyInactivated = Boolean(user.inactivation?.isManuallyInactivated)
  const dateValid = Boolean(expiresAt && expiresAt.getTime() >= Date.now())

  let reason: StudentAccessResult['reason'] = 'OK'
  if (manuallyInactivated) reason = 'INACTIVATED'
  else if (!expiresAt) reason = 'NO_DATA'
  else if (!dateValid) reason = 'EXPIRED'

  return {
    found: true,
    email: user.email,
    name: user.name,
    active: !manuallyInactivated && dateValid,
    expiresAt: expiresAt ?? null,
    className: activeClassName ?? null,
    purchaseDate,
    manuallyInactivated,
    reason,
    source: 'bo2'
  }
}
