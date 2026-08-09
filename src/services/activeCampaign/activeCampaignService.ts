// ════════════════════════════════════════════════════════════
// 📁 src/services/activeCampaignService.ts
// Serviço de integração com Active Campaign API
// ════════════════════════════════════════════════════════════

import type { AxiosInstance } from 'axios'
import type { ActiveCampaignIntegration } from '../../config/configTypes'
import { ActiveCampaignTransport } from './activeCampaignTransport'
import { ActiveCampaignContactsService } from './activeCampaignContacts.service'
import { ActiveCampaignTagsService, type ActiveCampaignContactTag, type TagBatchResult } from './activeCampaignTags.service'
import { 
  ACContact, 
  ACContactApi, 
  ACContactResponse, 
  ACTagResponse
} from '../../types/activecampaign.types'
import { User, UserProduct } from '../../models'

class ActiveCampaignService {
  private readonly transport = new ActiveCampaignTransport()
  private readonly contacts = new ActiveCampaignContactsService(this.transport)
  private readonly tags = new ActiveCampaignTagsService(this.transport, this.contacts)

  public get client(): AxiosInstance {
    return this.transport.client
  }

  private getIntegration(): ActiveCampaignIntegration {
    return this.transport.ensureAvailable()
  }

  private rethrowIntegrationUnavailable(error: unknown): void {
    this.transport.rethrowIntegrationUnavailable(error)
  }

  private checkRateLimit(): Promise<void> {
    return this.transport.checkRateLimit()
  }

  public retryRequest<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
    return this.transport.retryRequest(fn, retries)
  }
  async getContactByEmail(email: string): Promise<ACContactResponse | null> {
    return this.contacts.getContactByEmail(email)
  }

  async getAllContacts(): Promise<ACContactApi[]> {
    return this.contacts.getAllContacts()
  }

  async createOrUpdateContact(contact: ACContact): Promise<ACContactResponse> {
    return this.contacts.createOrUpdateContact(contact)
  }

  async findOrCreateContact(email: string, name?: string): Promise<ACContactApi> {
    return this.contacts.findOrCreateContact(email, name)
  }

  async getContactId(email: string, userId?: string): Promise<string | null> {
    return this.contacts.getContactId(email, userId)
  }

  async getContactFieldValue(
    email: string,
    fieldId: number,
  ): Promise<{ contactId: string; value: string | null } | null> {
    return this.contacts.getContactFieldValue(email, fieldId)
  }

  async getContactFieldValues(
    email: string,
    userId: string | undefined,
    fieldIds: number[],
  ): Promise<{ contactId: string; values: Record<number, string | null> } | null> {
    return this.contacts.getContactFieldValues(email, userId, fieldIds)
  }

  async updateContactField(email: string, fieldId: number, value: string): Promise<boolean> {
    return this.contacts.updateContactField(email, fieldId, value)
  }

  async addTag(email: string, tagName: string): Promise<ACTagResponse> {
    return this.tags.addTag(email, tagName)
  }

  async getContactTagsByEmail(email: string): Promise<string[]> {
    return this.tags.getContactTagsByEmail(email)
  }

  async removeTag(email: string, tagName: string): Promise<boolean> {
    return this.tags.removeTag(email, tagName)
  }

  async removeTagBatch(email: string, tagNames: string[], batchSize = 3): Promise<TagBatchResult> {
    return this.tags.removeTagBatch(email, tagNames, batchSize)
  }

  async removeTags(email: string, tagNames: string[]): Promise<void> {
    return this.tags.removeTags(email, tagNames)
  }

  async findExistingTagByName(tagName: string): Promise<string | null> {
    return this.tags.findExistingTagByName(tagName)
  }

  async getOrCreateTag(tagName: string): Promise<string> {
    return this.tags.getOrCreateTag(tagName)
  }

  async getContactTags(contactId: string): Promise<ActiveCampaignContactTag[]> {
    return this.tags.getContactTags(contactId)
  }

  private formatError(error: unknown): string {
    return this.transport.formatError(error)
  }

  async testConnection(): Promise<boolean> {
    return this.transport.testConnection()
  }
/**
 * Aplicar tag a um UserProduct específico (não ao user global)
 * ✅ SEM DOUBLE PREFIX - Tag já vem formatada do DecisionEngine
 */
  async applyTagToUserProduct(
    userId: string,
    productId: string,
    tagName: string
  ): Promise<boolean> {
    this.getIntegration()
    try {
      const User = (await import('../../models/user')).default
      const Product = (await import('../../models/product/Product')).default
      const UserProduct = (await import('../../models/UserProduct')).default

      const user = await User.findById(userId)
      const product = await Product.findById(productId)

      if (!user || !product) {
        return false
      }

      await this.addTag(user.email, tagName)

      const userProduct = await UserProduct.findOne({ userId, productId })

      if (userProduct) {
        const existingTags = userProduct.activeCampaignData?.tags || []

        if (!existingTags.includes(tagName)) {
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $addToSet: {
              'activeCampaignData.tags': tagName
            },
            $set: {
              'activeCampaignData.lastSyncAt': new Date()
            }
          })
        }
      }

      return true
    } catch (error: unknown) {
      this.rethrowIntegrationUnavailable(error)
      console.error(`[AC Service] Error applying tag: ${this.formatError(error)}`)
      return false
    }
  }

/**
 * Remover tag de um UserProduct específico
 */
  async removeTagFromUserProduct(
    userId: string,
    productId: string,
    tagName: string
  ): Promise<boolean> {
    this.getIntegration()
    try {
      const userProduct = await UserProduct.findOne({ userId, productId })
      if (!userProduct) {
        return false
      }

      const user = await User.findById(userId)
      if (!user?.email) {
        return false
      }

      // Remover do Active Campaign
      await this.removeTag(user.email, tagName)

      // Atualizar BD
      const currentTags = userProduct.activeCampaignData?.tags || []
      const updatedTags = currentTags.filter((t: string) => t !== tagName)

      if (!userProduct.activeCampaignData) {
        userProduct.activeCampaignData = { tags: [], lists: [] }
      }

      userProduct.activeCampaignData.tags = updatedTags
      userProduct.activeCampaignData.lastSyncAt = new Date()

      await userProduct.save()

      return true
    } catch (error: unknown) {
      this.rethrowIntegrationUnavailable(error)
      console.error(`[AC Service] Error removing tag: ${this.formatError(error)}`)
      return false
    }
  }


  /**
   * Sincronizar contacto no AC baseado em um produto específico
   * @param userId ID do user
   * @param productId ID do produto
   * @returns Contacto sincronizado
   */
  async syncContactByProduct(userId: string, productId: string): Promise<ACContactResponse> {
    this.getIntegration()
    try {
      const User = (await import('../../models/user')).default
      const Product = (await import('../../models/product/Product')).default
      const UserProduct = (await import('../../models/UserProduct')).default

      const user = await User.findById(userId)
      const product = await Product.findById(productId)
      const userProduct = await UserProduct.findOne({ userId, productId })

      if (!user || !product || !userProduct) {
        throw new Error('User, Product or UserProduct not found')
      }

      // Criar/atualizar contacto no AC
      let contact = await this.getContactByEmail(user.email)
      
      if (!contact) {
        contact = await this.createOrUpdateContact({
          email: user.email,
          firstName: user.name?.split(' ')[0] || '',
          lastName: user.name?.split(' ').slice(1).join(' ') || ''
        })
      }

      // Aplicar tags do UserProduct ao AC
      const tags = userProduct.activeCampaignData?.tags || []
      for (const tag of tags) {
        await this.addTag(user.email, tag)
      }

      return contact
    } catch (error: unknown) {
      this.rethrowIntegrationUnavailable(error)
      console.error(`[AC Service] Error syncing contact by product: ${this.formatError(error)}`)
      throw error
    }
  }

  /**
   * Remover TODAS as tags de um produto de um user
   * @param userId ID do user
   * @param productId ID do produto
   * @returns Tags removidas com sucesso
   */
  async removeAllProductTags(userId: string, productId: string): Promise<boolean> {
    this.getIntegration()
    try {
      const User = (await import('../../models/user')).default
      const Product = (await import('../../models/product/Product')).default
      const UserProduct = (await import('../../models/UserProduct')).default

      const user = await User.findById(userId)
      const product = await Product.findById(productId)
      const userProduct = await UserProduct.findOne({ userId, productId })

      if (!user || !product || !userProduct) {
        return false
      }

      // Remover todas as tags do produto no AC
      const tags = userProduct.activeCampaignData?.tags || []
      
      for (const tag of tags) {
        await this.removeTag(user.email, tag)
      }

      // Limpar tags no UserProduct
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          'activeCampaignData.tags': [],
          'activeCampaignData.lastSyncAt': new Date()
        }
      })

      return true
    } catch (error: unknown) {
      this.rethrowIntegrationUnavailable(error)
      console.error(`[AC Service] Error removing all product tags: ${this.formatError(error)}`)
      return false
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export const activeCampaignService = new ActiveCampaignService()
export default activeCampaignService
