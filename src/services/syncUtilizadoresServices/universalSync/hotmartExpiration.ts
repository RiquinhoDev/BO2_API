import { parseTurmaName } from '../../renewal/turmaParser'

export const EXPIRATION_DAYS = 380 // Dias após compra para considerar expirado

// Minimal structural shape the class selector needs — satisfied by both the
// Mongoose enrolledClasses subdocs and the builder's plain enrollment DTOs.
export interface HotmartClassCandidate {
  classId?: string
  className?: string
  isActive?: boolean
}

export interface Clock {
  now(): Date
}

export interface HotmartClassForExpiration {
  classId?: string
  className?: string
}

/** Minimal structural holder of hotmart enrolments — satisfied by IUser and by the renewal state. */
export interface HotmartEnrollmentHolder {
  hotmart?: { enrolledClasses?: HotmartClassCandidate[] }
}

export interface ExpiredStudent {
  userId: string
  email: string
  name: string
  classId?: string
  className?: string
  purchaseDate: Date | null
  daysSincePurchase: number
  accessEndOgi?: Date | null
  expirationSource: 'turma' | 'purchaseDate'
  expirationReason: string
}

export interface ExpirationEvaluation {
  canEvaluate: boolean
  isExpired: boolean
  daysSincePurchase: number
  accessEndOgi?: Date | null
  expirationSource: 'turma' | 'purchaseDate'
  expirationReason: string
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getActiveHotmartClassForExpiration(
  user: HotmartEnrollmentHolder,
  pendingHotmartClasses?: HotmartClassCandidate[],
  fallbackClassId?: string,
  fallbackClassName?: string,
): HotmartClassForExpiration | null {
  const candidates = [
    ...(Array.isArray(pendingHotmartClasses) ? pendingHotmartClasses : []),
    ...(Array.isArray(user?.hotmart?.enrolledClasses) ? user.hotmart.enrolledClasses : []),
  ]

  const activeClass = candidates.find((cls) => cls.className && cls.isActive !== false)
  const anyClass = candidates.find((cls) => cls.className)

  const selectedClass = activeClass ?? anyClass
  if (selectedClass) {
    return { classId: selectedClass.classId, className: selectedClass.className }
  }

  if (fallbackClassName) {
    return { classId: fallbackClassId, className: fallbackClassName }
  }

  return null
}

/**
 * Expiration policy with an injected Clock. Uses the real class expiry when the
 * class name carries a YYMM period; only falls back to purchaseDate + 380 days
 * when the class has no period.
 */
export class HotmartExpirationPolicy {
  constructor(private readonly clock: Clock) {}

  daysSincePurchase(purchaseDate: Date | null): number {
    if (!purchaseDate) return 0
    return Math.floor((this.clock.now().getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  evaluate(purchaseDate: Date | null, className?: string): ExpirationEvaluation {
    const daysSincePurchase = this.daysSincePurchase(purchaseDate)

    if (className) {
      const parsed = parseTurmaName(className)
      if (parsed.hasExpiry && parsed.accessEndOgi) {
        const isExpired = parsed.accessEndOgi.getTime() < this.clock.now().getTime()
        return {
          canEvaluate: true,
          isExpired,
          daysSincePurchase,
          accessEndOgi: parsed.accessEndOgi,
          expirationSource: 'turma',
          expirationReason: `Acesso expirado: ${formatDateOnly(parsed.accessEndOgi)}`,
        }
      }
    }

    if (!purchaseDate) {
      return {
        canEvaluate: false,
        isExpired: false,
        daysSincePurchase,
        accessEndOgi: null,
        expirationSource: 'purchaseDate',
        expirationReason: 'Sem data de compra para avaliar expiração',
      }
    }

    return {
      canEvaluate: true,
      isExpired: daysSincePurchase > EXPIRATION_DAYS,
      daysSincePurchase,
      accessEndOgi: null,
      expirationSource: 'purchaseDate',
      expirationReason: `Compra expirada: ${daysSincePurchase} dias (limite: ${EXPIRATION_DAYS})`,
    }
  }

  check(
    userId: string,
    email: string,
    name: string,
    purchaseDate: Date | null,
    classId?: string,
    className?: string,
  ): ExpiredStudent | null {
    const expiration = this.evaluate(purchaseDate, className)

    if (expiration.canEvaluate && expiration.isExpired) {
      return {
        userId,
        email,
        name,
        classId,
        className,
        purchaseDate,
        daysSincePurchase: expiration.daysSincePurchase,
        accessEndOgi: expiration.accessEndOgi,
        expirationSource: expiration.expirationSource,
        expirationReason: expiration.expirationReason,
      }
    }

    return null
  }
}
