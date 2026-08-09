export type DecisionLevelSourceRule = {
  _id?: { toString(): string }
  name: string
  tagName?: string
  tag?: string
  tagAC?: string
  action: string
  condition?: string
  priority?: number
  daysInactive?: number
  daysInactiveThreshold?: number
  level?: number
  cooldownDays?: number
}

export type DecisionLevelRule<TRule extends DecisionLevelSourceRule = DecisionLevelSourceRule> = {
  rule: TRule
  level: number
  daysInactive: number
  tagName: string
  cooldownDays?: number
}

export type RecentProgressSignal = {
  type: string
  value: number
}

export type DecisionLevelDecision = {
  source: 'LEVEL'
  ruleId?: string
  ruleName: string
  condition?: string
  action: 'APPLY_TAG' | 'REMOVE_TAG' | 'ESCALATE' | 'DESESCALATE' | 'NO_ACTION'
  tagName?: string
  shouldExecute: boolean
  reason: string
  confidence: number
}

export type DecisionLevelTransition =
  | 'none'
  | 'recent-progress'
  | 'back-active'
  | 'escalate'
  | 'maintain'

export type DecisionLevelInput = {
  levelRules: readonly DecisionLevelRule[]
  daysInactive: number | null
  storedCurrentLevel?: number
  existingTags: readonly string[]
  recentProgress: RecentProgressSignal | null
  now: Date
  defaultCooldownDays: number
}

export type DecisionLevelPlan = {
  currentLevel: number
  appropriateLevel: number
  decisions: DecisionLevelDecision[]
  tagsToApply: string[]
  tagsToRemove: string[]
  transition: DecisionLevelTransition
  cooldownUntil?: Date
}
