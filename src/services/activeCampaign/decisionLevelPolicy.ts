import type {
  DecisionLevelInput,
  DecisionLevelPlan,
  DecisionLevelRule,
  DecisionLevelSourceRule
} from './decisionLevelTypes'

function extractDaysThreshold(condition?: string): number | null {
  if (!condition) return null

  const normalized = condition.replace(/\s+/g, ' ').trim()
  const loginDays = normalized.match(/daysSinceLastLogin\s*>=\s*(\d+)/i)
  if (loginDays?.[1]) return Number(loginDays[1])

  const inactiveDays = normalized.match(/daysInactive\s*>=\s*(\d+)/i)
  return inactiveDays?.[1] ? Number(inactiveDays[1]) : null
}

export function splitDecisionRules<TRule extends DecisionLevelSourceRule>(
  rules: readonly TRule[]
): { levelRules: DecisionLevelRule<TRule>[]; regularRules: TRule[] } {
  const levelRules: DecisionLevelRule<TRule>[] = []
  const regularRules: TRule[] = []

  for (const rule of rules) {
    const tagName = rule.tagName || rule.tag || rule.tagAC
    const explicitDays = typeof rule.daysInactive === 'number'
      ? rule.daysInactive
      : typeof rule.daysInactiveThreshold === 'number'
        ? rule.daysInactiveThreshold
        : null
    const daysInactive = explicitDays ?? extractDaysThreshold(rule.condition)

    if (rule.action === 'APPLY_TAG' && tagName && typeof daysInactive === 'number' && daysInactive > 0) {
      levelRules.push({
        rule,
        level: typeof rule.level === 'number' ? rule.level : -1,
        daysInactive,
        tagName,
        cooldownDays: typeof rule.cooldownDays === 'number' ? rule.cooldownDays : undefined
      })
      continue
    }

    regularRules.push(rule)
  }

  levelRules.sort((left, right) => left.daysInactive - right.daysInactive)
  let nextAutomaticLevel = 1
  for (const levelRule of levelRules) {
    if (levelRule.level === -1) {
      levelRule.level = nextAutomaticLevel
      nextAutomaticLevel++
    } else {
      nextAutomaticLevel = Math.max(nextAutomaticLevel, levelRule.level + 1)
    }
  }
  levelRules.sort((left, right) => left.level - right.level)

  return { levelRules, regularRules }
}

function inferCurrentLevel(input: DecisionLevelInput): number {
  if (typeof input.storedCurrentLevel === 'number') return input.storedCurrentLevel

  let currentLevel = 0
  for (const rule of input.levelRules) {
    if (input.existingTags.includes(rule.tagName)) {
      currentLevel = Math.max(currentLevel, rule.level)
    }
  }
  return currentLevel
}

function determineAppropriateLevel(
  daysInactive: number | null,
  levelRules: readonly DecisionLevelRule[]
): number {
  if (daysInactive === null) return 0

  let appropriateLevel = 0
  for (const rule of levelRules) {
    if (daysInactive >= rule.daysInactive) appropriateLevel = rule.level
  }
  return appropriateLevel
}

function confidenceForLevel(daysInactive: number, rule: DecisionLevelRule): number {
  const daysOverThreshold = daysInactive - rule.daysInactive
  let confidence = 70
  if (daysOverThreshold >= 5) confidence += 20
  else if (daysOverThreshold >= 2) confidence += 10
  else if (daysOverThreshold >= 0) confidence += 5
  if (rule.level >= 3) confidence += 5
  return Math.min(100, confidence)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function buildDecisionLevelPlan(input: DecisionLevelInput): DecisionLevelPlan {
  const currentLevel = inferCurrentLevel(input)
  const appropriateLevel = determineAppropriateLevel(input.daysInactive, input.levelRules)
  const base: DecisionLevelPlan = {
    currentLevel,
    appropriateLevel,
    decisions: [],
    tagsToApply: [],
    tagsToRemove: [],
    transition: 'none'
  }

  if (input.recentProgress && currentLevel > 0) {
    return {
      ...base,
      decisions: [{
        source: 'LEVEL',
        ruleName: 'Recent Progress',
        action: 'DESESCALATE',
        shouldExecute: true,
        reason: `Progresso recente detectado: ${input.recentProgress.type} (${input.recentProgress.value})`,
        confidence: 95
      }],
      tagsToRemove: input.levelRules.map(rule => rule.tagName),
      transition: 'recent-progress',
      cooldownUntil: addDays(input.now, 1)
    }
  }

  if (input.daysInactive === 0 && currentLevel > 0) {
    return {
      ...base,
      decisions: [{
        source: 'LEVEL',
        ruleName: 'Back Active',
        action: 'REMOVE_TAG',
        shouldExecute: true,
        reason: 'Aluno voltou a ser ativo (0 dias inativo)',
        confidence: 100
      }],
      tagsToRemove: input.levelRules.map(rule => rule.tagName),
      transition: 'back-active',
      cooldownUntil: addDays(input.now, 1)
    }
  }

  if (input.daysInactive !== null && appropriateLevel > currentLevel && input.levelRules.length > 0) {
    const target = input.levelRules.find(rule => rule.level === appropriateLevel)
    if (target) {
      const action = currentLevel === 0 ? 'APPLY_TAG' : 'ESCALATE'
      return {
        ...base,
        decisions: [{
          source: 'LEVEL',
          ruleId: target.rule._id?.toString(),
          ruleName: `Level ${target.level}`,
          condition: target.rule.condition,
          action,
          tagName: target.tagName,
          shouldExecute: true,
          reason: `${input.daysInactive} dias inativo → ${action === 'APPLY_TAG' ? 'aplicar' : 'escalar'} para nível ${target.level}`,
          confidence: confidenceForLevel(input.daysInactive, target)
        }],
        tagsToApply: [target.tagName],
        tagsToRemove: input.levelRules
          .filter(rule => rule.tagName !== target.tagName)
          .map(rule => rule.tagName),
        transition: 'escalate',
        cooldownUntil: addDays(input.now, target.cooldownDays ?? input.defaultCooldownDays)
      }
    }
  } else if (appropriateLevel === currentLevel && appropriateLevel > 0) {
    const target = input.levelRules.find(rule => rule.level === currentLevel)
    if (target) {
      return {
        ...base,
        decisions: [{
          source: 'LEVEL',
          ruleId: target.rule._id?.toString(),
          ruleName: `Maintain Level ${currentLevel}`,
          condition: target.rule.condition,
          action: 'NO_ACTION',
          tagName: target.tagName,
          shouldExecute: false,
          reason: `User mantém nível ${currentLevel} (${input.daysInactive} dias inativo)`,
          confidence: 100
        }],
        tagsToApply: [target.tagName],
        tagsToRemove: input.levelRules
          .filter(rule => rule.tagName !== target.tagName)
          .map(rule => rule.tagName),
        transition: 'maintain'
      }
    }
  }

  return base
}
