// ════════════════════════════════════════════════════════════
// 🔧 TAG RULE ADAPTER
// Converte TagRules do MongoDB para formato do DecisionEngine
// ════════════════════════════════════════════════════════════

import { ITagRule } from '../../models/acTags/TagRule'

/**
 * Converte uma TagRule do MongoDB para o formato esperado pelo DecisionEngine
 */
// src/services/ac/tagRuleAdapter.ts

export function adaptTagRuleForDecisionEngine(tagRule: ITagRule): any {
  // 🔧 FIX: Priorizar condition (string) sobre conditions (array)
  const conditionStr = tagRule.condition || convertConditionsToString(tagRule.conditions)

  const tagName = tagRule.actions.addTag

  return {
    _id: tagRule._id,
    name: tagRule.name,
    tagName: tagName,
    action: 'APPLY_TAG',
    condition: conditionStr,
    priority: tagRule.priority || 0,
    
    daysInactive: extractDaysInactiveFromConditions(tagRule.conditions),
    
    _original: tagRule
  }
}

/**
 * Converte array de conditions para string que o DecisionEngine consegue avaliar
 */
function convertConditionsToString(conditions: any[]): string {
  if (!conditions || conditions.length === 0) return ''

  const parts: string[] = []

  for (const cond of conditions) {
    if (cond.type === 'SIMPLE') {
      parts.push(formatSimpleCondition(cond))
    } else if (cond.type === 'COMPOUND' && cond.subConditions) {
      const subParts = cond.subConditions.map((sc: any) => formatSimpleCondition(sc))
      const joined = subParts.join(` ${cond.logic} `)
      parts.push(`(${joined})`)
    }
  }

  return parts.join(' AND ')
}

/**
 * Formata uma condição simples para string
 */
function formatSimpleCondition(cond: any): string {
  const { field, operator, value } = cond

  // Mapear operadores para formato que DecisionEngine espera
  const opMap: Record<string, string> = {
    'greaterThan': '>=',
    'lessThan': '<',
    'equals': '===',
    'olderThan': '>=',
    'newerThan': '<'
  }

  const op = opMap[operator] || operator

  return `${field} ${op} ${value}`
}

/**
 * Extrai threshold de dias inativo das conditions
 */
function extractDaysInactiveFromConditions(conditions: any[]): number | undefined {
  if (!conditions || conditions.length === 0) return undefined

  for (const cond of conditions) {
    if (cond.type === 'SIMPLE') {
      if (cond.field === 'daysSinceLastLogin' && cond.operator === 'greaterThan') {
        return cond.value
      }
    } else if (cond.type === 'COMPOUND' && cond.subConditions) {
      for (const sc of cond.subConditions) {
        if (sc.field === 'daysSinceLastLogin' && sc.operator === 'greaterThan') {
          return sc.value
        }
      }
    }
  }

  return undefined
}

export default {
  adaptTagRuleForDecisionEngine
}