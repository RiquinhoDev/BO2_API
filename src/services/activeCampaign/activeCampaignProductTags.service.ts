import { Product, User, UserProduct } from '../../models'
import type { ACContact, ACContactResponse } from '../../types/activecampaign.types'
import logger from '../../utils/logger'

export interface ProductTagUser {
  email: string
  name?: string
}

export interface ProductTagEnrollment {
  tags: string[]
  addTag(tagName: string, syncedAt: Date): Promise<void>
  replaceTags(tags: string[], syncedAt: Date): Promise<void>
  clearTags(syncedAt: Date): Promise<void>
}

export interface ProductTagRepository {
  findUser(userId: string): Promise<ProductTagUser | null>
  productExists(productId: string): Promise<boolean>
  findEnrollment(userId: string, productId: string): Promise<ProductTagEnrollment | null>
}

interface ActiveCampaignProductTagDependencies {
  ensureAvailable(): void
  rethrowIntegrationUnavailable(error: unknown): void
  formatError(error: unknown): string
  addTag(email: string, tagName: string): Promise<unknown>
  removeTag(email: string, tagName: string): Promise<boolean>
  getContactByEmail(email: string): Promise<ACContactResponse | null>
  createOrUpdateContact(contact: ACContact): Promise<ACContactResponse>
  repository: ProductTagRepository
  now(): Date
}

export const mongooseProductTagRepository: ProductTagRepository = {
  async findUser(userId) {
    const user = await User.findById(userId)
    return user?.email ? { email: user.email, name: user.name } : null
  },
  async productExists(productId) {
    return Boolean(await Product.findById(productId))
  },
  async findEnrollment(userId, productId) {
    const enrollment = await UserProduct.findOne({ userId, productId })
    if (!enrollment) return null
    return {
      tags: enrollment.activeCampaignData?.tags || [],
      async addTag(tagName, syncedAt) {
        await UserProduct.findByIdAndUpdate(enrollment._id, {
          $addToSet: { 'activeCampaignData.tags': tagName },
          $set: { 'activeCampaignData.lastSyncAt': syncedAt },
        })
      },
      async replaceTags(tags, syncedAt) {
        if (!enrollment.activeCampaignData) {
          enrollment.activeCampaignData = { tags: [], lists: [] }
        }
        enrollment.activeCampaignData.tags = tags
        enrollment.activeCampaignData.lastSyncAt = syncedAt
        await enrollment.save()
      },
      async clearTags(syncedAt) {
        await UserProduct.findByIdAndUpdate(enrollment._id, {
          $set: {
            'activeCampaignData.tags': [],
            'activeCampaignData.lastSyncAt': syncedAt,
          },
        })
      },
    }
  },
}

export class ActiveCampaignProductTagsService {
  constructor(private readonly dependencies: ActiveCampaignProductTagDependencies) {}

  async applyTagToUserProduct(userId: string, productId: string, tagName: string): Promise<boolean> {
    const dependencies = this.dependencies
    dependencies.ensureAvailable()
    try {
      const user = await dependencies.repository.findUser(userId)
      const productExists = await dependencies.repository.productExists(productId)
      if (!user || !productExists) return false

      await dependencies.addTag(user.email, tagName)
      const enrollment = await dependencies.repository.findEnrollment(userId, productId)
      if (enrollment && !enrollment.tags.includes(tagName)) {
        await enrollment.addTag(tagName, dependencies.now())
      }
      return true
    } catch (error) {
      dependencies.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao aplicar tag de produto: ${dependencies.formatError(error)}`)
      return false
    }
  }

  async removeTagFromUserProduct(userId: string, productId: string, tagName: string): Promise<boolean> {
    const dependencies = this.dependencies
    dependencies.ensureAvailable()
    try {
      const enrollment = await dependencies.repository.findEnrollment(userId, productId)
      if (!enrollment) return false
      const user = await dependencies.repository.findUser(userId)
      if (!user?.email) return false

      await dependencies.removeTag(user.email, tagName)
      await enrollment.replaceTags(
        enrollment.tags.filter((tag) => tag !== tagName),
        dependencies.now(),
      )
      return true
    } catch (error) {
      dependencies.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao remover tag de produto: ${dependencies.formatError(error)}`)
      return false
    }
  }

  async syncContactByProduct(userId: string, productId: string): Promise<ACContactResponse> {
    const dependencies = this.dependencies
    dependencies.ensureAvailable()
    try {
      const user = await dependencies.repository.findUser(userId)
      const productExists = await dependencies.repository.productExists(productId)
      const enrollment = await dependencies.repository.findEnrollment(userId, productId)
      if (!user || !productExists || !enrollment) {
        throw new Error('User, Product or UserProduct not found')
      }

      let contact = await dependencies.getContactByEmail(user.email)
      if (!contact) {
        const parts = user.name?.split(' ') || []
        contact = await dependencies.createOrUpdateContact({
          email: user.email,
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
        })
      }
      for (const tag of enrollment.tags) await dependencies.addTag(user.email, tag)
      return contact
    } catch (error) {
      dependencies.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao sincronizar contacto de produto: ${dependencies.formatError(error)}`)
      throw error
    }
  }

  async removeAllProductTags(userId: string, productId: string): Promise<boolean> {
    const dependencies = this.dependencies
    dependencies.ensureAvailable()
    try {
      const user = await dependencies.repository.findUser(userId)
      const productExists = await dependencies.repository.productExists(productId)
      const enrollment = await dependencies.repository.findEnrollment(userId, productId)
      if (!user || !productExists || !enrollment) return false

      for (const tag of enrollment.tags) await dependencies.removeTag(user.email, tag)
      await enrollment.clearTags(dependencies.now())
      return true
    } catch (error) {
      dependencies.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao remover tags de produto: ${dependencies.formatError(error)}`)
      return false
    }
  }
}
