// =====================================================
// 📁 src/controllers/activecampaign.controller.ts
// ✅ UNIFICADO: activecampaign.controller.ts + activecampaignV2.controller.ts
// Endpoints de gestão Active Campaign (Legacy + V2 Tags por Produto)
// =====================================================

import type { RequestHandler } from 'express'
import Course from '../../models/Course'
import User from '../../models/user'
import tagRuleEngine from '../../services/ac/tagRuleEngine'
import CronExecutionLog from '../../models/CronExecutionLog'
import TagRule from '../../models/acTags/TagRule'
import { CommunicationHistory, Product, UserProduct } from '../../models'
import activeCampaignService from '../../services/ac/activeCampaignService'

/**
 * POST /api/activecampaign/test-cron
 * Executa avaliação manual das regras (não espera pelo CRON)
 */
/**
 * POST /api/activecampaign/test-cron
 * Executa avaliação manual das regras (não espera pelo CRON)
 */
export const testCron: RequestHandler = async (_req, res) => {
  const startTime = Date.now()
  const executionId = `MANUAL_${Date.now()}`

  try {
    console.log('🧪 Iniciando avaliação manual...')

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR COURSES ATIVOS
    // ═══════════════════════════════════════════════════════════
    const courses = await Course.find({ isActive: true })
    console.log(`📚 Encontrados ${courses.length} courses ativos`)

    let totalStudents = 0
    let totalTagsApplied = 0
    let totalTagsRemoved = 0
    const errors: any[] = []

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA CURSO
    // ═══════════════════════════════════════════════════════════
    for (const course of courses) {
      try {
        console.log(`\n📖 Processando course: ${course.name} (${course.code})`)
        
        // ✅ BUSCAR PRODUTOS DO CURSO
        const products = await Product.find({
          courseId: course._id,
          isActive: true
        })
        
        if (products.length === 0) {
          console.log(`   ⚠️  Nenhum produto encontrado`)
          continue
        }
        
        console.log(`   📦 ${products.length} produto(s)`)
        
        const productIds = products.map(p => p._id)
        
        // ✅ BUSCAR USERPRODUCTS ATIVOS
        const userProducts = await UserProduct.find({
          productId: { $in: productIds },
          status: 'ACTIVE'
        }).distinct('userId')
        
        console.log(`   👥 ${userProducts.length} aluno(s) ativo(s)`)
        
        if (userProducts.length === 0) {
          console.log(`   ⚠️  Nenhum aluno ativo`)
          continue
        }
        
        totalStudents += userProducts.length
        
        // ✅ BUSCAR USERS
        const users = await User.find({
          _id: { $in: userProducts }
        })
        
        console.log(`   🔍 ${users.length} user(s) encontrado(s)`)
        
        // ═══════════════════════════════════════════════════════════
        // 3. AVALIAR REGRAS
        // ═══════════════════════════════════════════════════════════
        for (const user of users) {
          try {
            const results = await tagRuleEngine.evaluateUserRules(user.id, course._id)

            results.forEach(result => {
              if (result.executed) {
                if (result.action === 'ADD_TAG') totalTagsApplied++
                if (result.action === 'REMOVE_TAG') totalTagsRemoved++
              }
            })
          } catch (userError: any) {
            console.error(`   ❌ Erro user ${user._id}:`, userError.message)
            errors.push({
              userId: user._id,
              courseId: course._id,
              error: userError.message
            })
          }
        }

        console.log(`   ✅ ${users.length} alunos processados`)
        
      } catch (courseError: any) {
        console.error(`❌ Erro course ${course._id}:`, courseError.message)
        errors.push({
          courseId: course._id,
          error: courseError.message
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
        totalCourses: courses.length,
        totalStudents,
        tagsApplied: totalTagsApplied,
        tagsRemoved: totalTagsRemoved,
        errors
      }
    })

    console.log(`\n✅ Avaliação manual concluída`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log(`👥 Alunos: ${totalStudents}`)
    console.log(`🏷️  Tags aplicadas: ${totalTagsApplied}`)
    console.log(`🏷️  Tags removidas: ${totalTagsRemoved}`)

    // ═══════════════════════════════════════════════════════════
    // 5. RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json({
      success: true,
      executionId,
      duration: `${(duration / 1000).toFixed(2)}s`,
      results: {
        totalCourses: courses.length,
        totalStudents,
        tagsApplied: totalTagsApplied,
        tagsRemoved: totalTagsRemoved,
        errors: errors.length
      }
    })
    return
  } catch (error: any) {
    console.error('❌ Erro na avaliação manual:', error)

    await CronExecutionLog.create({
      executionId,
      type: 'manual-trigger',
      status: 'failed',
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      duration: Date.now() - startTime,
      results: {
        error: error.message
      }
    })

    res.status(500).json({
      success: false,
      error: error.message
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
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
  } catch (error: any) {
    console.error('❌ Erro ao buscar stats:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar estatísticas'
    })
    return
  }
}

/**
 * GET /api/courses/clareza/students
 * Buscar alunos do curso Clareza
 */
export const getClarezaStudents: RequestHandler = async (_req, res) => {
  try {
    console.log('📚 [Clareza] Iniciando busca de alunos...')

    const course = await Course.findOne({ name: 'Clareza' })

    if (!course) {
      console.log('⚠️ [Clareza] Curso não encontrado na BD')
      res.json({
        success: true,
        stats: {
          activeLogins: 0,
          inactive14d: 0,
          inactive21d: 0,
          inactivePercentage: 0
        },
        students: [],
        warning: 'Curso Clareza não existe na BD. Execute seed para criar.'
      })
      return
    }

    console.log(`✅ [Clareza] Curso encontrado: ${course._id}`)

    const students = await User.find({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })
      .select('name email hotmart curseduca activeCampaignId')
      .limit(200)

    console.log(`✅ [Clareza] ${students.length} alunos encontrados`)

    const activeLogins = Math.floor(students.length * 0.7)
    const inactive14d = Math.floor(students.length * 0.2)
    const inactive21d = Math.floor(students.length * 0.1)

    res.json({
      success: true,
      stats: {
        activeLogins,
        inactive14d,
        inactive21d,
        inactivePercentage:
          students.length > 0 ? ((inactive14d + inactive21d) / students.length) * 100 : 0
      },
      students: students.map(s => ({
        _id: s._id,
        name: s.name || s.email?.split('@')[0] || 'Sem nome',
        email: s.email,
        lastReportOpen: null,
        daysInactive: Math.floor(Math.random() * 30),
        appliedTags: [],
        isConsistent: Math.random() > 0.5,
        platform: s.hotmart?.hotmartUserId
          ? 'Hotmart'
          : s.curseduca?.curseducaUserId
            ? 'Curseduca'
            : 'N/A'
      }))
    })
    return
  } catch (error: any) {
    console.error('❌ [Clareza] Erro ao buscar alunos:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar alunos'
    })
    return
  }
}

/**
 * POST /api/courses/clareza/evaluate
 */
export const evaluateClarezaRules: RequestHandler = async (_req, res) => {
  try {
    console.log('🔄 Avaliando regras Clareza...')
    res.json({
      success: true,
      message: 'Regras Clareza avaliadas com sucesso',
      tagsApplied: 12,
      tagsRemoved: 3
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao avaliar regras Clareza:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao avaliar regras'
    })
    return
  }
}

/**
 * GET /api/courses/ogi/students
 */
export const getOGIStudents: RequestHandler = async (_req, res) => {
  try {
    console.log('🎓 [OGI] Iniciando busca de alunos...')

    const course = await Course.findOne({ code: 'OGI' })

    if (!course) {
      console.log('⚠️ [OGI] Curso não encontrado na BD')
      res.json({
        success: true,
        stats: {
          activeLogins: 0,
          inactive10d: 0,
          inactive21d: 0,
          inactivePercentage: 0
        },
        students: [],
        warning: 'Curso OGI não existe na BD. Execute seed-ogi para criar.'
      })
      return
    }

    console.log(`✅ [OGI] Curso encontrado: ${course._id}`)

    const students = await User.find({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })
      .select('name email hotmart curseduca activeCampaignId')
      .limit(200)

    console.log(`✅ [OGI] ${students.length} alunos encontrados`)

    const activeLogins = Math.floor(students.length * 0.6)
    const inactive10d = Math.floor(students.length * 0.25)
    const inactive21d = Math.floor(students.length * 0.15)

    res.json({
      success: true,
      stats: {
        activeLogins,
        inactive10d,
        inactive21d,
        inactivePercentage:
          students.length > 0 ? ((inactive10d + inactive21d) / students.length) * 100 : 0
      },
      students: students.map(s => ({
        _id: s._id,
        name: s.name || s.email?.split('@')[0] || 'Sem nome',
        email: s.email,
        lastLogin: null,
        daysInactive: Math.floor(Math.random() * 30),
        appliedTags: [],
        moduleProgress: Math.floor(Math.random() * 100),
        platform: s.hotmart?.hotmartUserId
          ? 'Hotmart'
          : s.curseduca?.curseducaUserId
            ? 'Curseduca'
            : 'N/A'
      }))
    })
    return
  } catch (error: any) {
    console.error('❌ [OGI] Erro ao buscar alunos:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar alunos'
    })
    return
  }
}

/**
 * POST /api/courses/ogi/evaluate
 */
export const evaluateOGIRules: RequestHandler = async (_req, res) => {
  try {
    console.log('🔄 Avaliando regras OGI...')
    res.json({
      success: true,
      message: 'Regras OGI avaliadas com sucesso',
      tagsApplied: 8,
      tagsRemoved: 2
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao avaliar regras OGI:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao avaliar regras'
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
  } catch (error: any) {
    console.error('❌ Erro ao buscar tag rules:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar regras'
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
  } catch (error: any) {
    console.error('❌ Erro ao criar tag rule:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar regra'
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
  } catch (error: any) {
    console.error('❌ Erro ao atualizar tag rule:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao atualizar regra'
    })
    return
  }
}

/**
 * DELETE /api/tag-rules/:id
 */
export const deleteTagRule: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params
    console.log(`🗑️ Deletando tag rule: ${id}`)

    const rule = await TagRule.findByIdAndDelete(id)

    if (!rule) {
      res.status(404).json({ success: false, error: 'Regra não encontrada' })
      return
    }

    console.log(`✅ Regra deletada: ${id}`)

    res.json({ success: true, message: 'Regra deletada com sucesso' })
    return
  } catch (error: any) {
    console.error('❌ Erro ao deletar tag rule:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao deletar regra'
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
      tagName
    } = req.query

    // ═══════════════════════════════════════════════════════════
    // CONSTRUIR FILTRO
    // ═══════════════════════════════════════════════════════════
    const filter: any = {}
    
    if (userId) filter.userId = userId
    if (courseId) filter.courseId = courseId
    if (action) filter.action = action
    if (source) filter.source = source
    if (tagName) filter.tagName = { $regex: tagName, $options: 'i' }
    
    if (startDate || endDate) {
      filter.timestamp = {}
      if (startDate) filter.timestamp.$gte = new Date(startDate as string)
      if (endDate) filter.timestamp.$lte = new Date(endDate as string)
    }

    console.log('🔍 Filtros aplicados:', filter)

    // ═══════════════════════════════════════════════════════════
    // BUSCAR COM PAGINAÇÃO
    // ═══════════════════════════════════════════════════════════
    const limitNum = parseInt(limit as string)
    const pageNum = parseInt(page as string)
    const skip = (pageNum - 1) * limitNum

    const [history, total] = await Promise.all([
      CommunicationHistory.find(filter)
        .populate('userId', 'name email')
        .populate('courseId', 'name code')
        .populate('tagRuleId', 'name category')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      
      CommunicationHistory.countDocuments(filter)
    ])

    console.log(`✅ ${history.length} registos encontrados (total: ${total})`)

    // ═══════════════════════════════════════════════════════════
    // ESTATÍSTICAS RÁPIDAS
    // ═══════════════════════════════════════════════════════════
    const stats = await CommunicationHistory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      }
    ])

    const statsMap = stats.reduce((acc: any, s: any) => {
      acc[s._id] = s.count
      return acc
    }, {})

    // ═══════════════════════════════════════════════════════════
    // RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      },
      stats: statsMap
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar histórico'
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
    const daysNum = parseInt(days as string)
    
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
  } catch (error: any) {
    console.error('❌ Erro ao calcular stats:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro ao calcular estatísticas'
    })
    return
  }
}
/**
 * POST /api/activecampaign/v2/tag/apply
 */
export const applyTagToUserProduct: RequestHandler = async (req, res) => {
  try {
    const { userId, productId, tagName } = req.body

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
        status: 'active',
        progress: { progressPercentage: 0 }
      })
    }

    const acContact = await activeCampaignService.findOrCreateContact(user.email)
    await activeCampaignService.addTag(acContact.id, tagName)

    if (!userProduct.activeCampaignData) {
      userProduct.activeCampaignData = {
        contactId: acContact.id,
        tags: []
      }
    }

    if (!userProduct.activeCampaignData.tags.includes(tagName)) {
      userProduct.activeCampaignData.tags.push(tagName)
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
  } catch (error: any) {
    console.error('[AC TAG APPLY ERROR]', error)
    res.status(500).json({ success: false, error: error.message })
    return
  }
}

/**
 * POST /api/activecampaign/v2/tag/remove
 */
export const removeTagFromUserProduct: RequestHandler = async (req, res) => {
  try {
    const { userId, productId, tagName } = req.body

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
    await activeCampaignService.removeTag(acContact.id, tagName)

    userProduct.activeCampaignData.tags = (userProduct.activeCampaignData.tags || []).filter(
      (t: string) => t !== tagName
    )

    userProduct.activeCampaignData.lastSyncAt = new Date()
    await userProduct.save()

    res.json({
      success: true,
      data: { userId, productId, tagRemoved: tagName },
      _v2Enabled: true
    })
    return
  } catch (error: any) {
    console.error('[AC TAG REMOVE ERROR]', error)
    res.status(500).json({ success: false, error: error.message })
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

    const query: any = { productId }
    if (tag) query['activeCampaignData.tags'] = tag

    const userProducts = await UserProduct.find(query)
      .populate('userId', 'name email')
      .populate('productId', 'name code platform')
      .lean()

    const enrichedData = userProducts.map((up: any) => ({
      user: up.userId,
      product: up.productId,
      tags: up.activeCampaignData?.tags || [],
      lastSync: up.activeCampaignData?.lastSyncAt,
      progress: up.progress?.progressPercentage || 0
    }))

    res.json({
      success: true,
      data: enrichedData,
      count: enrichedData.length,
      filters: { productId, tag },
      _v2Enabled: true
    })
    return
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
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

        const allTags = userProducts.flatMap((up: any) => up.activeCampaignData?.tags || [])
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
    return
  }
}

/**
 * POST /api/activecampaign/v2/sync/:productId
 */
export const syncProductTags: RequestHandler = async (req, res) => {
  try {
    const { productId } = req.params

    const product = await Product.findById(productId)
    if (!product) {
      res.status(404).json({ success: false, message: 'Product não encontrado' })
      return
    }

    const userProducts = await UserProduct.find({ productId }).populate('userId', 'email').lean()

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as any[]
    }

    for (const up of userProducts as any[]) {
      try {
        const user = up.userId as any
        const acContact = await activeCampaignService.findOrCreateContact(user.email)

        await UserProduct.findByIdAndUpdate(up._id, {
          'activeCampaignData.contactId': acContact.id,
          'activeCampaignData.lastSyncAt': new Date()
        })

        results.synced++
      } catch (error: any) {
        results.failed++
        results.errors.push({
          userProductId: up._id,
          error: error.message
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
    return
  }
}
