// ════════════════════════════════════════════════════════════
// 📁 src/controllers/acTags/tagRuleEstimate.controller.ts
// Controller: Endpoints auxiliares para estimativa de Tag Rules
// ════════════════════════════════════════════════════════════

import logger from '../../utils/logger'
import type { RequestHandler } from 'express'
import { internalError } from '../../security/errorHandling'
import { UserProduct, Product, Course } from '../../models'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

type SourceType = 'USERPRODUCT' | 'PRODUCT' | 'COURSE' | 'COMBINED'
type OperatorType = 
  | 'equals' 
  | 'notEquals'
  | 'contains' 
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan' 
  | 'lessThan' 
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'olderThan'
  | 'newerThan'
  | 'between'
  | 'in'
  | 'notIn'

interface IRule {
  field: string
  operator: OperatorType
  value: any
  unit?: string
}

interface IConditionGroup {
  source: 'USERPRODUCT' | 'PRODUCT' | 'COURSE'
  logic: 'AND' | 'OR'
  rules: IRule[]
}

interface IConditions {
  source: SourceType
  logic?: 'AND' | 'OR'
  rules?: IRule[]
  groups?: IConditionGroup[]
}

// ─────────────────────────────────────────────────────────────
// POST /api/tag-rules/estimate
// Estimar quantos alunos serão afetados pela regra
// ─────────────────────────────────────────────────────────────

export const estimateAffectedUsers: RequestHandler = async (req, res, next) => {
  try {
    const { conditions, courseId } = req.body as {
      conditions: IConditions
      courseId?: string
    }

    logger.info('📊 Estimando alunos afetados...')
    logger.info('Conditions:', JSON.stringify(conditions, null, 2))

    // Validar input
    if (!conditions || !conditions.source) {
      res.status(400).json({
        success: false,
        error: 'Condições inválidas. Campo "source" é obrigatório.'
      })
      return
    }

    // Buscar course se fornecido
    let course = null
    if (courseId) {
      course = await Course.findById(courseId)
      if (!course) {
        res.status(404).json({
          success: false,
          error: 'Course não encontrado'
        })
        return
      }
    }

    // Construir query MongoDB baseado nas condições
    const query = await buildMongoQuery(conditions, course)

    logger.info('🔍 Query MongoDB:', JSON.stringify(query, null, 2))

    // Contar documentos
    const count = await UserProduct.countDocuments(query)

    logger.info(`✅ Estimativa: ${count} alunos`)

    // Breakdown por status
    const breakdown = await UserProduct.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])

    res.json({
      success: true,
      data: {
        estimatedCount: count,
        breakdown: breakdown.reduce((acc: any, item: any) => {
          acc[item._id] = item.count
          return acc
        }, {})
      }
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_ESTIMATE_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/tag-rules/preview
// Preview de alunos específicos que serão afetados
// ─────────────────────────────────────────────────────────────

export const previewAffectedUsers: RequestHandler = async (req, res, next) => {
  try {
    const { conditions, courseId, limit = 10 } = req.body as {
      conditions: IConditions
      courseId?: string
      limit?: number
    }

    logger.info(`👁️ Preview de alunos (limit: ${limit})...`)

    // Validar input
    if (!conditions || !conditions.source) {
      res.status(400).json({
        success: false,
        error: 'Condições inválidas. Campo "source" é obrigatório.'
      })
      return
    }

    // Buscar course se fornecido
    let course = null
    if (courseId) {
      course = await Course.findById(courseId)
      if (!course) {
        res.status(404).json({
          success: false,
          error: 'Course não encontrado'
        })
        return
      }
    }

    // Construir query
    const query = await buildMongoQuery(conditions, course)

    // Buscar alunos (com limit)
    const userProducts = await UserProduct.find(query)
      .limit(Math.min(limit, 50)) // Máximo 50
      .populate('userId', 'name email')
      .populate('productId', 'name code')
      .sort({ updatedAt: -1 })

    // Total count
    const totalCount = await UserProduct.countDocuments(query)

    logger.info(`✅ Preview: ${userProducts.length} de ${totalCount} alunos`)

    // Formatar resposta
    const users = userProducts.map((up: any) => ({
      userId: up.userId?._id,
      userName: up.userId?.name,
      userEmail: up.userId?.email,
      productId: up.productId?._id,
      productName: up.productId?.name,
      productCode: up.productId?.code,
      status: up.status,
      enrolledAt: up.enrolledAt,
      progress: up.progress?.percentage || 0,
      engagement: up.engagement?.engagementScore || 0,
      daysSinceLastLogin: up.engagement?.daysSinceLastLogin,
      daysSinceLastAction: up.engagement?.daysSinceLastAction
    }))

    res.json({
      success: true,
      data: {
        users,
        total: totalCount,
        showing: users.length
      }
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_PREVIEW_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/tag-rules/fields
// Listar campos disponíveis por source
// ─────────────────────────────────────────────────────────────

export const getAvailableFields: RequestHandler = async (_req, res, next) => {
  try {
    logger.info('📋 Listando campos disponíveis...')

    const fields = {
      USERPRODUCT: {
        temporal: [
          { field: 'enrolledAt', type: 'date', description: 'Data de inscrição' },
          { field: 'metadata.purchaseDate', type: 'date', description: 'Data de compra' },
          { field: 'progress.lastActivity', type: 'date', description: 'Última atividade' }
        ],
        progress: [
          { field: 'progress.percentage', type: 'number', description: 'Progresso (%)', min: 0, max: 100 },
          { field: 'progress.currentModule', type: 'number', description: 'Módulo atual' },
          { field: 'progress.reportsGenerated', type: 'number', description: 'Relatórios gerados (Clareza)' },
          { field: 'progress.videosWatched', type: 'number', description: 'Vídeos assistidos (OGI)' }
        ],
        engagement: [
          { field: 'engagement.engagementScore', type: 'number', description: 'Score de engagement (0-100)' },
          { field: 'engagement.daysSinceLastLogin', type: 'number', description: 'Dias sem login (OGI)' },
          { field: 'engagement.daysSinceLastAction', type: 'number', description: 'Dias sem ação (Clareza)' },
          { field: 'engagement.totalLogins', type: 'number', description: 'Total de logins' },
          { field: 'engagement.actionsLastWeek', type: 'number', description: 'Ações última semana' },
          { field: 'engagement.actionsLastMonth', type: 'number', description: 'Ações último mês' },
          { field: 'engagement.consistency', type: 'number', description: 'Consistência (0-100)' }
        ],
        value: [
          { field: 'metadata.purchaseValue', type: 'number', description: 'Valor da compra' },
          { field: 'metadata.refunded', type: 'boolean', description: 'Foi reembolsado?' }
        ],
        status: [
          { field: 'status', type: 'enum', description: 'Status', values: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED'] },
          { field: 'source', type: 'enum', description: 'Origem', values: ['PURCHASE', 'MANUAL', 'MIGRATION', 'TRIAL'] },
          { field: 'platform', type: 'enum', description: 'Plataforma', values: ['hotmart', 'curseduca', 'discord'] },
          { field: 'isPrimary', type: 'boolean', description: 'É produto principal?' }
        ],
        communication: [
          { field: 'communications.emailsSent', type: 'number', description: 'Emails enviados' },
          { field: 'communications.emailsOpened', type: 'number', description: 'Emails abertos' },
          { field: 'communications.unsubscribed', type: 'boolean', description: 'Unsubscribed?' }
        ]
      },
      PRODUCT: {
        identification: [
          { field: 'code', type: 'string', description: 'Código do produto (ex: OGI_V1, CLAREZA_ANUAL)' },
          { field: 'name', type: 'string', description: 'Nome do produto' },
          { field: 'platform', type: 'enum', description: 'Plataforma', values: ['hotmart', 'curseduca', 'discord'] }
        ],
        status: [
          { field: 'isActive', type: 'boolean', description: 'Produto ativo?' },
          { field: 'launchDate', type: 'date', description: 'Data de lançamento' },
          { field: 'sunsetDate', type: 'date', description: 'Data de descontinuação' }
        ]
      },
      COURSE: {
        identification: [
          { field: 'code', type: 'enum', description: 'Código do curso', values: ['OGI', 'CLAREZA', 'OUTRO'] },
          { field: 'name', type: 'string', description: 'Nome do curso' },
          { field: 'trackingType', type: 'enum', description: 'Tipo de tracking', values: ['LOGIN_BASED', 'ACTION_BASED'] }
        ],
        thresholds: [
          { field: 'trackingConfig.loginThresholds.warning', type: 'number', description: 'Threshold aviso (login)' },
          { field: 'trackingConfig.loginThresholds.critical', type: 'number', description: 'Threshold crítico (login)' },
          { field: 'trackingConfig.actionThresholds.warning', type: 'number', description: 'Threshold aviso (ação)' },
          { field: 'trackingConfig.actionThresholds.critical', type: 'number', description: 'Threshold crítico (ação)' },
          { field: 'trackingConfig.progressThresholds.low', type: 'number', description: 'Threshold progresso baixo' },
          { field: 'trackingConfig.progressThresholds.medium', type: 'number', description: 'Threshold progresso médio' },
          { field: 'trackingConfig.progressThresholds.high', type: 'number', description: 'Threshold progresso alto' }
        ]
      }
    }

    res.json({
      success: true,
      data: fields
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_FIELDS_READ_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Construir Query MongoDB
// ─────────────────────────────────────────────────────────────

async function buildMongoQuery(conditions: IConditions, course: any): Promise<any> {
  const query: any = {}

  // ═══════════════════════════════════════════════════════════
  // SOURCE: USERPRODUCT (Simples)
  // ═══════════════════════════════════════════════════════════
  if (conditions.source === 'USERPRODUCT' && conditions.rules) {
    const rules = conditions.rules
    const logic = conditions.logic || 'AND'

    if (logic === 'AND') {
      // Cada rule vira uma condição no query
      for (const rule of rules) {
        const condition = buildRuleCondition(rule)
        Object.assign(query, condition)
      }
    } else {
      // OR: usar $or
      query.$or = rules.map(rule => buildRuleCondition(rule))
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SOURCE: PRODUCT (Precisa JOIN)
  // ═══════════════════════════════════════════════════════════
  else if (conditions.source === 'PRODUCT' && conditions.rules) {
    const rules = conditions.rules
    const logic = conditions.logic || 'AND'

    // Buscar produtos que satisfazem as condições
    const productQuery: any = {}

    if (logic === 'AND') {
      for (const rule of rules) {
        const condition = buildRuleCondition(rule)
        Object.assign(productQuery, condition)
      }
    } else {
      productQuery.$or = rules.map(rule => buildRuleCondition(rule))
    }

    const products = await Product.find(productQuery).select('_id')
    const productIds = products.map(p => p._id)

    // Query UserProduct com productId IN [...]
    query.productId = { $in: productIds }
  }

  // ═══════════════════════════════════════════════════════════
  // SOURCE: COURSE (Precisa avaliar thresholds)
  // ═══════════════════════════════════════════════════════════
  else if (conditions.source === 'COURSE' && conditions.rules) {
    // TODO: Implementar avaliação de thresholds dinâmicos
    // Por enquanto, apenas placeholder
    logger.warn('⚠️ SOURCE=COURSE ainda não totalmente implementado')
    
    // Buscar products do course
    if (course) {
      const products = await Product.find({ courseId: course._id }).select('_id')
      const productIds = products.map(p => p._id)
      query.productId = { $in: productIds }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SOURCE: COMBINED (Múltiplos grupos)
  // ═══════════════════════════════════════════════════════════
  else if (conditions.source === 'COMBINED' && conditions.groups) {
    const groups = conditions.groups
    const andConditions: any[] = []

    for (const group of groups) {
      if (group.source === 'USERPRODUCT') {
        // Condições diretas do UserProduct
        const groupQuery: any = {}
        
        if (group.logic === 'AND') {
          for (const rule of group.rules) {
            const condition = buildRuleCondition(rule)
            Object.assign(groupQuery, condition)
          }
        } else {
          groupQuery.$or = group.rules.map(rule => buildRuleCondition(rule))
        }

        andConditions.push(groupQuery)
      } else if (group.source === 'PRODUCT') {
        // Buscar produtos
        const productQuery: any = {}
        
        if (group.logic === 'AND') {
          for (const rule of group.rules) {
            const condition = buildRuleCondition(rule)
            Object.assign(productQuery, condition)
          }
        } else {
          productQuery.$or = group.rules.map(rule => buildRuleCondition(rule))
        }

        const products = await Product.find(productQuery).select('_id')
        const productIds = products.map(p => p._id)

        andConditions.push({ productId: { $in: productIds } })
      }
    }

    // Combinar com $and
    if (andConditions.length > 0) {
      query.$and = andConditions
    }
  }

  return query
}

// ─────────────────────────────────────────────────────────────
// HELPER: Construir condição de uma rule
// ─────────────────────────────────────────────────────────────

function buildRuleCondition(rule: IRule): any {
  const { field, operator, value } = rule

  // Operadores simples
  switch (operator) {
    case 'equals':
      return { [field]: value }

    case 'notEquals':
      return { [field]: { $ne: value } }

    case 'contains':
      return { [field]: { $regex: value, $options: 'i' } }

    case 'notContains':
      return { [field]: { $not: { $regex: value, $options: 'i' } } }

    case 'startsWith':
      return { [field]: { $regex: `^${value}`, $options: 'i' } }

    case 'endsWith':
      return { [field]: { $regex: `${value}$`, $options: 'i' } }

    case 'greaterThan':
      return { [field]: { $gt: value } }

    case 'lessThan':
      return { [field]: { $lt: value } }

    case 'greaterThanOrEqual':
      return { [field]: { $gte: value } }

    case 'lessThanOrEqual':
      return { [field]: { $lte: value } }

    case 'in':
      return { [field]: { $in: Array.isArray(value) ? value : [value] } }

    case 'notIn':
      return { [field]: { $nin: Array.isArray(value) ? value : [value] } }

    case 'olderThan': {
      // Calcular data
      const days = parseInt(value, 10)
      const date = new Date()
      date.setDate(date.getDate() - days)
      return { [field]: { $lt: date } }
    }

    case 'newerThan': {
      const days = parseInt(value, 10)
      const date = new Date()
      date.setDate(date.getDate() - days)
      return { [field]: { $gt: date } }
    }

    default:
      logger.warn(`⚠️ Operator não suportado: ${operator}`)
      return {}
  }
}