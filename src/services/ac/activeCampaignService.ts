// ════════════════════════════════════════════════════════════
// 📁 src/services/activeCampaignService.ts
// Serviço de integração com Active Campaign API
// ════════════════════════════════════════════════════════════

import axios, { AxiosInstance, AxiosError } from 'axios'
import { activeCampaignConfig, validateConfig } from '../../config/activecampaign.config'
import { 
  ACContact, 
  ACContactApi, 
  ACContactResponse, 
  ACTag, 
  ACTagResponse 
} from '../../types/activecampaign.types'

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL
// ─────────────────────────────────────────────────────────────

class ActiveCampaignService {
  public client: AxiosInstance // Público para ser usado pelo ContactTagReader
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

  public async retryRequest<T>(
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
/**
 * Encontrar ou criar contacto (retorna o contacto com id)
 */
async findOrCreateContact(email: string, name?: string): Promise<ACContactApi> {
  const existing = await this.getContactByEmail(email)
  if (existing?.contact) return existing.contact

  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] || ''
  const lastName = parts.slice(1).join(' ') || ''

  const created = await this.createOrUpdateContact({
    email,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {})
  })

  return created.contact
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
async removeTag(email: string, tagName: string): Promise<boolean> {
  await this.checkRateLimit()

  try {
    // 1. Buscar contacto
    const contact = await this.getContactByEmail(email)
    if (!contact) {
      console.warn(`⚠️ Contacto ${email} não existe.`)
      return false  // ← RETORNAR false EM VEZ DE void!
    }

    // 2. Buscar tag
    const tagId = await this.findTagByName(tagName)
    if (!tagId) {
      console.warn(`⚠️ Tag "${tagName}" não existe.`)
      return false  // ← RETORNAR false!
    }

    // 3. Buscar associação contactTag
    const contactTagId = await this.findContactTag(contact.contact.id, tagId)
    if (!contactTagId) {
      console.warn(`⚠️ Contacto ${email} não tem tag "${tagName}".`)
      return false  // ← RETORNAR false!
    }

    // 4. Remover associação
    await this.retryRequest(async () => {
      await this.client.delete(`/api/3/contactTags/${contactTagId}`)
    })

    console.log(`✅ Tag "${tagName}" removida de ${email}`)
    return true  // ← RETORNAR true SE REMOVEU!

  } catch (error) {
    console.error(`❌ Erro ao remover tag "${tagName}" de ${email}:`, this.formatError(error))
    return false  // ← RETORNAR false EM ERRO!
  }
}
  /**
   * Remover múltiplas tags de um contacto
   */
async removeTags(email: string, tagNames: string[]): Promise<void> {
  console.log(`[removeTags] 🗑️  Removendo ${tagNames.length} tags de ${email}`)
  
  for (const tagName of tagNames) {
    await this.removeTag(email, tagName)
  }
  
  console.log(`[removeTags] ✅ ${tagNames.length} tags processadas`)
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

  // ═══════════════════════════════════════════════════════════
  // ✅ SPRINT 5: CONTACT TAG READER - NOVOS MÉTODOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Buscar tags de um contacto
   * @param contactId ID do contacto no AC
   * @returns Array de tags do contacto
   */
  async getContactTags(contactId: string): Promise<any[]> {
    try {
      await this.checkRateLimit()
      
      const response = await this.client.get(`/api/3/contacts/${contactId}/contactTags`)
      
      // Buscar detalhes das tags
      const contactTags = response.data.contactTags || []
      const tagsWithDetails = await Promise.all(
        contactTags.map(async (ct: any) => {
          try {
            const tagResponse = await this.client.get(`/api/3/tags/${ct.tag}`)
            return {
              id: ct.id,
              tag: tagResponse.data.tag?.tag || ct.tag,
              cdate: ct.cdate,
              seriesid: ct.seriesid
            }
          } catch (error) {
            // Se falhar ao buscar tag, retornar ID apenas
            return {
              id: ct.id,
              tag: ct.tag,
              cdate: ct.cdate,
              seriesid: ct.seriesid
            }
          }
        })
      )
      
      return tagsWithDetails
    } catch (error: any) {
      console.error(`[AC Service] Erro ao buscar tags: ${this.formatError(error)}`)
      throw error
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ CORREÇÃO ISSUE #1: AC TAGS POR PRODUTO
  // ═══════════════════════════════════════════════════════════

/**
 * Aplicar tag a um UserProduct específico (não ao user global)
 * ✅ SEM DOUBLE PREFIX - Tag já vem formatada do DecisionEngine
 */
async applyTagToUserProduct(
  userId: string, 
  productId: string, 
  tagName: string  // Recebe: "OGI_V1 - Inativo 7d" (já tem prefixo!)
): Promise<boolean> {
  try {
    console.log(`[AC Service] Applying tag "${tagName}" to userId=${userId}, productId=${productId}`)

    // 1. Buscar User e Product
    const User = (await import('../../models/user')).default
    const Product = (await import('../../models/Product')).default
    const UserProduct = (await import('../../models/UserProduct')).default

    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!user || !product) {
      console.error('[AC Service] User or Product not found')
      return false
    }

    // 2. ✅ USAR TAG DIRETAMENTE (sem adicionar prefixo!)
    // Tag já vem formatada: "OGI_V1 - Inativo 7d"
    await this.addTag(user.email, tagName)  // ← SEM PREFIXO!

    // 3. Atualizar UserProduct.activeCampaignData.tags
    const userProduct = await UserProduct.findOne({ userId, productId })
    
    if (userProduct) {
      const existingTags = userProduct.activeCampaignData?.tags || []
      
      if (!existingTags.includes(tagName)) {  // ← Usar tagName diretamente
        await UserProduct.findByIdAndUpdate(userProduct._id, {
          $addToSet: {
            'activeCampaignData.tags': tagName  // ← SEM PREFIXO!
          },
          $set: {
            'activeCampaignData.lastSyncAt': new Date()
          }
        })

        console.log(`[AC Service] ✅ Tag "${tagName}" added to UserProduct`)
      } else {
        console.log(`[AC Service] Tag "${tagName}" already exists in UserProduct`)
      }
    }

    return true
  } catch (error: any) {
    console.error(`[AC Service] Error applying tag to UserProduct: ${this.formatError(error)}`)
    return false
  }
}

/**
 * Remover tag de um UserProduct específico
 * ✅ SEM DOUBLE PREFIX - Tag já vem formatada do DecisionEngine
 */
async removeTagFromUserProduct(
  userId: string,
  productId: string,
  tagName: string
): Promise<boolean> {
  try {
    console.log(`[AC Service] Removing tag "${tagName}" from userId=${userId}, productId=${productId}`)

    // 1. Buscar User e Product
    const User = (await import('../../models/user')).default
    const Product = (await import('../../models/Product')).default
    const UserProduct = (await import('../../models/UserProduct')).default

    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!user || !product) {
      console.error('[AC Service] User or Product not found')
      return false
    }

    // 2. ✅ REMOVER TAG DIRETAMENTE (sem adicionar prefixo!)
    await this.removeTag(user.email, tagName)  // ← SEM PREFIXO!

    // 3. Atualizar UserProduct.activeCampaignData.tags
    const userProduct = await UserProduct.findOne({ userId, productId })
    
    if (userProduct) {
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $pull: {
          'activeCampaignData.tags': tagName  // ← SEM PREFIXO!
        },
        $set: {
          'activeCampaignData.lastSyncAt': new Date()
        }
      })

      console.log(`[AC Service] ✅ Tag "${tagName}" removed from UserProduct`)
    }

    return true
  } catch (error: any) {
    console.error(`[AC Service] Error removing tag from UserProduct: ${this.formatError(error)}`)
    return false
  }
}

  /**
   * Sincronizar contacto no AC baseado em um produto específico
   * @param userId ID do user
   * @param productId ID do produto
   * @returns Contacto sincronizado
   */
  async syncContactByProduct(userId: string, productId: string): Promise<any> {
    try {
      const User = (await import('../../models/user')).default
      const Product = (await import('../../models/Product')).default
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
    } catch (error: any) {
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
    try {
      const User = (await import('../../models/user')).default
      const Product = (await import('../../models/Product')).default
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

      console.log(`[AC Service] ✅ All tags removed from product ${product.code} for user ${user.email}`)
      return true
    } catch (error: any) {
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

