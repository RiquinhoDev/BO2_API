import axios from 'axios'
import type { ACTagResponse } from '../../types/activecampaign.types'
import logger from '../../utils/logger'
import { ActiveCampaignContactsService } from './activeCampaignContacts.service'
import { ActiveCampaignTransport } from './activeCampaignTransport'

interface ContactTagLink {
  id: string
  tag: string
  cdate?: string
  seriesid?: string | null
}

interface ContactTagsResponse {
  contactTags?: ContactTagLink[]
}

interface TagSummary {
  id: string
  tag: string
}

interface TagsResponse {
  tags?: TagSummary[]
}

interface TagDetailResponse {
  tag?: TagSummary
}

export interface ActiveCampaignContactTag {
  id: string
  tag: string
  cdate?: string
  seriesid?: string | null
}

export interface TagBatchResult {
  success: string[]
  failed: string[]
  total: number
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export class ActiveCampaignTagsService {
  constructor(
    private readonly transport: ActiveCampaignTransport,
    private readonly contacts: ActiveCampaignContactsService,
    private readonly sleep: (milliseconds: number) => Promise<void> = wait,
  ) {}

  async addTag(email: string, tagName: string): Promise<ACTagResponse> {
    this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      let contact = await this.contacts.getContactByEmail(email)
      if (!contact) contact = await this.contacts.createOrUpdateContact({ email })
      const tagId = await this.getOrCreateTag(tagName)
      const existingLink = await this.findContactTag(contact.contact.id, tagId)
      if (existingLink) {
        return {
          contactTag: { id: existingLink, contact: contact.contact.id, tag: tagId },
        }
      }
      const response = await this.transport.retryRequest(() =>
        this.transport.client.post<ACTagResponse>('/api/3/contactTags', {
          contactTag: { contact: contact.contact.id, tag: tagId },
        }),
      )
      return response.data
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao adicionar tag "${tagName}": ${this.transport.formatError(error)}`)
      throw error
    }
  }

  async getContactTagsByEmail(email: string): Promise<string[]> {
    this.transport.ensureAvailable()
    try {
      const contact = await this.contacts.getContactByEmail(email)
      if (!contact) return []
      const tags = await this.getContactTags(contact.contact.id)
      return tags.map((tag) => tag.tag).filter(Boolean)
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao buscar tags: ${this.transport.formatError(error)}`)
      return []
    }
  }

  async removeTag(email: string, tagName: string): Promise<boolean> {
    const { verifyDeleteEnabled } = this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      const contact = await this.contacts.getContactByEmail(email)
      if (!contact) return false
      const tagId = await this.findTagByName(tagName)
      if (!tagId) return true
      const linkId = await this.findContactTagId(contact.contact.id, tagId)
      if (!linkId) return true
      await this.transport.retryRequest(() =>
        this.transport.client.delete(`/api/3/contactTags/${linkId}`, {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }),
      )
      if (!verifyDeleteEnabled) return true
      try {
        await this.transport.client.get(`/api/3/contactTags/${linkId}`, {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        })
        return false
      } catch (error) {
        this.transport.rethrowIntegrationUnavailable(error)
        if (axios.isAxiosError(error) && error.response?.status === 404) return true
        return true
      }
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao remover tag "${tagName}": ${this.transport.formatError(error)}`)
      return false
    }
  }

  async removeTagBatch(email: string, tagNames: string[], batchSize = 3): Promise<TagBatchResult> {
    this.transport.ensureAvailable()
    const result: TagBatchResult = { success: [], failed: [], total: tagNames.length }
    for (let index = 0; index < tagNames.length; index += batchSize) {
      const batch = tagNames.slice(index, index + batchSize)
      const outcomes = await Promise.all(batch.map((tag) => this.removeTag(email, tag)))
      batch.forEach((tag, outcomeIndex) => {
        if (outcomes[outcomeIndex]) result.success.push(tag)
        else result.failed.push(tag)
      })
      if (index + batchSize < tagNames.length) await this.sleep(2_000)
    }
    return result
  }

  async removeTags(email: string, tagNames: string[]): Promise<void> {
    this.transport.ensureAvailable()
    await this.removeTagBatch(email, tagNames)
  }

  async getOrCreateTag(tagName: string): Promise<string> {
    this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      const existingTagId = await this.findTagByName(tagName)
      if (existingTagId) return existingTagId
      const response = await this.transport.retryRequest(() =>
        this.transport.client.post<{ tag: TagSummary }>('/api/3/tags', {
          tag: { tag: tagName, tagType: 'contact' },
        }),
      )
      return response.data.tag.id
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao obter/criar tag "${tagName}": ${this.transport.formatError(error)}`)
      throw error
    }
  }

  async getContactTags(contactId: string): Promise<ActiveCampaignContactTag[]> {
    this.transport.ensureAvailable()
    try {
      await this.transport.checkRateLimit()
      const response = await this.transport.client.get<ContactTagsResponse>(
        `/api/3/contacts/${contactId}/contactTags`,
        { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } },
      )
      return Promise.all((response.data.contactTags || []).map(async (link) => {
        try {
          const detail = await this.transport.client.get<TagDetailResponse>(
            `/api/3/tags/${link.tag}`,
            { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } },
          )
          return { ...link, tag: detail.data.tag?.tag || link.tag }
        } catch (error) {
          this.transport.rethrowIntegrationUnavailable(error)
          return link
        }
      }))
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao buscar tags: ${this.transport.formatError(error)}`)
      throw error
    }
  }

  // Consulta uma tag sem a criar. Os escritores usam esta confirmação antes de
  // aplicar tags de percurso; getOrCreateTag não serve porque pode criar.
  async findExistingTagByName(tagName: string): Promise<string | null> {
    return this.findTagByName(tagName)
  }

  private async findTagByName(tagName: string): Promise<string | null> {
    await this.transport.checkRateLimit()
    try {
      const response = await this.transport.retryRequest(() =>
        this.transport.client.get<TagsResponse>('/api/3/tags', {
          params: { search: tagName },
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }),
      )
      return (response.data.tags || []).find((tag) => tag.tag === tagName)?.id ?? null
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao buscar tag "${tagName}": ${this.transport.formatError(error)}`)
      return null
    }
  }

  private async findContactTag(contactId: string, tagId: string): Promise<string | null> {
    try {
      return await this.findContactTagId(contactId, tagId)
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao buscar associação de tag: ${this.transport.formatError(error)}`)
      return null
    }
  }

  private async findContactTagId(contactId: string, tagId: string): Promise<string | null> {
    await this.transport.checkRateLimit()
    const response = await this.transport.retryRequest(() =>
      this.transport.client.get<ContactTagsResponse>(`/api/3/contacts/${contactId}/contactTags`, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      }),
    )
    return (response.data.contactTags || [])
      .find((link) => String(link.tag) === String(tagId))?.id ?? null
  }
}
