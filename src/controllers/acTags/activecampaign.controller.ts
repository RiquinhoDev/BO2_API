// =====================================================
// 📁 src/controllers/activecampaign.controller.ts
// ✅ UNIFICADO: activecampaign.controller.ts + activecampaignV2.controller.ts
// Endpoints de gestão Active Campaign (Legacy + V2 Tags por Produto)
// =====================================================

import type { RequestHandler, Response } from 'express'
import type { FilterQuery, Types } from 'mongoose'

import User from '../../models/user'
import CronExecutionLog from '../../models/cron/CronExecutionLog'
import TagRule from '../../models/acTags/TagRule'
import { CommunicationHistory, Product, UserProduct } from '../../models'
import activeCampaignService from '../../services/activeCampaign/activeCampaignService'
import decisionEngine from '../../services/activeCampaign/decisionEngine.service'
import type { IUserProduct } from '../../models/UserProduct'
import type {
  ICommunicationHistory,
  IUserStateSnapshot,
} from '../../models/acTags/CommunicationHistory'
import type {
  ActiveCampaignEmptyInput,
  ActiveCampaignProductSyncInput,
  ActiveCampaignTagMutationInput,
  ActiveCampaignTagRuleDeleteInput,
} from '../../security/activeCampaignDestructiveInput'

type EvaluationError = {
  productId: Types.ObjectId
  userProductId?: Types.ObjectId
  error: string
}

type PopulatedUser = {
  _id: Types.ObjectId
  name?: string
  email?: string
}

type PopulatedCourse = {
  _id: Types.ObjectId
  name?: string
  code?: string
}

type PopulatedProduct = {
  _id: Types.ObjectId
  name?: string
  code?: string
  platform?: string
}

type PopulatedRule = {
  _id: Types.ObjectId
  name?: string
  category?: string
}

type CommunicationHistoryRecord = {
  _id: Types.ObjectId
  userId: Types.ObjectId | PopulatedUser
  courseId?: Types.ObjectId | PopulatedCourse
  tagRuleId?: Types.ObjectId | PopulatedRule
  tagApplied: string
  sentAt?: Date
  createdAt: Date
  source: ICommunicationHistory['source']
  status: ICommunicationHistory['status']
  userStateSnapshot?: IUserStateSnapshot
}

type PopulatedUserProduct = {
  _id: Types.ObjectId
  userId: PopulatedUser
  productId: Types.ObjectId | PopulatedProduct
  activeCampaignData?: IUserProduct['activeCampaignData']
  progress?: IUserProduct['progress']
}

type SyncUserProduct = {
  _id: Types.ObjectId
  userId: PopulatedUser
}

type ProductSyncResults = {
  synced: number
  failed: number
  errors: Array<{ userProductId: Types.ObjectId; error: string }>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function queryString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function isPopulatedUser(value: Types.ObjectId | PopulatedUser): value is PopulatedUser {
  return 'email' in value || 'name' in value
}

function isPopulatedCourse(
  value: Types.ObjectId | PopulatedCourse | undefined
): value is PopulatedCourse {
  return value !== undefined && ('name' in value || 'code' in value)
}

function isPopulatedRule(
  value: Types.ObjectId | PopulatedRule | undefined
): value is PopulatedRule {
  return value !== undefined && ('name' in value || 'category' in value)
}

/**
 * POST /api/activecampaign/test-cron
 * ✅ NOVO: Executa avaliação manual usando DecisionEngine por produto
 */
export const testCron = async (_input: ActiveCampaignEmptyInput, res: Response): Promise<void> => {
  const startTime = Date.now()
  const executionId = `MANUAL_${Date.now()}`

  try {
    console.log('🧪 Iniciando avaliação manual (novo sistema)...')

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTOS ATIVOS
    // ═══════════════════════════════════════════════════════════
    const products = await Product.find({ isActive: true }).populate('courseId')
    console.log(`📦 Encontrados ${products.length} produtos ativos`)

    let totalUserProducts = 0
    let totalDecisions = 0
    let totalExecutions = 0
    const errors: EvaluationError[] = []

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA PRODUTO
    // ═══════════════════════════════════════════════════════════
    for (const product of products) {
      try {
        console.log(`\n📦 Processando produto: ${product.name} (${product.code})`)

        // ✅ BUSCAR USERPRODUCTS ATIVOS DESTE PRODUTO
        const userProducts = await UserProduct.find({
          productId: product._id,
          status: 'ACTIVE'
        })

        if (userProducts.length === 0) {
          console.log(`   ⚠️  Nenhum UserProduct ativo`)
          continue
        }

        console.log(`   👥 ${userProducts.length} UserProduct(s) ativo(s)`)
        totalUserProducts += userProducts.length

        // ═══════════════════════════════════════════════════════════
        // 3. AVALIAR CADA USERPRODUCT COM DECISIONENGINE
        // ═══════════════════════════════════════════════════════════
        for (const up of userProducts) {
          try {
            const result = await decisionEngine.evaluateUserProduct(
              up.userId.toString(),
              product._id.toString()
            )

            totalDecisions++
            totalExecutions += result.actionsExecuted || 0

            if (result.errors && result.errors.length > 0) {
              console.error(`   ⚠️  Erros:`, result.errors)
            }
          } catch (userError: unknown) {
            const message = errorMessage(userError, 'Erro ao avaliar UserProduct')
            console.error(`   ❌ Erro UserProduct ${up._id}:`, message)
            errors.push({
              userProductId: up._id,
              productId: product._id,
              error: message
            })
          }
        }

        console.log(`   ✅ ${userProducts.length} UserProducts avaliados`)

      } catch (productError: unknown) {
        const message = errorMessage(productError, 'Erro ao avaliar produto')
        console.error(`❌ Erro produto ${product._id}:`, message)
        errors.push({
          productId: product._id,
          error: message
        })
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. REGISTAR EXECUÇÃO
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime

    await CronExecutionLog.create({
      executionId,
      type: 'manual-trigger',
      status: 'success',
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      duration,
      results: {
        totalProducts: products.length,
        totalUserProducts,
        decisionsEvaluated: totalDecisions,
        actionsExecuted: totalExecutions,
        errors
      }
    })

    console.log(`\n✅ Avaliação manual concluída (novo sistema)`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log(`📦 Produtos: ${products.length}`)
    console.log(`👥 UserProducts: ${totalUserProducts}`)
    console.log(`🎯 Decisões: ${totalDecisions}`)
    console.log(`⚡ Ações executadas: ${totalExecutions}`)

    // ═══════════════════════════════════════════════════════════
    // 5. RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json({
      success: true,
      executionId,
      duration: `${(duration / 1000).toFixed(2)}s`,
      results: {
        totalProducts: products.length,
        totalUserProducts,
        decisionsEvaluated: totalDecisions,
        actionsExecuted: totalExecutions,
        errors: errors.length
      }
    })
    return
  } catch (error: unknown) {
    console.error('❌ Erro na avaliação manual:', error)

    await CronExecutionLog.create({
      executionId,
      type: 'manual-trigger',
      status: 'failed',
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      duration: Date.now() - startTime,
      results: {
        error: errorMessage(error, 'Erro na avaliação manual')
      }
    })

    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro na avaliação manual')
    })
    return
  }
}

/**
 * GET /api/activecampaign/cron-logs
 * Retorna histórico das últimas 20 execuções
 */
export const getCronLogs: RequestHandler = async (_req, res) => {
  try {
    const logs = await CronExecutionLog.find().sort({ startedAt: -1 }).limit(20)
    res.json({ success: true, logs })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error, 'Erro ao buscar cron logs') })
    return
  }
}

/**
 * GET /api/activecampaign/stats
 * Estatísticas gerais do Active Campaign
 */
export const getStats: RequestHandler = async (_req, res) => {
  try {
    console.log('📊 Buscando stats do Active Campaign...')

    const totalMonitored = await User.countDocuments({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })

    const tagsAppliedToday = 0
    const emailsSent = 0
    const openRate = 0.65

    console.log(`✅ Stats: ${totalMonitored} monitorizados`)

    res.json({
      success: true,
      stats: {
        totalMonitored,
        tagsAppliedToday,
        emailsSent,
        openRate
      }
    })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao buscar stats:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao buscar estatísticas')
    })
    return
  }
}

/**
 * GET /api/tag-rules
 */
export const getAllTagRules: RequestHandler = async (_req, res) => {
  try {
    console.log('🏷️ Buscando tag rules...')

    const rules = await TagRule.find()
      .populate('courseId', 'name code')  // ✅ Adicionar "code"
      .sort({ priority: -1 })

    console.log(`✅ ${rules.length} regras encontradas`)

    res.json({ 
      success: true, 
      count: rules.length,
      data: rules  // ✅ MUDAR DE "rules" PARA "data"
    })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao buscar tag rules:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao buscar regras')
    })
    return
  }
}
/**
 * POST /api/tag-rules
 */
export const createTagRule: RequestHandler = async (req, res) => {
  try {
    console.log('➕ Criando tag rule:', req.body)

    const rule = new TagRule(req.body)
    await rule.save()

    console.log(`✅ Regra criada: ${rule._id}`)

    res.json({ success: true, rule })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao criar tag rule:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao criar regra')
    })
    return
  }
}

/**
 * PUT /api/tag-rules/:id
 */
export const updateTagRule: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params
    console.log(`🔄 Atualizando tag rule: ${id}`)

    const rule = await TagRule.findByIdAndUpdate(id, req.body, { new: true })

    if (!rule) {
      res.status(404).json({ success: false, error: 'Regra não encontrada' })
      return
    }

    console.log(`✅ Regra atualizada: ${rule._id}`)

    res.json({ success: true, rule })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao atualizar tag rule:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao atualizar regra')
    })
    return
  }
}

/**
 * DELETE /api/tag-rules/:id
 */
export const deleteTagRule = async (input: ActiveCampaignTagRuleDeleteInput, res: Response): Promise<void> => {
  try {
    const { id } = input.params
    console.log(`🗑️ Deletando tag rule: ${id}`)

    const rule = await TagRule.findByIdAndDelete(id)

    if (!rule) {
      res.status(404).json({ success: false, error: 'Regra não encontrada' })
      return
    }

    console.log(`✅ Regra deletada: ${id}`)

    res.json({ success: true, message: 'Regra deletada com sucesso' })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao deletar tag rule:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao deletar regra')
    })
    return
  }
}

/**
 * GET /api/communication-history
 */
export const getCommunicationHistory: RequestHandler = async (req, res) => {
  try {
    console.log('📜 Buscando histórico de comunicações...')

    const { 
      userId, 
      courseId, 
      action, 
      source,
      startDate, 
      endDate,
      limit = '50',
      page = '1',
      tagName,
      email
    } = req.query

    // ═══════════════════════════════════════════════════════════
    // CONSTRUIR FILTRO
    // ═══════════════════════════════════════════════════════════
    const filter: FilterQuery<ICommunicationHistory> = {}
    
    // ✅ Se veio email, buscar userId primeiro
    if (email) {
      const emailValue = queryString(email, '').toLowerCase()
      const user = await User.findOne({ email: emailValue })
      if (user) {
        filter.userId = user._id
        console.log(`🔍 Email "${email}" → userId: ${user._id}`)
      } else {
        console.log(`⚠️  Email "${email}" não encontrado`)
        res.json({
          success: true,
          history: [],
          pagination: { total: 0, page: 1, limit: parseInt(queryString(limit, '50')), pages: 0 }
        })
        return
      }
    }
    
    if (userId) filter.userId = userId
    if (courseId) filter.courseId = courseId
    if (source) filter.source = source
    if (tagName) filter.tagApplied = { $regex: tagName, $options: 'i' }
    
    if (startDate || endDate) {
      const createdAt: { $gte?: Date; $lte?: Date } = {}
      if (startDate) createdAt.$gte = new Date(queryString(startDate, ''))
      if (endDate) createdAt.$lte = new Date(queryString(endDate, ''))
      filter.createdAt = createdAt
    }

    console.log('🔍 Filtros aplicados:', filter)

    // ═══════════════════════════════════════════════════════════
    // BUSCAR COM PAGINAÇÃO E POPULATE
    // ═══════════════════════════════════════════════════════════
    const limitNum = parseInt(queryString(limit, '50'))
    const pageNum = parseInt(queryString(page, '1'))
    const skip = (pageNum - 1) * limitNum

    const [rawHistory, total] = await Promise.all([
      CommunicationHistory.find(filter)
        .populate('userId', 'name email')
        .populate('courseId', 'name code')
        .populate('tagRuleId', 'name category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean<CommunicationHistoryRecord[]>(),
      
      CommunicationHistory.countDocuments(filter)
    ])

    console.log(`✅ ${rawHistory.length} registos encontrados (total: ${total})`)

    // ═══════════════════════════════════════════════════════════
    // ✅ MAPEAR PARA FORMATO DO FRONTEND!
    // ═══════════════════════════════════════════════════════════
    const history = rawHistory.map(record => {
      // Extrair dados do populate
      const user = isPopulatedUser(record.userId) ? record.userId : undefined
      const course = isPopulatedCourse(record.courseId) ? record.courseId : undefined
      const rule = isPopulatedRule(record.tagRuleId) ? record.tagRuleId : undefined

      return {
        _id: record._id.toString(),
        
        // ✅ User data (extraído do populate)
        userId: user?._id?.toString() || record.userId?.toString() || '',
        userName: user?.name || 'Desconhecido',
        userEmail: user?.email || 'N/A',
        
        // ✅ Course data (extraído do populate)
        courseId: course?._id?.toString() || record.courseId?.toString() || '',
        courseName: course?.name || 'Desconhecido',
        
        // ✅ Tag data
        tagApplied: record.tagApplied || 'N/A',
        tagId: rule?._id?.toString() || record.tagRuleId?.toString() || '',
        
        // ✅ Dates (usar sentAt ou createdAt)
        appliedAt: record.sentAt || record.createdAt,
        
        // ✅ Reason (construir a partir dos dados disponíveis)
        reason: buildReason(record, rule),
        
        // ✅ Metadata adicional (útil para futuro)
        source: record.source,
        status: record.status,
        userStateSnapshot: record.userStateSnapshot
      }
    })

    // ═══════════════════════════════════════════════════════════
    // RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json({
      success: true,
      history,  // ✅ Array mapeado!
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao buscar histórico:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao buscar histórico')
    })
    return
  }
}
/**
 * GET /api/activecampaign/history/stats
 * Retorna estatísticas agregadas do histórico
 */
export const getHistoryStats: RequestHandler = async (req, res) => {
  try {
    console.log('📊 Calculando estatísticas do histórico...')

    const { days = '30' } = req.query
    const daysNum = parseInt(queryString(days, '30'))
    
    const since = new Date()
    since.setDate(since.getDate() - daysNum)

    console.log(`📅 Desde: ${since.toISOString()} (${daysNum} dias)`)

    // ═══════════════════════════════════════════════════════════
    // AGREGAÇÕES
    // ═══════════════════════════════════════════════════════════
    const stats = await CommunicationHistory.aggregate([
      {
        $match: {
          timestamp: { $gte: since }
        }
      },
      {
        $facet: {
          // Por tipo de ação
          byAction: [
            { 
              $group: { 
                _id: '$action', 
                count: { $sum: 1 } 
              } 
            },
            { $sort: { count: -1 } }
          ],
          
          // Por fonte
          bySource: [
            { 
              $group: { 
                _id: '$source', 
                count: { $sum: 1 } 
              } 
            },
            { $sort: { count: -1 } }
          ],
          
          // Por dia
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 },
                tagsAdded: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_ADDED'] }, 1, 0]
                  }
                },
                tagsRemoved: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_REMOVED'] }, 1, 0]
                  }
                }
              }
            },
            { $sort: { _id: 1 } }
          ],
          
          // Top 10 tags mais usadas
          topTags: [
            { 
              $group: { 
                _id: '$tagName', 
                count: { $sum: 1 } 
              } 
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          
          // Top 10 regras mais executadas
          topRules: [
            { 
              $match: { tagRuleId: { $exists: true } }
            },
            { 
              $lookup: {
                from: 'tagrules',
                localField: 'tagRuleId',
                foreignField: '_id',
                as: 'rule'
              }
            },
            { $unwind: '$rule' },
            {
              $group: {
                _id: '$tagRuleId',
                ruleName: { $first: '$rule.name' },
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          
          // Total geral
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                tagsAdded: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_ADDED'] }, 1, 0]
                  }
                },
                tagsRemoved: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_REMOVED'] }, 1, 0]
                  }
                },
                emailsSent: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'EMAIL_SENT'] }, 1, 0]
                  }
                },
                uniqueUsers: { $addToSet: '$userId' }
              }
            },
            {
              $project: {
                _id: 0,
                total: 1,
                tagsAdded: 1,
                tagsRemoved: 1,
                emailsSent: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
              }
            }
          ]
        }
      }
    ])

    const result = stats[0]

    console.log(`✅ Estatísticas calculadas:`)
    console.log(`   Total de ações: ${result.totals[0]?.total || 0}`)
    console.log(`   Tags aplicadas: ${result.totals[0]?.tagsAdded || 0}`)
    console.log(`   Tags removidas: ${result.totals[0]?.tagsRemoved || 0}`)

    // ═══════════════════════════════════════════════════════════
    // RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json({
      success: true,
      period: {
        days: daysNum,
        since: since.toISOString(),
        until: new Date().toISOString()
      },
      totals: result.totals[0] || {
        total: 0,
        tagsAdded: 0,
        tagsRemoved: 0,
        emailsSent: 0,
        uniqueUsers: 0
      },
      byAction: result.byAction,
      bySource: result.bySource,
      byDay: result.byDay,
      topTags: result.topTags,
      topRules: result.topRules
    })
    return
  } catch (error: unknown) {
    console.error('❌ Erro ao calcular stats:', error)
    res.status(500).json({ 
      success: false, 
      error: errorMessage(error, 'Erro ao calcular estatísticas')
    })
    return
  }
}
export const applyTagToUserProduct = async (input: ActiveCampaignTagMutationInput, res: Response): Promise<void> => {
  try {
    const { userId, productId, tagName } = input.body

    if (!userId || !productId || !tagName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productId, tagName'
      })
      return
    }

    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!user || !product) {
      res.status(404).json({
        success: false,
        message: 'User ou Product não encontrado'
      })
      return
    }

    let userProduct = await UserProduct.findOne({ userId, productId })

    if (!userProduct) {
      userProduct = await UserProduct.create({
        userId,
        productId,
        status: 'ACTIVE',
        progress: { percentage: 0 }
      })
    }

    const acContact = await activeCampaignService.findOrCreateContact(user.email)
    
    // ✅ USAR TAG DIRETAMENTE (sem adicionar prefixo!)
    // Tag já vem formatada: "OGI_V1 - Inativo 7d"
    await activeCampaignService.addTag(user.email, tagName)  // ← SEM PREFIXO!

    if (!userProduct.activeCampaignData) {
      userProduct.activeCampaignData = {
        contactId: acContact.id,
        tags: [],
        lists: []
      }
    }

    if (!userProduct.activeCampaignData.tags.includes(tagName)) {
      userProduct.activeCampaignData.tags.push(tagName)  // ← SEM PREFIXO!
    }

    userProduct.activeCampaignData.lastSyncAt = new Date()
    await userProduct.save()

    res.json({
      success: true,
      data: {
        userId: user._id,
        productId: product._id,
        productName: product.name,
        tagApplied: tagName,
        acContactId: acContact.id
      },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    console.error('[AC TAG APPLY ERROR]', error)
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao aplicar tag') })
    return
  }
}


export const removeTagFromUserProduct = async (input: ActiveCampaignTagMutationInput, res: Response): Promise<void> => {
  try {
    const { userId, productId, tagName } = input.body

    if (!userId || !productId || !tagName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productId, tagName'
      })
      return
    }

    const userProduct = await UserProduct.findOne({ userId, productId })

    if (!userProduct || !userProduct.activeCampaignData) {
      res.status(404).json({
        success: false,
        message: 'UserProduct ou AC data não encontrado'
      })
      return
    }

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({ success: false, message: 'User não encontrado' })
      return
    }

    const acContact = await activeCampaignService.findOrCreateContact(user.email)
    
    // ✅ REMOVER TAG DIRETAMENTE (sem adicionar prefixo!)
    await activeCampaignService.removeTag(user.email, tagName)  // ← SEM PREFIXO!

    userProduct.activeCampaignData.tags = (userProduct.activeCampaignData.tags || []).filter(
      (t: string) => t !== tagName  // ← SEM PREFIXO!
    )

    userProduct.activeCampaignData.lastSyncAt = new Date()
    await userProduct.save()

    res.json({
      success: true,
      data: { userId, productId, tagRemoved: tagName },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    console.error('[AC TAG REMOVE ERROR]', error)
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao remover tag') })
    return
  }
}

/**
 * GET /api/activecampaign/v2/products/:productId/tagged
 */
export const getUsersWithTagsInProduct: RequestHandler = async (req, res) => {
  try {
    const { productId } = req.params
    const { tag } = req.query

    const product = await Product.findById(productId)
    if (!product) {
      res.status(404).json({ success: false, message: 'Product não encontrado' })
      return
    }

    const query: FilterQuery<IUserProduct> = { productId }
    if (tag) query['activeCampaignData.tags'] = tag

    const userProducts = await UserProduct.find(query)
      .populate('userId', 'name email')
      .populate('productId', 'name code platform')
      .lean<PopulatedUserProduct[]>()

    const enrichedData = userProducts.map(up => ({
      user: up.userId,
      product: up.productId,
      tags: up.activeCampaignData?.tags || [],
      lastSync: up.activeCampaignData?.lastSyncAt,
      progress: up.progress?.percentage || 0
    }))

    res.json({
      success: true,
      data: enrichedData,
      count: enrichedData.length,
      filters: { productId, tag },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao buscar tags do produto') })
    return
  }
}

/**
 * GET /api/activecampaign/v2/stats
 */
export const getACStats: RequestHandler = async (_req, res) => {
  try {
    const products = await Product.find().lean()

    const stats = await Promise.all(
      products.map(async product => {
        const userProducts = await UserProduct.find({
          productId: product._id,
          'activeCampaignData.tags': { $exists: true, $ne: [] }
        }).lean()

        const allTags = userProducts.flatMap(up => up.activeCampaignData?.tags || [])
        const uniqueTags = [...new Set(allTags)]

        return {
          productId: product._id,
          productName: product.name,
          platform: product.platform,
          totalUsersWithTags: userProducts.length,
          uniqueTags: uniqueTags.length,
          tagList: uniqueTags
        }
      })
    )

    res.json({
      success: true,
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsersWithTags: stats.reduce((sum, s) => sum + s.totalUsersWithTags, 0),
        totalUniqueTags: [...new Set(stats.flatMap(s => s.tagList))].length
      },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao buscar estatísticas AC') })
    return
  }
}

/**
 * POST /api/activecampaign/v2/sync/:productId
 */
export const syncProductTags = async (input: ActiveCampaignProductSyncInput, res: Response): Promise<void> => {
  try {
    const { productId } = input.params

    const product = await Product.findById(productId)
    if (!product) {
      res.status(404).json({ success: false, message: 'Product não encontrado' })
      return
    }

    const userProducts = await UserProduct.find({ productId })
      .populate('userId', 'email')
      .lean<SyncUserProduct[]>()

    const results: ProductSyncResults = {
      synced: 0,
      failed: 0,
      errors: []
    }

    for (const up of userProducts) {
      try {
        const user = up.userId
        if (!user.email) {
          throw new Error('Utilizador sem email para sincronização ActiveCampaign')
        }
        const acContact = await activeCampaignService.findOrCreateContact(user.email)

        await UserProduct.findByIdAndUpdate(up._id, {
          'activeCampaignData.contactId': acContact.id,
          'activeCampaignData.lastSyncAt': new Date()
        })

        results.synced++
      } catch (error: unknown) {
        results.failed++
        results.errors.push({
          userProductId: up._id,
          error: errorMessage(error, 'Erro ao sincronizar UserProduct')
        })
      }
    }

    res.json({
      success: true,
      data: results,
      productId,
      productName: product.name,
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao sincronizar tags') })
    return
  }
}
export function buildReason(
  record: Pick<CommunicationHistoryRecord, 'userStateSnapshot'>,
  rule?: PopulatedRule
): string {
  // Se tiver snapshot, usar para criar reason descritivo
  const snapshot = record.userStateSnapshot
  
  if (!snapshot) {
    return rule?.name || 'Regra aplicada automaticamente'
  }

  const parts: string[] = []
  
  // Adicionar informação de inatividade
  if (snapshot.daysSinceLastLogin != null) {
    parts.push(`${snapshot.daysSinceLastLogin} dias sem login`)
  } else if (snapshot.daysSinceLastAction != null) {
    parts.push(`${snapshot.daysSinceLastAction} dias inativo`)
  }
  
  // Adicionar progresso
  if (snapshot.currentProgress !== undefined) {
    parts.push(`progresso ${snapshot.currentProgress}%`)
  }
  
  // Se tiver nome da regra, adicionar
  if (rule?.name) {
    parts.push(`(${rule.name})`)
  }
  
  return parts.length > 0 
    ? parts.join(', ') 
    : 'Regra aplicada automaticamente'
}
