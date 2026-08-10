import { Request, Response } from 'express'
import { FilterQuery, PipelineStage } from 'mongoose'
import { Testimonial } from '../../models/Testimonial'
import User, { IUser } from '../../models/user'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import {
  errorMessage,
  errorStack,
  queryString
} from './testimonialControllerSupport'

type Candidate = {
  testimonialScore?: number
  hasTestimonial: boolean
  engagementLevel?: string
}
export const getAvailableStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('ðŸ” getAvailableStudents chamado com query:', req.query)

    const {
      search = '',
      classId = 'all',
      excludeRequested = 'true',
      onlyActive = 'true',
      minEngagement = 'MEDIO',  // ðŸ†• Default: MEDIO or above
      minProgress = '40',        // ðŸ†• Default: 40% or above (MEDIO level)
      limit = 1000
    } = req.query

    console.log('ðŸ“‹ ParÃ¢metros processados:', { search, classId, excludeRequested, onlyActive, minEngagement, minProgress, limit })

    // Iniciar com filtros bÃ¡sicos simples
    const studentFilters: FilterQuery<IUser> = {}

    // Filtro para nome e email existentes
    studentFilters.email = { $exists: true, $ne: '' }
    studentFilters.name = { $exists: true, $ne: '' }

    // ðŸ†• FILTER BY ENGAGEMENT AND PROGRESS (OR logic as user requested)
    if ((minEngagement && minEngagement !== 'none') || (minProgress && minProgress !== '0')) {
      const orConditions: FilterQuery<IUser>[] = []

      // Add engagement conditions
      if (minEngagement && minEngagement !== 'none') {
        const acceptedLevels = getEngagementLevels(queryString(minEngagement) ?? 'MEDIO')
        const minScore = minEngagement === 'MEDIO' ? 40 : minEngagement === 'ALTO' ? 60 : minEngagement === 'MUITO_ALTO' ? 80 : 25

        orConditions.push(
          { 'hotmart.engagement.engagementLevel': { $in: acceptedLevels } },
          { 'hotmart.engagement.engagementScore': { $gte: minScore } },
          { 'curseduca.engagement.engagementLevel': { $in: acceptedLevels } },
          { 'curseduca.engagement.alternativeEngagement': { $gte: minScore } },
          { 'combined.engagement.level': { $in: acceptedLevels } },
          { 'combined.engagement.score': { $gte: minScore } }
        )
      }

      // Add progress conditions
      if (minProgress && minProgress !== '0') {
        const minProgressValue = parseInt(queryString(minProgress) ?? '0')
        orConditions.push(
          { 'combined.totalProgress': { $gte: minProgressValue } },
          { 'curseduca.progress.estimatedProgress': { $gte: minProgressValue } }
        )
      }

      if (orConditions.length > 0) {
        studentFilters.$or = orConditions
      }
    }

    // Filtro de classe
    if (classId && classId !== 'all') {
      studentFilters.classId = classId
    }

    // Filtro de pesquisa (apenas se nÃ£o estiver vazio)
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim()
      const searchConditions = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]

      // If we have $or from engagement/progress, combine with $and
      if (studentFilters.$or) {
        studentFilters.$and = [
          { $or: studentFilters.$or },
          { $or: searchConditions }
        ]
        delete studentFilters.$or
      } else {
        studentFilters.$or = searchConditions
      }
    }

    console.log('ðŸŽ¯ Filtros de estudantes:', JSON.stringify(studentFilters, null, 2))

    // Buscar estudantes com campos de engagement e progress
    let students = await User.find(studentFilters)
      .select('_id name email classId hotmart.engagement curseduca.engagement curseduca.memberStatus combined.status combined.engagement combined.totalProgress curseduca.progress')
      .sort({ name: 1 })
      .limit(Number(limit))
      .lean()

    console.log('ðŸ‘¥ Estudantes encontrados (antes de filtros):', students.length)

    // Filtrar apenas ativos se solicitado
    if (onlyActive === 'true') {
      students = students.filter(student => {
        const status = student.combined?.status ?? student.curseduca?.memberStatus
        return status === 'ACTIVE' || status === undefined
      })
    }

    // Excluir estudantes que jÃ¡ tÃªm testemunhos ativos
    if (excludeRequested === 'true') {
      try {
        const activeRequests = await Testimonial.find({
          status: { $in: ['PENDING', 'CONTACTED', 'ACCEPTED'] }
        }).select('studentId').lean()
        
        const excludeIds = activeRequests.map(req => req.studentId.toString())
        students = students.filter(student => !excludeIds.includes(student._id.toString()))
        console.log('ðŸ‘¥ Estudantes apÃ³s excluir solicitados:', students.length)
      } catch (testimonialError: unknown) {
        console.log('âš ï¸ Erro ao buscar testemunhos, ignorando filtro:', errorMessage(testimonialError))
      }
    }

    // Mapear para o formato esperado
    const finalStudents = students.map(student => {
      // ðŸ†• Extract engagement data from all sources
      const engagementScore = student.combined?.engagement?.score ||
                              student.hotmart?.engagement?.engagementScore ||
                              student.curseduca?.engagement?.alternativeEngagement ||
                              0

      const engagementLevel = student.combined?.engagement?.level ||
                              student.hotmart?.engagement?.engagementLevel ||
                              student.curseduca?.engagement?.engagementLevel ||
                              'NONE'

      // ðŸ†• Extract progress data
      const progressPercentage = student.combined?.totalProgress ||
                                 student.curseduca?.progress?.estimatedProgress ||
                                 0

      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        classId: student.classId || null,
        className: null, // SerÃ¡ preenchido depois se necessÃ¡rio
        status: student.combined?.status ?? student.curseduca?.memberStatus ?? 'UNKNOWN',
        // ðŸ†• Add engagement and progress info for frontend display
        engagement: {
          score: engagementScore,
          level: engagementLevel
        },
        progress: {
          percentage: progressPercentage
        }
      }
    })

    console.log('âœ… Estudantes finais:', finalStudents.length)

    res.json({
      students: finalStudents,
      total: finalStudents.length,
      excludedCount: 0
    })

  } catch (error: unknown) {
    console.error('âŒ Erro ao buscar estudantes disponÃ­veis:', error)
    res.status(500).json({
      message: 'Erro ao buscar estudantes',
      details: errorMessage(error),
      stack: getRuntimeConfig().core.nodeEnv === 'development' ? errorStack(error) : undefined
    })
  }
}

// ðŸ“Š RELATÃ“RIO DE TESTEMUNHOS
export const getBestCandidates = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      classId,
      minEngagement,
      minProgress,
      sortBy = 'testimonialScore',
      limit = 20
    } = req.query

    // User jÃ¡ importado no topo do arquivo

    // Pipeline de agregaÃ§Ã£o para encontrar os melhores candidatos
    const pipeline: PipelineStage[] = [
      // Filtrar apenas usuÃ¡rios ativos
      {
        $match: {
          status: 'ACTIVE',
          isDeleted: { $ne: true },
          ...(queryString(classId) && { classId: queryString(classId) }),
          ...(queryString(minEngagement) && { engagementLevel: { $in: getEngagementLevels(queryString(minEngagement) ?? '') } }),
          ...(queryString(minProgress) && { 'progress.completedPercentage': { $gte: parseInt(queryString(minProgress) ?? '0') } })
        }
      },
      
      // Adicionar informaÃ§Ãµes de testemunhos existentes
      {
        $lookup: {
          from: 'testimonials',
          localField: '_id',
          foreignField: 'studentId',
          as: 'testimonials'
        }
      },
      
      // Calcular score de testemunho
      {
        $addFields: {
          testimonialScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$engagementScore', 0] }, 0.4] },
              { $multiply: [{ $ifNull: ['$progress.completedPercentage', 0] }, 0.3] },
              { $multiply: [{ $min: [{ $divide: [{ $ifNull: ['$accessCount', 0] }, 10] }, 20] }, 1] },
              { $multiply: [{ $min: [{ $ifNull: ['$performanceMetrics.weeklyAccess', 0] }, 10] }, 0.1] }
            ]
          },
          hasTestimonial: { $gt: [{ $size: '$testimonials' }, 0] },
          testimonialStatus: { $arrayElemAt: ['$testimonials.status', -1] }
        }
      },
      
      // OrdenaÃ§Ã£o
      {
        $sort: getSortCriteria(queryString(sortBy) ?? 'testimonialScore')
      },
      
      // Limitar resultados
      {
        $limit: parseInt(queryString(limit) ?? '20')
      },
      
      // ProjeÃ§Ã£o dos campos necessÃ¡rios
      {
        $project: {
          name: 1,
          email: 1,
          discordIds: 1,
          classId: 1,
          className: 1,
          status: 1,
          engagementScore: 1,
          engagementLevel: 1,
          accessCount: 1,
          lastAccessDate: 1,
          signupDate: 1,
          progress: 1,
          performanceMetrics: 1,
          testimonialScore: { $round: ['$testimonialScore', 0] },
          hasTestimonial: 1,
          testimonialStatus: 1
        }
      }
    ]

    const students = await User.aggregate<Candidate>(pipeline)

    // EstatÃ­sticas adicionais
    const stats = {
      totalCandidates: students.length,
      averageScore: students.length > 0 ? Math.round(students.reduce((acc, student) => acc + (student.testimonialScore || 0), 0) / students.length) : 0,
      withTestimonials: students.filter(student => student.hasTestimonial).length,
      highEngagement: students.filter(student => student.engagementLevel !== undefined && ['ALTO', 'MUITO_ALTO'].includes(student.engagementLevel)).length
    }

    res.json({
      success: true,
      students,
      stats
    })
  } catch (error: unknown) {
    console.error('Erro ao buscar melhores candidatos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    })
  }
}

// FunÃ§Ã£o auxiliar para mapear nÃ­veis de engagement
function getEngagementLevels(minLevel: string): string[] {
  const levels = ['MUITO_BAIXO', 'BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO']
  const startIndex = levels.indexOf(minLevel)
  return startIndex !== -1 ? levels.slice(startIndex) : levels
}

// FunÃ§Ã£o auxiliar para critÃ©rios de ordenaÃ§Ã£o
function getSortCriteria(sortBy: string): Record<string, 1 | -1> {
  switch (sortBy) {
    case 'engagementScore':
      return { engagementScore: -1, accessCount: -1 }
    case 'accessCount':
      return { accessCount: -1, engagementScore: -1 }
    case 'progress':
      return { 'progress.completedPercentage': -1, engagementScore: -1 }
    case 'testimonialScore':
    default:
      return { testimonialScore: -1, engagementScore: -1 }
  }
}

// ðŸ” BUSCAR TESTEMUNHOS POR ESTUDANTE
