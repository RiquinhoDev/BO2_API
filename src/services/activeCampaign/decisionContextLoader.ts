import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'
import User from '../../models/user'
import TagRule from '../../models/acTags/TagRule'
import Course from '../../models/Course'
import type { IUser } from '../../models/user'
import type { IProduct } from '../../models/product/Product'
import type { ICondition } from '../../models/acTags/TagRule'
import type {
  DecisionContext,
  DecisionUserProduct,
  EntityId,
  InternalRule
} from './decisionContextTypes'

type PersistedRuleActions = { addTag?: string }

export type PersistedDecisionRule = {
  _id?: EntityId
  name: string
  priority?: number
  condition?: string
  conditions?: ICondition[]
  actions?: PersistedRuleActions
}

type CourseRecord = { _id: EntityId }

export interface DecisionContextRepositories {
  findUserProduct(userId: string, productId: string): Promise<DecisionUserProduct | null>
  findUser(userId: string): Promise<IUser | null>
  findProduct(productId: string): Promise<IProduct | null>
  findCourseByCode(code: string): Promise<CourseRecord | null>
  findActiveRules(courseId: EntityId): Promise<PersistedDecisionRule[]>
}

const OPERATOR_MAP: Readonly<Record<string, string>> = {
  greaterThan: '>=',
  lessThan: '<',
  equals: '===',
  olderThan: '>=',
  newerThan: '<'
}

function conditionExpression(condition: ICondition): string {
  if (
    condition.type === 'SIMPLE'
    && condition.field
    && condition.operator
    && condition.value !== undefined
  ) {
    return `${condition.field} ${OPERATOR_MAP[condition.operator] || condition.operator} ${condition.value}`
  }

  if (condition.type !== 'COMPOUND' || !Array.isArray(condition.subConditions)) return ''

  const parts = condition.subConditions.map(subCondition => {
    const operator = OPERATOR_MAP[subCondition.operator] || subCondition.operator
    return `${subCondition.field} ${operator} ${subCondition.value}`
  }).filter(Boolean)

  if (parts.length === 0) return ''
  const operator = condition.logic === 'OR' ? '||' : '&&'
  return parts.length === 1 ? parts[0] : `(${parts.join(` ${operator} `)})`
}

function inactivityThreshold(conditions: ICondition[]): number | undefined {
  for (const condition of conditions) {
    if (
      condition.type === 'SIMPLE'
      && (condition.field === 'daysSinceLastLogin' || condition.field === 'daysInactive')
      && condition.operator === 'greaterThan'
    ) return condition.value

    if (condition.type === 'COMPOUND' && condition.subConditions) {
      for (const subCondition of condition.subConditions) {
        if (
          (subCondition.field === 'daysSinceLastLogin' || subCondition.field === 'daysInactive')
          && subCondition.operator === 'greaterThan'
        ) return subCondition.value
      }
    }
  }

  return undefined
}

export function adaptDecisionRule(rule: PersistedDecisionRule): InternalRule {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : []
  const generatedCondition = conditions.map(conditionExpression).filter(Boolean).join(' AND ')

  return {
    _id: rule._id,
    name: rule.name,
    tagName: rule.actions?.addTag || '',
    action: 'APPLY_TAG',
    condition: rule.condition || generatedCondition,
    priority: rule.priority || 0,
    daysInactive: inactivityThreshold(conditions)
  }
}

export async function loadDecisionContext(
  userId: string,
  productId: string,
  repositories: DecisionContextRepositories
): Promise<DecisionContext> {
  const userProduct = await repositories.findUserProduct(userId, productId)
  const user = await repositories.findUser(userId)
  const product = await repositories.findProduct(productId)

  if (!userProduct || !user || !product) {
    throw new Error('UserProduct, User ou Product não encontrado')
  }

  const course = await repositories.findCourseByCode(product.courseCode || product.code)
  if (!course) throw new Error(`Course não encontrado para product ${product.code}`)

  const rules = await repositories.findActiveRules(course._id)
  return { userId, productId, userProduct, user, product, rules: rules.map(adaptDecisionRule) }
}

export const mongooseDecisionContextRepositories: DecisionContextRepositories = {
  async findUserProduct(userId, productId) {
    return UserProduct.findOne({ userId, productId })
  },
  async findUser(userId) {
    return User.findById(userId)
  },
  async findProduct(productId) {
    return Product.findById(productId)
  },
  async findCourseByCode(code) {
    return Course.findOne({ code })
  },
  async findActiveRules(courseId) {
    return TagRule.find({ courseId, isActive: true }).sort({ priority: -1, name: 1 })
  }
}
