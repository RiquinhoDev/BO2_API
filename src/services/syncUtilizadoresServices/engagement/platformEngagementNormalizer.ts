type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(
  record: UnknownRecord,
  key: string,
): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function normalizeHotmartEngagement(engagement: unknown): number {
  if (!isRecord(engagement)) return 0

  const score = finiteNumber(engagement, 'engagementScore')
  return score === undefined ? 0 : clampScore(score)
}

function normalizeCurseducaEngagement(engagement: unknown): number {
  if (!isRecord(engagement)) return 0

  const score = finiteNumber(engagement, 'engagementScore')
  if (score !== undefined) return clampScore(score)

  const alternativeEngagement = finiteNumber(engagement, 'alternativeEngagement')
  if (alternativeEngagement !== undefined) return clampScore(alternativeEngagement)

  const activityLevel = engagement.activityLevel
  if (typeof activityLevel !== 'string') return 0

  switch (activityLevel.toUpperCase()) {
    case 'HIGH':
      return 75
    case 'MEDIUM':
      return 45
    case 'LOW':
      return 15
    default:
      return 0
  }
}

function normalizeDiscordEngagement(engagement: unknown): number {
  if (!isRecord(engagement)) return 0

  const score = finiteNumber(engagement, 'engagementScore')
  if (score === undefined) return 0

  if (score <= 10) {
    return clampScore((score / 10) * 15)
  }

  if (score <= 50) {
    return clampScore(15 + ((score - 10) / 40) * 20)
  }

  if (score <= 100) {
    return clampScore(35 + ((score - 50) / 50) * 25)
  }

  if (score <= 150) {
    return clampScore(60 + ((score - 100) / 50) * 20)
  }

  return clampScore(80 + ((score - 150) / 50) * 20)
}

export function normalizePlatformEngagement(
  platform: string,
  engagement: unknown,
): number {
  switch (platform.toLowerCase()) {
    case 'hotmart':
      return normalizeHotmartEngagement(engagement)
    case 'curseduca':
      return normalizeCurseducaEngagement(engagement)
    case 'discord':
      return normalizeDiscordEngagement(engagement)
    default:
      return 0
  }
}
