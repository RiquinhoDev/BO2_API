import mongoose from 'mongoose'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type { IProduct } from '../../models/product/Product'
import logger from '../../utils/logger'
export async function getTestimonialTags(userId: mongoose.Types.ObjectId): Promise<string[]> {
  try {
    // Buscar todos os UserProducts do aluno
    const userProducts = await UserProduct.find({ userId }).populate<{ productId: IProduct }>('productId')

    if (!userProducts || userProducts.length === 0) {
      logger.info('No testimonial products found', { userId: String(userId), status: 'skipped', productCount: 0 })
      return []
    }

    const tags: string[] = []
    const productsProcessed = new Set<string>() // Para evitar tags duplicadas

    for (const userProduct of userProducts) {
      const product = userProduct.productId

      if (!product || !product.name) {
        logger.warn('Testimonial product unavailable', { userProductId: String(userProduct._id), status: 'skipped' })
        continue
      }

      const productName = product.name.toLowerCase()

      // Determinar tag baseada no nome do produto
      let tagName = ''

      if (productName.includes('ogi')) {
        tagName = 'OGI_TESTEMUNHO'
      } else if (productName.includes('clareza')) {
        tagName = 'CLAREZA_TESTEMUNHO'
      } else if (productName.includes('comunidade') || productName.includes('discord')) {
        tagName = 'COMUNIDADE_DISCORD_TESTEMUNHO'
      }

      // Adicionar tag se ainda nÃ£o foi processada
      if (tagName && !productsProcessed.has(tagName)) {
        tags.push(tagName)
        productsProcessed.add(tagName)
        logger.info('Testimonial product tag selected', { userProductId: String(userProduct._id), status: 'selected', tagCount: tags.length })
      }
    }

    return tags
  } catch {
    logger.warn('Testimonial tag lookup failed', { userId: String(userId), status: 'partial' })
    return []
  }
}

// ðŸ·ï¸ FunÃ§Ã£o auxiliar para adicionar tags ao User
export async function addTestimonialTagsToUser(userId: mongoose.Types.ObjectId, tags: string[]): Promise<void> {
  try {
    if (!tags || tags.length === 0) {
      logger.info('No testimonial tags to persist', { userId: String(userId), status: 'skipped', tagCount: 0 })
      return
    }

    // Buscar o user
    const user = await User.findById(userId)
    if (!user) {
      logger.warn('Testimonial tag user unavailable', { userId: String(userId), status: 'skipped' })
      return
    }

    // Inicializar communicationByCourse se nÃ£o existir
    if (!user.communicationByCourse) {
      user.communicationByCourse = new Map()
    }

    // Para cada tag, adicionar ao communicationByCourse
    // Usaremos "TESTIMONIALS" como chave do curso
    const testimonialCourseKey = 'TESTIMONIALS'

    let courseComm = user.communicationByCourse.get(testimonialCourseKey)

    if (!courseComm) {
      courseComm = {
        currentPhase: 'ENGAGEMENT',
        currentTags: [],
        emailStats: {
          totalSent: 0,
          totalOpened: 0,
          totalClicked: 0,
          engagementRate: 0
        },
        courseSpecificData: {}
      }
    }

    // Adicionar novas tags (evitar duplicatas)
    const existingTags = new Set(courseComm.currentTags || [])
    for (const tag of tags) {
      if (!existingTags.has(tag)) {
        courseComm.currentTags.push(tag)
        existingTags.add(tag)
        logger.info('Testimonial tag applied', { userId: String(userId), status: 'applied', tagCount: tags.length })
      } else {
        logger.info('Testimonial tag already present', { userId: String(userId), status: 'existing', tagCount: tags.length })
      }
    }

    courseComm.lastTagAppliedAt = new Date()

    // Atualizar no Map
    user.communicationByCourse.set(testimonialCourseKey, courseComm)

    // Marcar como modificado (necessÃ¡rio para Maps)
    user.markModified('communicationByCourse')

    // Salvar
    await user.save()
    logger.info('Testimonial tags persisted', { userId: String(userId), status: 'completed', tagCount: tags.length })

  } catch (error: unknown) {
    logger.warn('Testimonial tag persistence failed', { userId: String(userId), status: 'failed' })
    throw error
  }
}

// ðŸ·ï¸ FunÃ§Ã£o para atualizar tags quando testemunho Ã© concluÃ­do
export async function updateTestimonialTagsOnCompletion(userId: mongoose.Types.ObjectId): Promise<void> {
  try {
    // Buscar o user
    const user = await User.findById(userId)
    if (!user) {
      logger.warn('Testimonial completion user unavailable', { userId: String(userId), status: 'skipped' })
      return
    }

    if (!user.communicationByCourse) {
      logger.info('No testimonial communication data', { userId: String(userId), status: 'skipped', tagCount: 0 })
      return
    }

    const testimonialCourseKey = 'TESTIMONIALS'
    const courseComm = user.communicationByCourse.get(testimonialCourseKey)

    if (!courseComm || !courseComm.currentTags || courseComm.currentTags.length === 0) {
      logger.info('No testimonial tags to update', { userId: String(userId), status: 'skipped', tagCount: 0 })
      return
    }

    // Mapear tags de pedido â†’ tags de conclusÃ£o
    const tagsToRemove: string[] = []
    const tagsToAdd: string[] = []

    for (const tag of courseComm.currentTags) {
      if (tag === 'OGI_TESTEMUNHO') {
        tagsToRemove.push(tag)
        tagsToAdd.push('OGI_TESTEMUNHO_CONCLUIDO')
      } else if (tag === 'CLAREZA_TESTEMUNHO') {
        tagsToRemove.push(tag)
        tagsToAdd.push('CLAREZA_TESTEMUNHO_CONCLUIDO')
      } else if (tag === 'COMUNIDADE_DISCORD_TESTEMUNHO') {
        tagsToRemove.push(tag)
        tagsToAdd.push('COMUNIDADE_DISCORD_TESTEMUNHO_CONCLUIDO')
      }
    }

    if (tagsToRemove.length === 0) {
      logger.info('No testimonial completion mapping', { userId: String(userId), status: 'skipped', tagCount: 0 })
      return
    }

    // Remover tags antigas
    courseComm.currentTags = courseComm.currentTags.filter(tag => !tagsToRemove.includes(tag))

    // Adicionar tags novas
    const existingTags = new Set(courseComm.currentTags)
    for (const newTag of tagsToAdd) {
      if (!existingTags.has(newTag)) {
        courseComm.currentTags.push(newTag)
        logger.info('Testimonial completion tag applied', { userId: String(userId), status: 'applied', tagCount: tagsToAdd.length })
      }
    }

    courseComm.lastTagAppliedAt = new Date()

    // Atualizar no Map
    user.communicationByCourse.set(testimonialCourseKey, courseComm)

    // Marcar como modificado
    user.markModified('communicationByCourse')

    // Salvar
    await user.save()

    logger.info('Testimonial completion tags persisted', { userId: String(userId), status: 'completed', tagCount: tagsToAdd.length })
    logger.info('Testimonial request tags removed', { userId: String(userId), status: 'removed', tagCount: tagsToRemove.length })
    logger.info('Testimonial completion tags added', { userId: String(userId), status: 'added', tagCount: tagsToAdd.length })

  } catch (error: unknown) {
    logger.warn('Testimonial completion tag persistence failed', { userId: String(userId), status: 'failed' })
    throw error
  }
}

// Helper to clear testimonial tags when a request is declined or cancelled
export async function removeTestimonialTagsFromUser(
  userId: mongoose.Types.ObjectId
): Promise<{ email: string | null; tags: string[] }> {
  try {
    const user = await User.findById(userId)
    if (!user) {
      logger.warn('Testimonial cleanup user unavailable', { userId: String(userId), status: 'skipped' })
      return { email: null, tags: [] }
    }

    if (!user.communicationByCourse) {
      return { email: user.email || null, tags: [] }
    }

    const testimonialCourseKey = 'TESTIMONIALS'
    const courseComm = user.communicationByCourse.get(testimonialCourseKey)

    if (!courseComm || !courseComm.currentTags || courseComm.currentTags.length === 0) {
      return { email: user.email || null, tags: [] }
    }

    const tagsToRemove = [...courseComm.currentTags]
    courseComm.currentTags = []
    courseComm.lastTagAppliedAt = new Date()

    user.communicationByCourse.set(testimonialCourseKey, courseComm)
    user.markModified('communicationByCourse')
    await user.save()

    return { email: user.email || null, tags: tagsToRemove }
  } catch {
    logger.warn('Testimonial tag cleanup failed', { userId: String(userId), status: 'partial' })
    return { email: null, tags: [] }
  }
}

// ðŸ“Š ESTATÃSTICAS DOS TESTEMUNHOS
