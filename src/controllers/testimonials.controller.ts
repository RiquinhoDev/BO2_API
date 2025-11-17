// src/controllers/testimonials.controller.ts
import { Request, Response } from 'express'
import { Testimonial, ITestimonial } from '../models/Testimonial'
import User from '../models/user'
import { Class } from '../models/Class'
import mongoose, { PipelineStage } from 'mongoose'

// Função para verificar se o modelo Testimonial está disponível
function ensureTestimonialModel() {
  if (!Testimonial || !mongoose.models.Testimonial) {
    throw new Error('Modelo Testimonial não está disponível')
  }
  return Testimonial
}

// 📊 ESTATÍSTICAS DOS TESTEMUNHOS
export const getTestimonialStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const TestimonialModel = ensureTestimonialModel()
    
    const stats = await TestimonialModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])

    const statusMap = stats.reduce((acc: any, curr: any) => {
      acc[curr._id] = curr.count
      return acc
    }, {})

    const totalRequested = await TestimonialModel.countDocuments()
    const totalContacted = statusMap['CONTACTED'] || 0
    const totalAccepted = statusMap['ACCEPTED'] || 0
    const totalDeclined = statusMap['DECLINED'] || 0
    const totalCompleted = statusMap['COMPLETED'] || 0
    const totalPending = statusMap['PENDING'] || 0

    // Estatísticas por classe
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

    // Taxa de conversão
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

  } catch (error: any) {
    console.error('Erro ao buscar estatísticas de testemunhos:', error)
    res.status(500).json({
      message: 'Erro ao buscar estatísticas',
      details: error.message
    })
  }
}

// 📋 LISTAR TESTEMUNHOS
export const listTestimonials = async (req: Request, res: Response): Promise<void> => {
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
    const filters: any = {}
    
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

    // Pipeline de agregação
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
          [sortBy as string]: sortOrder === 'desc' ? -1 : 1
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

  } catch (error: any) {
    console.error('Erro ao listar testemunhos:', error)
    res.status(500).json({
      message: 'Erro ao listar testemunhos',
      details: error.message
    })
  }
}

// ➕ CRIAR SOLICITAÇÃO DE TESTEMUNHO
// ➕ CRIAR NOVO TESTEMUNHO VIA WIZARD
export const createTestimonial = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      studentId,
      studentEmail,
      studentName,
      classId,
      className,
      contactMethod,
      testimonyType,
      priority,
      notes,
      requestedBy
    } = req.body

    // Validações básicas
    if (!studentId || !studentEmail || !studentName) {
      res.status(400).json({
        success: false,
        message: 'Dados do estudante são obrigatórios'
      })
      return
    }

    // Verificar se já existe um testemunho para este estudante
    const existingTestimonial = await Testimonial.findOne({
      studentId: new mongoose.Types.ObjectId(studentId),
      status: { $nin: ['CANCELLED', 'DECLINED'] }
    })

    if (existingTestimonial) {
      res.status(400).json({
        success: false,
        message: 'Já existe um testemunho ativo para este estudante'
      })
      return
    }

    // Criar novo testemunho
    const testimonial = new Testimonial({
      studentId: new mongoose.Types.ObjectId(studentId),
      studentEmail,
      studentName,
      classId,
      className,
      contactMethod: contactMethod || 'EMAIL',
      testimonyType: testimonyType || 'VIDEO',
      priority: priority || 'MEDIUM',
      notes,
      requestedBy,
      status: 'PENDING',
      requestedDate: new Date()
    })

    await testimonial.save()

    res.status(201).json({
      success: true,
      message: 'Testemunho criado com sucesso',
      testimonial
    })

  } catch (error: any) {
    console.error('Erro ao criar testemunho:', error)
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    })
  }
}

export const createTestimonialRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      studentIds,
      notes,
      priority = 'MEDIUM',
      requestedBy
    } = req.body

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      res.status(400).json({ message: 'É necessário selecionar pelo menos um estudante' })
      return
    }

    const results = {
      created: [] as any[],
      skipped: [] as any[],
      errors: [] as any[]
    }

    for (const studentId of studentIds) {
      try {
        // Verificar se o estudante existe
        const student = await User.findById(studentId)
        if (!student) {
          results.errors.push({
            studentId,
            error: 'Estudante não encontrado'
          })
          continue
        }

        // Verificar se já existe uma solicitação ativa
        const existingRequest = await Testimonial.findOne({
          studentId: student._id,
          status: { $in: ['PENDING', 'CONTACTED', 'ACCEPTED'] }
        })

        if (existingRequest) {
          results.skipped.push({
            studentId,
            studentName: student.name,
            reason: 'Já existe uma solicitação ativa'
          })
          continue
        }

        // Buscar informações da classe
        let classInfo = null
        if (student.classId) {
          classInfo = await Class.findOne({ classId: student.classId })
        }

        // Criar nova solicitação
        const testimonial = new Testimonial({
          studentId: student._id,
          studentEmail: student.email,
          studentName: student.name,
          classId: student.classId,
          className: classInfo?.name,
          status: 'PENDING',
          notes,
          priority,
          requestedBy,
          requestedDate: new Date()
        })

        await testimonial.save()

        results.created.push({
          testimonialId: testimonial._id,
          studentName: student.name,
          studentEmail: student.email
        })

      } catch (error: any) {
        results.errors.push({
          studentId,
          error: error.message
        })
      }
    }

    res.status(201).json({
      message: `Processamento concluído: ${results.created.length} criados, ${results.skipped.length} ignorados, ${results.errors.length} erros`,
      results
    })

  } catch (error: any) {
    console.error('Erro ao criar solicitações de testemunho:', error)
    res.status(500).json({
      message: 'Erro ao criar solicitações',
      details: error.message
    })
  }
}

// ✏️ ATUALIZAR STATUS DO TESTEMUNHO
export const updateTestimonialStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const {
      status,
      notes,
      contactMethod,
      declineReason,
      testimonyType,
      testimonyContent,
      rating,
      processedBy
    } = req.body

    const testimonial = await Testimonial.findById(id)
    if (!testimonial) {
      res.status(404).json({ message: 'Testemunho não encontrado' })
      return
    }

    // Atualizar campos
    if (status) {
      await testimonial.updateStatus(status, processedBy)
    }

    if (notes !== undefined) testimonial.notes = notes
    if (contactMethod) testimonial.contactMethod = contactMethod
    if (declineReason) testimonial.declineReason = declineReason
    if (testimonyType) testimonial.testimonyType = testimonyType
    if (testimonyContent) testimonial.testimonyContent = testimonyContent
    if (rating) testimonial.rating = rating

    await testimonial.save()

    res.json({
      message: 'Testemunho atualizado com sucesso',
      testimonial
    })

  } catch (error: any) {
    console.error('Erro ao atualizar testemunho:', error)
    res.status(500).json({
      message: 'Erro ao atualizar testemunho',
      details: error.message
    })
  }
}

// 🗑️ REMOVER TESTEMUNHO
export const deleteTestimonial = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const testimonial = await Testimonial.findByIdAndDelete(id)
    if (!testimonial) {
      res.status(404).json({ message: 'Testemunho não encontrado' })
      return
    }

    res.json({
      message: 'Testemunho removido com sucesso',
      deletedTestimonial: {
        id: testimonial._id,
        studentName: testimonial.studentName,
        status: testimonial.status
      }
    })

  } catch (error: any) {
    console.error('Erro ao remover testemunho:', error)
    res.status(500).json({
      message: 'Erro ao remover testemunho',
      details: error.message
    })
  }
}

// 📋 BUSCAR ESTUDANTES DISPONÍVEIS PARA TESTEMUNHO
export const getAvailableStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 getAvailableStudents chamado com query:', req.query)
    
    const {
      search = '',
      classId = 'all',
      excludeRequested = 'true',
      onlyActive = 'true',
      limit = 1000
    } = req.query

    console.log('📋 Parâmetros processados:', { search, classId, excludeRequested, onlyActive, limit })

    // Iniciar com filtros básicos simples
    const studentFilters: any = {}
    
    // Filtro para nome e email existentes
    studentFilters.email = { $exists: true, $ne: '' }
    studentFilters.name = { $exists: true, $ne: '' }

    // Filtro de classe
    if (classId && classId !== 'all') {
      studentFilters.classId = classId
    }

    // Filtro de pesquisa (apenas se não estiver vazio)
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim()
      studentFilters.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]
    }

    console.log('🎯 Filtros de estudantes:', JSON.stringify(studentFilters, null, 2))

    // Buscar estudantes simples primeiro
    let students = await User.find(studentFilters)
      .select('_id name email classId status estado')
      .sort({ name: 1 })
      .limit(Number(limit))
      .lean()

    console.log('👥 Estudantes encontrados (antes de filtros):', students.length)

    // Filtrar apenas ativos se solicitado
    if (onlyActive === 'true') {
      students = students.filter(student => 
        student.status === 'ACTIVE' || 
        student.estado === 'ativo' ||  // ← Correto: 'ativo' não 'ACTIVE'
        (!student.status && !student.estado)
      )
    }

    // Excluir estudantes que já têm testemunhos ativos
    if (excludeRequested === 'true') {
      try {
        const activeRequests = await Testimonial.find({
          status: { $in: ['PENDING', 'CONTACTED', 'ACCEPTED'] }
        }).select('studentId').lean()
        
        const excludeIds = activeRequests.map(req => req.studentId.toString())
        students = students.filter(student => !excludeIds.includes((student._id as any).toString()))
        console.log('👥 Estudantes após excluir solicitados:', students.length)
      } catch (testimonialError: any) {
        console.log('⚠️ Erro ao buscar testemunhos, ignorando filtro:', testimonialError.message)
      }
    }

    // Mapear para o formato esperado
    const finalStudents = students.map(student => ({
      _id: student._id,
      name: student.name,
      email: student.email,
      classId: student.classId || null,
      className: null, // Será preenchido depois se necessário
      status: student.status || student.estado || 'UNKNOWN'
    }))

    console.log('✅ Estudantes finais:', finalStudents.length)

    res.json({
      students: finalStudents,
      total: finalStudents.length,
      excludedCount: 0
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar estudantes disponíveis:', error)
    res.status(500).json({
      message: 'Erro ao buscar estudantes',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

// 📊 RELATÓRIO DE TESTEMUNHOS
export const getTestimonialReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query

    const matchFilters: any = {}
    
    if (startDate || endDate) {
      matchFilters.requestedDate = {}
      if (startDate) matchFilters.requestedDate.$gte = new Date(startDate as string)
      if (endDate) matchFilters.requestedDate.$lte = new Date(endDate as string)
    }

    // Agrupar por período
    let groupStage: any = {
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

  } catch (error: any) {
    console.error('Erro ao gerar relatório:', error)
    res.status(500).json({
      message: 'Erro ao gerar relatório',
      details: error.message
    })
  }
}

// 🎯 BUSCAR MELHORES CANDIDATOS PARA TESTEMUNHOS
export const getBestCandidates = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      classId,
      minEngagement,
      minProgress,
      sortBy = 'testimonialScore',
      limit = 20
    } = req.query

    // User já importado no topo do arquivo

    // Pipeline de agregação para encontrar os melhores candidatos
    const pipeline: PipelineStage[] = [
      // Filtrar apenas usuários ativos
      {
        $match: {
          status: 'ACTIVE',
          isDeleted: { $ne: true },
          ...(classId && { classId: classId as string }),
          ...(minEngagement && { engagementLevel: { $in: getEngagementLevels(minEngagement as string) } }),
          ...(minProgress && { 'progress.completedPercentage': { $gte: parseInt(minProgress as string) } })
        }
      },
      
      // Adicionar informações de testemunhos existentes
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
      
      // Ordenação
      {
        $sort: getSortCriteria(sortBy as string)
      },
      
      // Limitar resultados
      {
        $limit: parseInt(limit as string)
      },
      
      // Projeção dos campos necessários
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

    const students = await User.aggregate(pipeline)

    // Estatísticas adicionais
    const stats = {
      totalCandidates: students.length,
      averageScore: students.length > 0 ? Math.round(students.reduce((acc: any, student: any) => acc + (student.testimonialScore || 0), 0) / students.length) : 0,
      withTestimonials: students.filter((s: any) => s.hasTestimonial).length,
      highEngagement: students.filter((s: any) => ['ALTO', 'MUITO_ALTO'].includes(s.engagementLevel)).length
    }

    res.json({
      success: true,
      students,
      stats
    })
  } catch (error: any) {
    console.error('Erro ao buscar melhores candidatos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    })
  }
}

// Função auxiliar para mapear níveis de engagement
function getEngagementLevels(minLevel: string): string[] {
  const levels = ['MUITO_BAIXO', 'BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO']
  const startIndex = levels.indexOf(minLevel)
  return startIndex !== -1 ? levels.slice(startIndex) : levels
}

// Função auxiliar para critérios de ordenação
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

// 🔍 BUSCAR TESTEMUNHOS POR ESTUDANTE
export const getStudentTestimonials = async (req: Request, res: Response): Promise<void> => {
  try {
    const { studentId, email } = req.query
    
    if (!studentId && !email) {
      res.status(400).json({
        success: false,
        message: 'studentId ou email são obrigatórios'
      })
      return
    }

    const TestimonialModel = ensureTestimonialModel()
    
    // Criar filtro baseado no parâmetro fornecido
    let filter: any = {}
    if (studentId) {
      filter.studentId = new mongoose.Types.ObjectId(studentId as string)
    } else if (email) {
      filter.studentEmail = (email as string).toLowerCase().trim()
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

  } catch (error: any) {
    console.error('❌ Erro ao buscar testemunhos do estudante:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar testemunhos do estudante',
      details: error.message
    })
  }
}