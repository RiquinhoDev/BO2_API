import type { RequestHandler } from 'express'
import type { FilterQuery, Types } from 'mongoose'

import User from '../../models/user'
import CommunicationHistory from '../../models/acTags/CommunicationHistory'
import type { ICommunicationHistory } from '../../models/acTags/CommunicationHistory'
import logger from '../../utils/logger'
import { buildReason, type CommunicationReasonRule } from './activeCampaignHistoryReason'

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

type CommunicationHistoryRecord = {
  _id: Types.ObjectId
  userId: Types.ObjectId | PopulatedUser
  courseId?: Types.ObjectId | PopulatedCourse
  tagRuleId?: Types.ObjectId | CommunicationReasonRule
  tagApplied: string
  sentAt?: Date
  createdAt: Date
  source: ICommunicationHistory['source']
  status: ICommunicationHistory['status']
  userStateSnapshot?: ICommunicationHistory['userStateSnapshot']
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
  value: Types.ObjectId | CommunicationReasonRule | undefined
): value is CommunicationReasonRule {
  return value !== undefined && ('name' in value || 'category' in value)
}

/**
 * GET /api/communication-history
 */
export const getCommunicationHistory: RequestHandler = async (req, res) => {
  try {
    logger.info('📜 Buscando histórico de comunicações...')

    const {
      userId,
      courseId,
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
        logger.info(`🔍 Email "${email}" → userId: ${user._id}`)
      } else {
        logger.info(`⚠️  Email "${email}" não encontrado`)
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

    logger.info('🔍 Filtros aplicados:', filter)

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

    logger.info(`✅ ${rawHistory.length} registos encontrados (total: ${total})`)

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
    logger.error('❌ Erro ao buscar histórico:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao buscar histórico')
    })
    return
  }
}
