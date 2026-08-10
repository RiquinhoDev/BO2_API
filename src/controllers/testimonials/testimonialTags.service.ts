import mongoose from 'mongoose'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type { IProduct } from '../../models/product/Product'
import { errorMessage } from './testimonialControllerSupport'
export async function getTestimonialTags(userId: mongoose.Types.ObjectId): Promise<string[]> {
  try {
    // Buscar todos os UserProducts do aluno
    const userProducts = await UserProduct.find({ userId }).populate<{ productId: IProduct }>('productId')

    if (!userProducts || userProducts.length === 0) {
      console.log(`âš ï¸ No products found for user ${userId}`)
      return []
    }

    const tags: string[] = []
    const productsProcessed = new Set<string>() // Para evitar tags duplicadas

    for (const userProduct of userProducts) {
      const product = userProduct.productId

      if (!product || !product.name) {
        console.log(`âš ï¸ Product not found for UserProduct ${userProduct._id}`)
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
        console.log(`âœ… Tag "${tagName}" will be added for product: ${product.name}`)
      }
    }

    return tags
  } catch (error: unknown) {
    console.error('âŒ Error getting testimonial tags:', errorMessage(error))
    return []
  }
}

// ðŸ·ï¸ FunÃ§Ã£o auxiliar para adicionar tags ao User
export async function addTestimonialTagsToUser(userId: mongoose.Types.ObjectId, tags: string[]): Promise<void> {
  try {
    if (!tags || tags.length === 0) {
      console.log(`âš ï¸ No tags to add for user ${userId}`)
      return
    }

    // Buscar o user
    const user = await User.findById(userId)
    if (!user) {
      console.error(`âŒ User ${userId} not found when trying to add tags`)
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
        console.log(`âœ… Added tag "${tag}" to user ${user.email}`)
      } else {
        console.log(`â„¹ï¸ Tag "${tag}" already exists for user ${user.email}`)
      }
    }

    courseComm.lastTagAppliedAt = new Date()

    // Atualizar no Map
    user.communicationByCourse.set(testimonialCourseKey, courseComm)

    // Marcar como modificado (necessÃ¡rio para Maps)
    user.markModified('communicationByCourse')

    // Salvar
    await user.save()
    console.log(`âœ… Testimonial tags saved for user ${user.email}: ${tags.join(', ')}`)

  } catch (error: unknown) {
    console.error('âŒ Error adding testimonial tags to user:', errorMessage(error))
    throw error
  }
}

// ðŸ·ï¸ FunÃ§Ã£o para atualizar tags quando testemunho Ã© concluÃ­do
export async function updateTestimonialTagsOnCompletion(userId: mongoose.Types.ObjectId): Promise<void> {
  try {
    // Buscar o user
    const user = await User.findById(userId)
    if (!user) {
      console.error(`âŒ User ${userId} not found when trying to update completion tags`)
      return
    }

    if (!user.communicationByCourse) {
      console.log(`âš ï¸ User ${user.email} has no communicationByCourse data`)
      return
    }

    const testimonialCourseKey = 'TESTIMONIALS'
    const courseComm = user.communicationByCourse.get(testimonialCourseKey)

    if (!courseComm || !courseComm.currentTags || courseComm.currentTags.length === 0) {
      console.log(`âš ï¸ User ${user.email} has no testimonial tags to update`)
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
      console.log(`â„¹ï¸ No tags to update for user ${user.email}`)
      return
    }

    // Remover tags antigas
    courseComm.currentTags = courseComm.currentTags.filter(tag => !tagsToRemove.includes(tag))

    // Adicionar tags novas
    const existingTags = new Set(courseComm.currentTags)
    for (const newTag of tagsToAdd) {
      if (!existingTags.has(newTag)) {
        courseComm.currentTags.push(newTag)
        console.log(`âœ… Added completion tag "${newTag}" to user ${user.email}`)
      }
    }

    courseComm.lastTagAppliedAt = new Date()

    // Atualizar no Map
    user.communicationByCourse.set(testimonialCourseKey, courseComm)

    // Marcar como modificado
    user.markModified('communicationByCourse')

    // Salvar
    await user.save()

    console.log(`âœ… Updated testimonial tags for user ${user.email}:`)
    console.log(`   - Removed: ${tagsToRemove.join(', ')}`)
    console.log(`   - Added: ${tagsToAdd.join(', ')}`)

  } catch (error: unknown) {
    console.error('âŒ Error updating testimonial completion tags:', errorMessage(error))
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
      console.error(`Error: user ${userId} not found when trying to remove tags`)
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
  } catch (error: unknown) {
    console.error('Error removing testimonial tags from user:', errorMessage(error))
    return { email: null, tags: [] }
  }
}

// ðŸ“Š ESTATÃSTICAS DOS TESTEMUNHOS
