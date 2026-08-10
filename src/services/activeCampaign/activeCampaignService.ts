// ════════════════════════════════════════════════════════════
// 📁 src/services/activeCampaignService.ts
// Serviço de integração com Active Campaign API
// ════════════════════════════════════════════════════════════

import type { AxiosInstance } from 'axios'
import { ActiveCampaignTransport } from './activeCampaignTransport'
import { ActiveCampaignContactsService } from './activeCampaignContacts.service'
import {
  ActiveCampaignTagsService,
  type ActiveCampaignContactTag,
  type TagBatchResult,
} from './activeCampaignTags.service'
import {
  ActiveCampaignProductTagsService,
  mongooseProductTagRepository,
} from './activeCampaignProductTags.service'
import { 
  ACContact, 
  ACContactApi, 
  ACContactResponse, 
  ACTagResponse
} from '../../types/activecampaign.types'

class ActiveCampaignService {
  private readonly transport = new ActiveCampaignTransport()
  private readonly contacts = new ActiveCampaignContactsService(this.transport)
  private readonly tags = new ActiveCampaignTagsService(this.transport, this.contacts)
  private readonly productTags = new ActiveCampaignProductTagsService({
    ensureAvailable: () => { this.transport.ensureAvailable() },
    rethrowIntegrationUnavailable: (error) => this.transport.rethrowIntegrationUnavailable(error),
    formatError: (error) => this.transport.formatError(error),
    addTag: (email, tagName) => this.addTag(email, tagName),
    removeTag: (email, tagName) => this.removeTag(email, tagName),
    getContactByEmail: (email) => this.getContactByEmail(email),
    createOrUpdateContact: (contact) => this.createOrUpdateContact(contact),
    repository: mongooseProductTagRepository,
    now: () => new Date(),
  })

  public get client(): AxiosInstance {
    return this.transport.client
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

  async getOrCreateTag(tagName: string): Promise<string> {
    return this.tags.getOrCreateTag(tagName)
  }

  async getContactTags(contactId: string): Promise<ActiveCampaignContactTag[]> {
    return this.tags.getContactTags(contactId)
  }

  async testConnection(): Promise<boolean> {
    return this.transport.testConnection()
  }
  async applyTagToUserProduct(userId: string, productId: string, tagName: string): Promise<boolean> {
    return this.productTags.applyTagToUserProduct(userId, productId, tagName)
  }

  async removeTagFromUserProduct(userId: string, productId: string, tagName: string): Promise<boolean> {
    return this.productTags.removeTagFromUserProduct(userId, productId, tagName)
  }

  async syncContactByProduct(userId: string, productId: string): Promise<ACContactResponse> {
    return this.productTags.syncContactByProduct(userId, productId)
  }

  async removeAllProductTags(userId: string, productId: string): Promise<boolean> {
    return this.productTags.removeAllProductTags(userId, productId)
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export const activeCampaignService = new ActiveCampaignService()
export default activeCampaignService
