type CourseActivity = {
  courseSpecificData?: {
    lastReportOpenedAt?: unknown
    lastModuleCompletedAt?: unknown
  }
}

export type LearnerActivitySource = {
  communicationByCourse?: Map<string, CourseActivity> | Record<string, CourseActivity>
  hotmart?: { lastAccessDate?: unknown }
  curseduca?: {
    lastLogin?: unknown
    lastAccess?: unknown
  }
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getCourseActivities(
  source: LearnerActivitySource,
  productCode?: string,
): CourseActivity[] {
  const byCourse = source.communicationByCourse
  if (!byCourse) return []

  if (byCourse instanceof Map) {
    if (productCode) {
      const activity = byCourse.get(productCode)
      return activity ? [activity] : []
    }
    return Array.from(byCourse.values())
  }

  if (productCode) {
    const activity = byCourse[productCode]
    return activity ? [activity] : []
  }
  return Object.values(byCourse)
}

export function getLastLearnerActivityDate(
  source: LearnerActivitySource,
  productCode?: string,
): Date | null {
  const candidates: unknown[] = [
    source.hotmart?.lastAccessDate,
    source.curseduca?.lastLogin,
    source.curseduca?.lastAccess,
  ]

  for (const courseActivity of getCourseActivities(source, productCode)) {
    candidates.push(
      courseActivity.courseSpecificData?.lastReportOpenedAt,
      courseActivity.courseSpecificData?.lastModuleCompletedAt,
    )
  }

  const dates = candidates
    .map(toValidDate)
    .filter((date): date is Date => date !== null)

  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}
