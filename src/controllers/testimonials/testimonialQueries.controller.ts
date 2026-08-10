import { type NextFunction, type Request, type Response } from 'express'
import { internalError } from '../../security/errorHandling'
import mongoose, { FilterQuery, PipelineStage } from 'mongoose'
import { Testimonial, ITestimonial } from '../../models/Testimonial'
import {
  ensureTestimonialModel,
  queryString
} from './testimonialControllerSupport'

type TestimonialStatus = ITestimonial['status']
type StatusCount = { _id: TestimonialStatus; count: number }
export const getTestimonialStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const TestimonialModel = ensureTestimonialModel()
    
    const stats = await TestimonialModel.aggregate<StatusCount>([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])

    const statusMap = stats.reduce<Partial<Record<TestimonialStatus, number>>>((acc, curr) => {
      acc[curr._id] = curr.count
      return acc
    }, {})

    const totalRequested = await TestimonialModel.countDocuments()
    const totalContacted = statusMap['CONTACTED'] || 0
    const totalAccepted = statusMap['ACCEPTED'] || 0
    const totalDeclined = statusMap['DECLINED'] || 0
    const totalCompleted = statusMap['COMPLETED'] || 0
    const totalPending = statusMap['PENDING'] || 0

    // EstatÃ­sticas por classe
    const clasStats = await TestimonialModel.aggregate([
      {
        $match: { classId: { $exists: true, $ne: null } }
      },
      {
        $group: {
          _id: '$classId',
          className: { $first: '$className' },
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
          },
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] }
          }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ])

    // Taxa de conversÃ£o
    const contactedCount = totalContacted + totalAccepted + totalDeclined + totalCompleted
    const acceptanceRate = contactedCount > 0 ? ((totalAccepted + totalCompleted) / contactedCount * 100) : 0
    const completionRate = totalAccepted > 0 ? (totalCompleted / totalAccepted * 100) : 0

    res.json({
      overview: {
        totalRequested,
        totalContacted: contactedCount,
        totalAccepted,
        totalDeclined,
        totalCompleted,
        totalPending,
        acceptanceRate: Math.round(acceptanceRate * 100) / 100,
        completionRate: Math.round(completionRate * 100) / 100
      },
      statusBreakdown: {
        pending: totalPending,
        contacted: totalContacted,
        accepted: totalAccepted,
        declined: totalDeclined,
        completed: totalCompleted,
        cancelled: statusMap['CANCELLED'] || 0
      },
      clasStats,
      lastUpdated: new Date()
    })

  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'TESTIMONIAL_STATS_READ_FAILED', error))
  }
}

// ðŸ“‹ LISTAR TESTEMUNHOS
export const listTestimonials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const TestimonialModel = ensureTestimonialModel()
    
    const {
      page = 1,
      limit = 20,
      status,
      classId,
      search,
      sortBy = 'requestedDate',
      sortOrder = 'desc'
    } = req.query

    const skip = (Number(page) - 1) * Number(limit)

    // Construir filtros
    const filters: FilterQuery<ITestimonial> = {}
    
    if (status && status !== 'all') {
      filters.status = status
    }
    
    if (classId && classId !== 'all') {
      filters.classId = classId
    }
    
    if (search && typeof search === 'string') {
      filters.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { studentEmail: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ]
    }

    // Pipeline de agregaÃ§Ã£o
    const sortField = queryString(sortBy) ?? 'requestedDate'
    const pipeline: PipelineStage[] = [
      { $match: filters },
      {
        $lookup: {
          from: 'classes',
          localField: 'classId',
          foreignField: 'classId',
          as: 'classInfo'
        }
      },
      {
        $unwind: {
          path: '$classInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          className: { $ifNull: ['$classInfo.name', '$className'] }
        }
      },
      {
        $sort: {
          [sortField]: sortOrder === 'desc' ? -1 : 1
        }
      },
      { $skip: skip },
      { $limit: Number(limit) }
    ]

    const testimonials = await TestimonialModel.aggregate(pipeline)
    const totalCount = await TestimonialModel.countDocuments(filters)

    res.json({
      testimonials,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalItems: totalCount,
        itemsPerPage: Number(limit)
      },
      filters: {
        status,
        classId,
        search
      }
    })

  } catch (error: unknown) {
    next(internalError('Erro ao listar testemunhos', 'TESTIMONIAL_LIST_FAILED', error))
  }
}

// âž• CRIAR SOLICITAÃ‡ÃƒO DE TESTEMUNHO
// âž• CRIAR NOVO TESTEMUNHO VIA WIZARD
export const getTestimonialReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query

    const matchFilters: FilterQuery<ITestimonial> = {}
    
    if (startDate || endDate) {
      matchFilters.requestedDate = {}
      const start = queryString(startDate)
      const end = queryString(endDate)
      if (start) matchFilters.requestedDate.$gte = new Date(start)
      if (end) matchFilters.requestedDate.$lte = new Date(end)
    }

    // Agrupar por perÃ­odo
    const groupStage: PipelineStage.Group['$group'] = {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      accepted: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
      declined: { $sum: { $cond: [{ $eq: ['$status', 'DECLINED'] }, 1, 0] } }
    }

    if (groupBy === 'month') {
      groupStage._id = {
        year: { $year: '$requestedDate' },
        month: { $month: '$requestedDate' }
      }
    } else if (groupBy === 'week') {
      groupStage._id = {
        year: { $year: '$requestedDate' },
        week: { $week: '$requestedDate' }
      }
    }

    const timelineData = await Testimonial.aggregate([
      { $match: matchFilters },
      { $group: groupStage },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } }
    ])

    // Top classes com mais testemunhos
    const topClasses = await Testimonial.aggregate([
      { $match: { ...matchFilters, classId: { $exists: true } } },
      {
        $group: {
          _id: '$classId',
          className: { $first: '$className' },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ])

    res.json({
      timelineData,
      topClasses,
      period: {
        startDate,
        endDate,
        groupBy
      },
      generatedAt: new Date()
    })

  } catch (error: unknown) {
    next(internalError('Erro ao gerar relatório', 'TESTIMONIAL_REPORT_READ_FAILED', error))
  }
}

// ðŸŽ¯ BUSCAR MELHORES CANDIDATOS PARA TESTEMUNHOS
export const getStudentTestimonials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentId, email } = req.query
    
    if (!studentId && !email) {
      res.status(400).json({
        success: false,
        message: 'studentId ou email sÃ£o obrigatÃ³rios'
      })
      return
    }

    const TestimonialModel = ensureTestimonialModel()
    
    // Criar filtro baseado no parÃ¢metro fornecido
    const filter: FilterQuery<ITestimonial> = {}
    const requestedStudentId = queryString(studentId)
    const requestedEmail = queryString(email)
    if (requestedStudentId) {
      filter.studentId = new mongoose.Types.ObjectId(requestedStudentId)
    } else if (requestedEmail) {
      filter.studentEmail = requestedEmail.toLowerCase().trim()
    }

    // Buscar testemunhos do estudante
    const testimonials = await TestimonialModel.find(filter)
      .sort({ requestedDate: -1 })
      .lean()

    // Criar resumo do status dos testemunhos
    const summary = {
      hasTestimonials: testimonials.length > 0,
      totalRequests: testimonials.length,
      latestStatus: testimonials.length > 0 ? testimonials[0].status : null,
      latestRequestDate: testimonials.length > 0 ? testimonials[0].requestedDate : null,
      hasCompleted: testimonials.some(t => t.status === 'COMPLETED'),
      hasDeclined: testimonials.some(t => t.status === 'DECLINED'),
      hasPending: testimonials.some(t => t.status === 'PENDING'),
      hasAccepted: testimonials.some(t => t.status === 'ACCEPTED'),
      completedCount: testimonials.filter(t => t.status === 'COMPLETED').length,
      declinedCount: testimonials.filter(t => t.status === 'DECLINED').length
    }

    res.json({
      success: true,
      data: {
        testimonials,
        summary
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: unknown) {
    next(internalError('Erro ao buscar testemunhos do estudante', 'TESTIMONIAL_STUDENT_READ_FAILED', error))
  }
}
