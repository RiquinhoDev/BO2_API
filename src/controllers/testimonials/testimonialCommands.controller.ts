import { type NextFunction, type Request, type Response } from 'express'
import { internalError } from '../../security/errorHandling'
import mongoose from 'mongoose'
import type { TestimonialsDeleteInput } from '../../security/testimonialsDestructiveInput'
import { Testimonial } from '../../models/Testimonial'
import User from '../../models/user'
import { Class } from '../../models/Class'
import activeCampaignService from '../../services/activeCampaign/activeCampaignService'
import {
  addTestimonialTagsToUser,
  getTestimonialTags,
  removeTestimonialTagsFromUser,
  updateTestimonialTagsOnCompletion
} from './testimonialTags.service'
import { errorMessage } from './testimonialControllerSupport'
import logger from '../../utils/logger'

type RequestCreated = {
  testimonialId: mongoose.Types.ObjectId
  studentName: string
  studentEmail: string
}
type RequestSkipped = { studentId: string; studentName: string; reason: string }
type RequestFailure = { studentId: string; error: string }
export const createTestimonial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    // ValidaÃ§Ãµes bÃ¡sicas
    if (!studentId || !studentEmail || !studentName) {
      res.status(400).json({
        success: false,
        message: 'Dados do estudante sÃ£o obrigatÃ³rios'
      })
      return
    }

    // Verificar se jÃ¡ existe um testemunho para este estudante
    const studentObjectId = new mongoose.Types.ObjectId(studentId)

    const existingTestimonial = await Testimonial.findOne({
      studentId: studentObjectId,
      status: { $nin: ['CANCELLED', 'DECLINED'] }
    })

    if (existingTestimonial) {
      res.status(400).json({
        success: false,
        message: 'JÃ¡ existe um testemunho ativo para este estudante'
      })
      return
    }

    // Criar novo testemunho
    const testimonial = new Testimonial({
      studentId: studentObjectId,
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

    // Add testimonial tags to user (same as batch request)
    try {
      const tags = await getTestimonialTags(studentObjectId)
      if (tags.length > 0) {
        await addTestimonialTagsToUser(studentObjectId, tags)
        logger.info('Testimonial tags applied', { studentId, status: 'completed', tagCount: tags.length })
      } else {
        logger.info('No testimonial tags to apply', { studentId, status: 'skipped', tagCount: 0 })
      }
    } catch {
      logger.warn('Testimonial tag application failed', { studentId, status: 'partial' })
    }

    res.status(201).json({
      success: true,
      message: 'Testemunho criado com sucesso',
      testimonial
    })

  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TESTIMONIAL_CREATE_FAILED', error))
  }
}

export const createTestimonialRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      studentIds,
      notes,
      priority = 'MEDIUM',
      requestedBy
    } = req.body

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      res.status(400).json({ message: 'Ã‰ necessÃ¡rio selecionar pelo menos um estudante' })
      return
    }

    const results: {
      created: RequestCreated[]
      skipped: RequestSkipped[]
      errors: RequestFailure[]
    } = {
      created: [],
      skipped: [],
      errors: []
    }

    for (const studentId of studentIds) {
      try {
        // Verificar se o estudante existe
        const student = await User.findById(studentId)
        if (!student) {
          results.errors.push({
            studentId,
            error: 'Estudante nÃ£o encontrado'
          })
          continue
        }

        // Verificar se jÃ¡ existe uma solicitaÃ§Ã£o ativa
        const existingRequest = await Testimonial.findOne({
          studentId: student._id,
          status: { $in: ['PENDING', 'CONTACTED', 'ACCEPTED'] }
        })

        if (existingRequest) {
          results.skipped.push({
            studentId,
            studentName: student.name,
            reason: 'JÃ¡ existe uma solicitaÃ§Ã£o ativa'
          })
          continue
        }

        // Buscar informaÃ§Ãµes da classe
        let classInfo = null
        if (student.classId) {
          classInfo = await Class.findOne({ classId: student.classId })
        }

        // Criar nova solicitaÃ§Ã£o
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

        // ðŸ·ï¸ Adicionar tags de testemunho ao User
        try {
          const tags = await getTestimonialTags(student._id)
          if (tags.length > 0) {
            await addTestimonialTagsToUser(student._id, tags)
            logger.info('Testimonial tags applied', { studentId, status: 'completed', tagCount: tags.length })
          } else {
            logger.info('No testimonial tags to apply', { studentId, status: 'skipped', tagCount: 0 })
          }
        } catch {
          logger.warn('Testimonial tag application failed', { studentId, status: 'partial' })
          // NÃ£o falhar a criaÃ§Ã£o do testemunho se as tags falharem
        }

        results.created.push({
          testimonialId: testimonial._id,
          studentName: student.name,
          studentEmail: student.email
        })

      } catch (error: unknown) {
        results.errors.push({
          studentId,
          error: errorMessage(error)
        })
      }
    }

    res.status(201).json({
      message: `Processamento concluÃ­do: ${results.created.length} criados, ${results.skipped.length} ignorados, ${results.errors.length} erros`,
      results
    })

  } catch (error: unknown) {
    next(internalError('Erro ao criar solicitações', 'TESTIMONIAL_REQUEST_CREATE_FAILED', error))
  }
}

// âœï¸ ATUALIZAR STATUS DO TESTEMUNHO
export const updateTestimonialStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      res.status(404).json({ message: 'Testemunho nÃ£o encontrado' })
      return
    }

    // Atualizar campos
    if (status) {
      await testimonial.updateStatus(status, processedBy)

      // ðŸ·ï¸ Se o status mudou para COMPLETED, atualizar tags
      if (status === 'COMPLETED') {
        try {
          await updateTestimonialTagsOnCompletion(testimonial.studentId)
          logger.info('Testimonial completion tags applied', { testimonialId: String(testimonial._id), status: 'completed' })
        } catch {
          logger.warn('Testimonial completion tag update failed', { testimonialId: String(testimonial._id), status: 'partial' })
          // NÃ£o falhar a atualizaÃ§Ã£o se as tags falharem
        }
      }
      if (status === 'DECLINED' || status === 'CANCELLED') {
        try {
          const { email, tags } = await removeTestimonialTagsFromUser(
            testimonial.studentId
          )

          if (email && tags.length > 0) {
            for (const tag of tags) {
              try {
                await activeCampaignService.removeTag(email, tag)
              } catch {
                logger.warn('Testimonial ActiveCampaign tag removal failed', { testimonialId: String(testimonial._id), status: 'partial', tagCount: tags.length })
              }
            }
          }
        } catch {
          logger.warn('Testimonial tag cleanup failed', { testimonialId: String(testimonial._id), status: 'partial' })
        }
      }
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

  } catch (error: unknown) {
    next(internalError('Erro ao atualizar testemunho', 'TESTIMONIAL_UPDATE_FAILED', error))
  }
}

// ðŸ—‘ï¸ REMOVER TESTEMUNHO
export const deleteTestimonial = async (
  input: TestimonialsDeleteInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = input.params

    const testimonial = await Testimonial.findByIdAndDelete(id)
    if (!testimonial) {
      res.status(404).json({ message: 'Testemunho nÃ£o encontrado' })
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

  } catch (error: unknown) {
    next(internalError('Erro ao remover testemunho', 'TESTIMONIAL_DELETE_FAILED', error))
  }
}

// ðŸ“‹ BUSCAR ESTUDANTES DISPONÃVEIS PARA TESTEMUNHO
