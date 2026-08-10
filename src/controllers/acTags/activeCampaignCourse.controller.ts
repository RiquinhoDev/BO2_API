import type { RequestHandler } from 'express'
import { internalError } from '../../security/errorHandling'

import User from '../../models/user'
import { Course, Product, UserProduct } from '../../models'
import decisionEngine from '../../services/activeCampaign/decisionEngine.service'
import type { DecisionResult } from '../../services/activeCampaign/decisionEngine.service'
import logger from '../../utils/logger'

/**
 * GET /api/courses/clareza/students
 * Buscar alunos do curso Clareza
 */
export const getClarezaStudents: RequestHandler = async (_req, res, next) => {
  try {
    logger.info('📚 [Clareza] Iniciando busca de alunos...')

    const course = await Course.findOne({ name: 'Clareza' })

    if (!course) {
      logger.info('⚠️ [Clareza] Curso não encontrado na BD')
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

    logger.info(`✅ [Clareza] Curso encontrado: ${course._id}`)

    const students = await User.find({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })
      .select('name email hotmart curseduca activeCampaignId')
      .sort({ email: 1 })

    logger.info(`✅ [Clareza] ${students.length} alunos encontrados`)

    // ✅ BUSCAR PRODUTO CLAREZA
    const clarezaProduct = await Product.findOne({ name: 'Clareza' }).select('_id').lean()
    const clarezaProductId = clarezaProduct?._id

    // ✅ BUSCAR TAGS DA BD (UserProduct.activeCampaignData.tags) - FONTE DA VERDADE
    const userIds = students.map(s => s._id)
    const userProducts = await UserProduct.find({
      userId: { $in: userIds },
      productId: clarezaProductId
    }).select('userId activeCampaignData').lean()

    const emailToBDTagsMap = new Map<string, string[]>()
    userProducts.forEach(up => {
      const user = students.find(s => s._id.toString() === up.userId.toString())
      if (user?.email && up.activeCampaignData?.tags) {
        const clarezaTags = up.activeCampaignData.tags.filter((t: string) => /CLAREZA/i.test(t))
        if (clarezaTags.length > 0) {
          emailToBDTagsMap.set(user.email, clarezaTags)
        }
      }
    })

    // ✅ BUSCAR TAGS DO AC (ac_contact_states) - PARA COMPARAÇÃO
    const ACContactState = (await import('../../models/acTags/ACContactState')).default
    const acStates = await ACContactState.find({
      email: { $in: students.map(s => s.email).filter(Boolean) }
    }).lean()

    const emailToACTagsMap = new Map<string, string[]>()
    acStates.forEach(state => {
      if (state.email && state.tags && Array.isArray(state.tags)) {
        const clarezaTags = state.tags
          .filter(t => t.name && /CLAREZA/i.test(t.name))
          .map(t => t.name)
        if (clarezaTags.length > 0) {
          emailToACTagsMap.set(state.email, clarezaTags)
        }
      }
    })

    logger.info(`✅ [Clareza] Tags na BD: ${emailToBDTagsMap.size} | Tags no AC: ${emailToACTagsMap.size}`)

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
      students: students.map(s => {
        const bdTags = s.email ? (emailToBDTagsMap.get(s.email) || []) : []
        const acTags = s.email ? (emailToACTagsMap.get(s.email) || []) : []
        const isSynced = JSON.stringify(bdTags.sort()) === JSON.stringify(acTags.sort())

        return {
          _id: s._id,
          name: s.name || s.email?.split('@')[0] || 'Sem nome',
          email: s.email,
          lastReportOpen: null,
          daysInactive: Math.floor(Math.random() * 30),
          appliedTags: bdTags, // ✅ Mostrar tags da BD (fonte da verdade)
          appliedTagsAC: acTags, // ✅ Mostrar tags do AC (para comparação)
          tagsSynced: isSynced, // ✅ Se estão sincronizadas
          isConsistent: Math.random() > 0.5,
          platform: s.hotmart?.hotmartUserId
            ? 'Hotmart'
            : s.curseduca?.curseducaUserId
              ? 'Curseduca'
              : 'N/A'
        }
      })
    })
    return
  } catch (error: unknown) {
    logger.error('❌ [Clareza] Erro ao buscar alunos:', error)
    next(internalError('Erro ao buscar alunos', 'AC_CLAREZA_STUDENTS_READ_FAILED', error))
    return
  }
}

/**
 * POST /api/courses/clareza/evaluate
 */
export const evaluateClarezaRules: RequestHandler = async (_req, res, next) => {
  try {
    const preview = await previewCourseRules({ name: /^Clareza$/i })
    res.json({ success: true, ...preview })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao pré-visualizar regras Clareza:', error)
    next(internalError('Erro ao pré-visualizar regras', 'AC_CLAREZA_RULES_PREVIEW_FAILED', error))
    return
  }
}

/**
 * GET /api/courses/ogi/students
 */
export const getOGIStudents: RequestHandler = async (_req, res, next) => {
  try {
    logger.info('🎓 [OGI] Iniciando busca de alunos...')

    const course = await Course.findOne({ code: 'OGI' })

    if (!course) {
      logger.info('⚠️ [OGI] Curso não encontrado na BD')
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

    logger.info(`✅ [OGI] Curso encontrado: ${course._id}`)

    const students = await User.find({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })
      .select('name email hotmart curseduca activeCampaignId')
      .sort({ email: 1 })

    logger.info(`✅ [OGI] ${students.length} alunos encontrados`)

    // ✅ BUSCAR PRODUTO OGI
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id').lean()
    const ogiProductId = ogiProduct?._id

    // ✅ BUSCAR TAGS DA BD (UserProduct.activeCampaignData.tags) - FONTE DA VERDADE
    const userIds = students.map(s => s._id)
    const userProducts = await UserProduct.find({
      userId: { $in: userIds },
      productId: ogiProductId
    }).select('userId activeCampaignData').lean()

    const emailToBDTagsMap = new Map<string, string[]>()
    userProducts.forEach(up => {
      const user = students.find(s => s._id.toString() === up.userId.toString())
      if (user?.email && up.activeCampaignData?.tags) {
        const ogiTags = up.activeCampaignData.tags.filter((t: string) => /^OGI_/i.test(t))
        if (ogiTags.length > 0) {
          emailToBDTagsMap.set(user.email, ogiTags)
        }
      }
    })

    // ✅ BUSCAR TAGS DO AC (ac_contact_states) - PARA COMPARAÇÃO
    const ACContactState = (await import('../../models/acTags/ACContactState')).default
    const acStates = await ACContactState.find({
      email: { $in: students.map(s => s.email).filter(Boolean) }
    }).lean()

    const emailToACTagsMap = new Map<string, string[]>()
    acStates.forEach(state => {
      if (state.email && state.tags && Array.isArray(state.tags)) {
        const ogiTags = state.tags
          .filter(t => t.name && /^OGI_/i.test(t.name))
          .map(t => t.name)
        if (ogiTags.length > 0) {
          emailToACTagsMap.set(state.email, ogiTags)
        }
      }
    })

    logger.info(`✅ [OGI] Tags na BD: ${emailToBDTagsMap.size} | Tags no AC: ${emailToACTagsMap.size}`)

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
      students: students.map(s => {
        const bdTags = s.email ? (emailToBDTagsMap.get(s.email) || []) : []
        const acTags = s.email ? (emailToACTagsMap.get(s.email) || []) : []
        const isSynced = JSON.stringify(bdTags.sort()) === JSON.stringify(acTags.sort())

        return {
          _id: s._id,
          name: s.name || s.email?.split('@')[0] || 'Sem nome',
          email: s.email,
          lastLogin: null,
          daysInactive: Math.floor(Math.random() * 30),
          appliedTags: bdTags, // ✅ Mostrar tags da BD (fonte da verdade)
          appliedTagsAC: acTags, // ✅ Mostrar tags do AC (para comparação)
          tagsSynced: isSynced, // ✅ Se estão sincronizadas
          moduleProgress: Math.floor(Math.random() * 100),
          platform: s.hotmart?.hotmartUserId
            ? 'Hotmart'
            : s.curseduca?.curseducaUserId
              ? 'Curseduca'
              : 'N/A'
        }
      })
    })
    return
  } catch (error: unknown) {
    logger.error('❌ [OGI] Erro ao buscar alunos:', error)
    next(internalError('Erro ao buscar alunos', 'AC_OGI_STUDENTS_READ_FAILED', error))
    return
  }
}

/**
 * POST /api/courses/ogi/evaluate
 */
export const evaluateOGIRules: RequestHandler = async (_req, res, next) => {
  try {
    const preview = await previewCourseRules({ code: /^OGI$/i })
    res.json({ success: true, ...preview })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao pré-visualizar regras OGI:', error)
    next(internalError('Erro ao pré-visualizar regras', 'AC_OGI_RULES_PREVIEW_FAILED', error))
    return
  }
}

type CourseLookup = {
  name?: RegExp
  code?: RegExp
}

type CourseRulesPreview = {
  studentsEvaluated: number
  proposedAdditions: number
  proposedRemovals: number
  errors: number
}

async function previewCourseRules(courseLookup: CourseLookup): Promise<CourseRulesPreview> {
  const course = await Course.findOne(courseLookup)
  if (!course) {
    return {
      studentsEvaluated: 0,
      proposedAdditions: 0,
      proposedRemovals: 0,
      errors: 0
    }
  }

  const products = await Product.find({
    courseId: course._id,
    isActive: true
  }).select('_id')

  const results: DecisionResult[] = []
  for (const product of products) {
    const productResults = await decisionEngine.evaluateAllUsersOfProduct(
      product._id.toString(),
      true
    )
    results.push(...productResults)
  }

  return {
    studentsEvaluated: new Set(results.map(result => result.userId)).size,
    proposedAdditions: results.reduce(
      (total, result) => total + result.tagsToApply.length,
      0
    ),
    proposedRemovals: results.reduce(
      (total, result) => total + result.tagsToRemove.length,
      0
    ),
    errors: results.reduce(
      (total, result) => total + result.errors.length,
      0
    )
  }
}
