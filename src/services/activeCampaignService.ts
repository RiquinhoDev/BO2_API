// ════════════════════════════════════════════════════════════
// 📁 src/services/activeCampaignService.ts
// Serviço de integração com Active Campaign API
// ════════════════════════════════════════════════════════════

import axios, { AxiosInstance, AxiosError } from 'axios'
import { activeCampaignConfig, validateConfig } from '../config/activecampaign.config'
import { 
  ACContact, 
  ACContactResponse, 
  ACTag, 
  ACTagResponse 
} from '../types/activecampaign.types'

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL
// ─────────────────────────────────────────────────────────────

class ActiveCampaignService {
  private client: AxiosInstance
  private requestCount: number = 0
  private lastResetTime: number = Date.now()

  constructor() {
    // Validar configuração
    if (!validateConfig()) {
      console.warn('⚠️ Active Campaign não está configurado corretamente')
      // Criar cliente dummy para evitar erros
      this.client = axios.create()
      return
    }

    // Criar cliente Axios
    this.client = axios.create({
      baseURL: activeCampaignConfig.apiUrl,
      timeout: activeCampaignConfig.requestTimeout,
      headers: {
        'Api-Token': activeCampaignConfig.apiKey,
        'Content-Type': 'application/json'
      }
    })

    console.log('✅ Active Campaign Service inicializado')
  }

  // ═══════════════════════════════════════════════════════════
  // RATE LIMITING
  // ═══════════════════════════════════════════════════════════

  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceReset = now - this.lastResetTime

    // Reset contador a cada minuto
    if (timeSinceReset >= 60000) {
      this.requestCount = 0
      this.lastResetTime = now
    }

    // Verificar se excedeu limite
    if (this.requestCount >= activeCampaignConfig.maxRequestsPerMinute) {
      const waitTime = 60000 - timeSinceReset
      console.warn(`⏸️ Rate limit atingido. Aguardando ${waitTime}ms...`)
      await this.sleep(waitTime)
      this.requestCount = 0
      this.lastResetTime = Date.now()
    }

    this.requestCount++
    
    // Delay entre requests
    if (this.requestCount > 1) {
      await this.sleep(activeCampaignConfig.requestDelay)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ═══════════════════════════════════════════════════════════
  // RETRY LOGIC
  // ═══════════════════════════════════════════════════════════

  private async retryRequest<T>(
    fn: () => Promise<T>,
    retries: number = activeCampaignConfig.maxRetries
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        console.warn(`⚠️ Erro na request. Tentando novamente... (${retries} tentativas restantes)`)
        await this.sleep(activeCampaignConfig.retryDelay)
        return this.retryRequest(fn, retries - 1)
      }
      throw error
    }
  }

  private isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      // Retry em erros 5xx ou timeout
      return !status || status >= 500 || error.code === 'ECONNABORTED'
    }
    return false
  }

  // ═══════════════════════════════════════════════════════════
  // CONTACTOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Buscar contacto por email
   */
  async getContactByEmail(email: string): Promise<ACContactResponse | null> {
    await this.checkRateLimit()

    try {
      const response = await this.retryRequest(async () => {
        return await this.client.get<any>('/api/3/contacts', {
          params: { email }
        })
      })

      if (response.data && response.data.contacts && response.data.contacts.length > 0) {
        return { contact: response.data.contacts[0] }
      }

      return null
    } catch (error) {
      console.error(`❌ Erro ao buscar contacto ${email}:`, this.formatError(error))
      throw error
    }
  }

  /**
   * Criar ou atualizar contacto
   */
  async createOrUpdateContact(contact: ACContact): Promise<ACContactResponse> {
    await this.checkRateLimit()

    try {
      // Verificar se contacto já existe
      const existing = await this.getContactByEmail(contact.email)

      if (existing) {
        // Atualizar contacto existente
        return await this.retryRequest(async () => {
          const response = await this.client.put<ACContactResponse>(
            `/api/3/contacts/${existing.contact.id}`,
            { contact }
          )
          return response.data
        })
      } else {
        // Criar novo contacto
        return await this.retryRequest(async () => {
          const response = await this.client.post<ACContactResponse>(
            '/api/3/contacts',
            { contact }
          )
          return response.data
        })
      }
    } catch (error) {
      console.error(`❌ Erro ao criar/atualizar contacto ${contact.email}:`, this.formatError(error))
      throw error
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════

  /**
   * Adicionar tag a um contacto
   */
  async addTag(email: string, tagName: string): Promise<ACTagResponse> {
    await this.checkRateLimit()

    try {
      // 1. Garantir que contacto existe
      let contact = await this.getContactByEmail(email)
      
      if (!contact) {
        console.log(`📝 Contacto ${email} não existe. Criando...`)
        contact = await this.createOrUpdateContact({ email })
      }

      // 2. Buscar ou criar tag
      const tagId = await this.getOrCreateTag(tagName)

      // 3. Aplicar tag ao contacto
      const payload = {
        contactTag: {
          contact: contact.contact.id,
          tag: tagId
        }
      }

      const response = await this.retryRequest(async () => {
        return await this.client.post<ACTagResponse>('/api/3/contactTags', payload)
      })

      console.log(`✅ Tag "${tagName}" aplicada a ${email}`)
      return response.data

    } catch (error) {
      console.error(`❌ Erro ao adicionar tag "${tagName}" a ${email}:`, this.formatError(error))
      throw error
    }
  }

  /**
   * Remover tag de um contacto
   */
  async removeTag(email: string, tagName: string): Promise<void> {
    await this.checkRateLimit()

    try {
      // 1. Buscar contacto
      const contact = await this.getContactByEmail(email)
      if (!contact) {
        console.warn(`⚠️ Contacto ${email} não existe. Nada a remover.`)
        return
      }

      // 2. Buscar tag
      const tagId = await this.findTagByName(tagName)
      if (!tagId) {
        console.warn(`⚠️ Tag "${tagName}" não existe. Nada a remover.`)
        return
      }

      // 3. Buscar associação contactTag
      const contactTagId = await this.findContactTag(contact.contact.id, tagId)
      if (!contactTagId) {
        console.warn(`⚠️ Contacto ${email} não tem tag "${tagName}".`)
        return
      }

      // 4. Remover associação
      await this.retryRequest(async () => {
        await this.client.delete(`/api/3/contactTags/${contactTagId}`)
      })

      console.log(`✅ Tag "${tagName}" removida de ${email}`)

    } catch (error) {
      console.error(`❌ Erro ao remover tag "${tagName}" de ${email}:`, this.formatError(error))
      throw error
    }
  }

  /**
   * Remover múltiplas tags de um contacto
   */
  async removeTags(email: string, tagNames: string[]): Promise<void> {
    for (const tagName of tagNames) {
      await this.removeTag(email, tagName)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS - TAGS
  // ═══════════════════════════════════════════════════════════

  private async getOrCreateTag(tagName: string): Promise<string> {
    await this.checkRateLimit()

    try {
      // Tentar buscar tag existente
      const existingTagId = await this.findTagByName(tagName)
      if (existingTagId) {
        return existingTagId
      }

      // Criar nova tag
      const response = await this.retryRequest(async () => {
        return await this.client.post('/api/3/tags', {
          tag: {
            tag: tagName,
            tagType: 'contact'
          }
        })
      })

      return response.data.tag.id
    } catch (error) {
      console.error(`❌ Erro ao obter/criar tag "${tagName}":`, this.formatError(error))
      throw error
    }
  }

  private async findTagByName(tagName: string): Promise<string | null> {
    await this.checkRateLimit()

    try {
      const response = await this.retryRequest(async () => {
        return await this.client.get('/api/3/tags', {
          params: { search: tagName }
        })
      })

      const tags = response.data.tags || []
      const tag = tags.find((t: any) => t.tag === tagName)
      
      return tag ? tag.id : null
    } catch (error) {
      console.error(`❌ Erro ao buscar tag "${tagName}":`, this.formatError(error))
      return null
    }
  }

  private async findContactTag(contactId: string, tagId: string): Promise<string | null> {
    await this.checkRateLimit()

    try {
      const response = await this.retryRequest(async () => {
        return await this.client.get('/api/3/contactTags', {
          params: {
            'filters[contact]': contactId,
            'filters[tag]': tagId
          }
        })
      })

      const contactTags = response.data.contactTags || []
      return contactTags.length > 0 ? contactTags[0].id : null
    } catch (error) {
      console.error(`❌ Erro ao buscar contactTag:`, this.formatError(error))
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════

  private formatError(error: any): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      return JSON.stringify({
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message
      }, null, 2)
    }
    return error.message || 'Erro desconhecido'
  }

  /**
   * Testar conexão com API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.checkRateLimit()
      await this.client.get('/api/3/users/me')
      console.log('✅ Conexão AC testada com sucesso')
      return true
    } catch (error) {
      console.error('❌ Erro ao testar conexão AC:', this.formatError(error))
      return false
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export default new ActiveCampaignService()

