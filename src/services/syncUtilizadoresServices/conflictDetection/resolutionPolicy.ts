import type {
  ConflictSeverity,
  ConflictType,
  ResolutionAction
} from '../../../models/SyncModels/SyncConflict'

export interface ConflictPolicyInput {
  conflictType: ConflictType
  severity: ConflictSeverity
}

interface AutoResolutionRule {
  conflictType: ConflictType
  conditions: (conflict: ConflictPolicyInput) => boolean
  action: ResolutionAction
  confidence: number
  reason: string
}

const AUTO_RESOLUTION_RULES: readonly AutoResolutionRule[] = [
  {
    conflictType: 'MISSING_DATA',
    conditions: conflict => conflict.severity !== 'CRITICAL',
    action: 'KEPT_EXISTING',
    confidence: 80,
    reason: 'Dados novos incompletos, mantendo existentes'
  },
  {
    conflictType: 'CLASS_CONFLICT',
    conditions: () => true,
    action: 'USED_NEW',
    confidence: 70,
    reason: 'Usar turma mais recente da sincroniza??o'
  },
  {
    conflictType: 'PLATFORM_MISMATCH',
    conditions: conflict => conflict.severity === 'LOW',
    action: 'MERGED',
    confidence: 90,
    reason: 'Merge de dados multi-plataforma'
  }
]

function matchingRule(conflict: ConflictPolicyInput): AutoResolutionRule | undefined {
  return AUTO_RESOLUTION_RULES.find(
    rule => rule.conflictType === conflict.conflictType && rule.conditions(conflict)
  )
}

export function canAutoResolveConflict(conflict: ConflictPolicyInput): boolean {
  if (conflict.severity === 'CRITICAL') return false
  return (matchingRule(conflict)?.confidence ?? 0) >= 70
}

export function getSuggestedConflictAction(conflict: ConflictPolicyInput): ResolutionAction {
  return matchingRule(conflict)?.action ?? 'MANUAL'
}

export function getAutoResolutionPlan(
  conflict: ConflictPolicyInput
): { action: ResolutionAction; reason: string } | null {
  if (!canAutoResolveConflict(conflict)) return null
  const rule = matchingRule(conflict)
  return rule ? { action: rule.action, reason: rule.reason } : null
}
