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
  ACTagResponse 
} from '../../types/activecampaign.types'
import { User, UserProduct } from '../../models'

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
          params: { email },
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
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

/**
 * 🔑 Buscar contactId do Active Campaign (com cache na BD)
 *
 * ⚠️ IMPORTANTE: Esta função APENAS lê contactos, NUNCA cria/atualiza!
 * Active Campaign é READ-ONLY exceto para operações de tags do BO.
 *
 * Fluxo:
 * 1. Verifica se user.metadata.activeCampaignId já existe na BD
 * 2. Se não, busca via API: GET /api/3/contacts?filters[email]=...
 * 3. Guarda contactId na BD para futuras operações
 * 4. Retorna contactId ou null se não existir
 *
 * @param email Email do user
 * @param userId MongoDB _id do user (opcional, para guardar na BD)
 * @returns contactId do AC ou null
 */
async getContactId(email: string, userId?: string): Promise<string | null> {
  try {
    // Verificar cache na BD
    if (userId) {
      const user = await User.findById(userId).select('metadata.activeCampaignId')
      if (user?.metadata?.activeCampaignId) {
        return user.metadata.activeCampaignId
      }
    }

    // Buscar contacto via email
    const contact = await this.getContactByEmail(email)
    if (!contact) {
      return null
    }

    const contactId = contact.contact.id

    // Guardar na BD para cache
    if (userId && contactId) {
      await User.findByIdAndUpdate(userId, {
        $set: { 'metadata.activeCampaignId': contactId }
      })
    }

    return contactId

  } catch (error) {
    console.error(`[AC Service] ❌ Erro ao buscar contactId para ${email}:`, this.formatError(error))
    return null
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
        contact = await this.createOrUpdateContact({ email })
      }

      // 2. Buscar ou criar tag
      const tagId = await this.getOrCreateTag(tagName)

      // ✅ FIX: Verificar se associação JÁ EXISTE (evitar duplicados!)
      const existingContactTag = await this.findContactTag(contact.contact.id, tagId)

      if (existingContactTag) {
        // Tag já aplicada
        return {
          contactTag: {
            id: existingContactTag,
            contact: contact.contact.id,
            tag: tagId
          }
        } as ACTagResponse
      }

      // 3. Aplicar tag ao contacto (só se NÃO existir)
      const payload = {
        contactTag: {
          contact: contact.contact.id,
          tag: tagId
        }
      }

      const response = await this.retryRequest(async () => {
        return await this.client.post<ACTagResponse>('/api/3/contactTags', payload)
      })

      return response.data

    } catch (error) {
      console.error(`❌ [AC] Erro ao adicionar tag "${tagName}":`, this.formatError(error))
      throw error
    }
  }
/**
 * ✅ Buscar tags de um contacto pelo EMAIL (wrapper do método existente)
 * 
 * Este método é um wrapper do getContactTags(contactId) existente
 * que aceita email em vez de contactId. Útil para o tagOrchestrator
 * que só tem acesso ao email do user.
 * 
 * @param email Email do contacto
 * @returns Array de nomes de tags (strings simples: ["tag1", "tag2"])
 */
async getContactTagsByEmail(email: string): Promise<string[]> {
  try {
    const contact = await this.getContactByEmail(email)

    if (!contact) {
      return []
    }

    const contactId = contact.contact.id
    const contactTagsObjects = await this.getContactTags(contactId)

    const tagNames = contactTagsObjects
      .map((ct: any) => ct.tag)
      .filter(Boolean)

    return tagNames

  } catch (error: any) {
    console.error(`❌ [AC] Erro ao buscar tags:`, this.formatError(error))
    return []
  }
}

/**
 * ✅ REMOVE TAG DO CONTACTO (versão otimizada - sem verificação pós-delete)
 *
 * Fluxo:
 * 1. Busca contacto por email
 * 2. Busca ID da tag por nome
 * 3. Verifica se tag está aplicada
 * 4. Remove tag via DELETE /api/3/contactTags/{contactTagId}
 *
 * ⚡ OTIMIZAÇÃO: Remove tag e retorna imediatamente
 *
 * MOTIVO: Active Campaign tem cache no endpoint de listagem que pode demorar
 * minutos a atualizar. O DELETE funciona corretamente (confirmado por testes),
 * mas a verificação via getContactTags() pode dar falso positivo devido ao cache.
 *
 * @param email Email do contacto
 * @param tagName Nome da tag a remover
 * @returns TRUE se removida, FALSE se falhou
 */
async removeTag(email: string, tagName: string): Promise<boolean> {
  const debug = process.env.AC_DEBUG === 'true'
  const verify = process.env.AC_DEBUG_VERIFY_DELETE === 'true'

  await this.checkRateLimit()

  try {
    const contact = await this.getContactByEmail(email)
    if (!contact) return false

    const contactId = contact.contact.id

    const tagId = await this.findTagByName(tagName)
    if (!tagId) return true // tag não existe => já removida

    // ✅ ID CERTO: vem do endpoint do contacto
    const contactTagId = await this.findContactTagIdFromContact(contactId, tagId)
    if (!contactTagId) return true // associação não existe => já removida

    // DELETE real
    await this.retryRequest(async () => {
      return await this.client.delete(`/api/3/contactTags/${contactTagId}`, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      })
    })

    // Verificação opcional por ID
    if (verify) {
      try {
        await this.client.get(`/api/3/contactTags/${contactTagId}`, {
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        })
        return false
      } catch (e: any) {
        if (e?.response?.status === 404) {
          return true
        }
        return true
      }
    }

    return true
  } catch (error: any) {
    // ⚠️ eu aqui NÃO tratava 404 como sucesso às cegas sem debug,
    // porque pode ser URL errada (/api/3 duplicado) ou ID errado.
    console.error(`❌ [AC] Erro ao remover tag "${tagName}":`, this.formatError(error))
    return false
  }
}
private async findContactTagIdFromContact(
  contactId: string,
  tagId: string
): Promise<string | null> {
  await this.checkRateLimit()

  const resp = await this.retryRequest(async () => {
    return await this.client.get(`/api/3/contacts/${contactId}/contactTags`, {
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    })
  })

  const contactTags = resp.data?.contactTags || []
  const match = contactTags.find((ct: any) => String(ct.tag) === String(tagId))

  return match?.id || null
}


async removeTagBatch(
    email: string,
    tagNames: string[],
    batchSize: number = 3
    ): Promise<{
      success: string[]
      failed: string[]
      total: number
    }> {
    const result = {
      success: [] as string[],
      failed: [] as string[],
      total: tagNames.length
    }

    // Processar em batches
    for (let i = 0; i < tagNames.length; i += batchSize) {
      const batch = tagNames.slice(i, i + batchSize)

      // Processar batch em paralelo
      const promises = batch.map(tag => this.removeTag(email, tag))
      const results = await Promise.all(promises)

      // Categorizar resultados
      batch.forEach((tag, idx) => {
        if (results[idx]) {
          result.success.push(tag)
        } else {
          result.failed.push(tag)
        }
      })

      // Rate limit entre batches
      if (i + batchSize < tagNames.length) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    return result
}


  // ═══════════════════════════════════════════════════════════

  // ATUALIZAR MÉTODO removeTags() PARA USAR removeTagBatch()
// ═══════════════════════════════════════════════════════════

/**
 * Remover múltiplas tags (usa removeTagBatch)
 */
async removeTags(email: string, tagNames: string[]): Promise<void> {
  await this.removeTagBatch(email, tagNames)
}

  // ═══════════════════════════════════════════════════════════
  // HELPERS - TAGS
  // ═══════════════════════════════════════════════════════════

  /**
   * Buscar ou criar tag (público para ser usado pelo tagPreCreation)
   */
  public async getOrCreateTag(tagName: string): Promise<string> {
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
          params: { search: tagName },
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
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
      return await this.client.get(`/api/3/contacts/${contactId}/contactTags`, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      })
    })

    const contactTags = response.data.contactTags || []
    const match = contactTags.find((ct: any) => String(ct.tag) === String(tagId))
    return match?.id || null
  } catch (error) {
    console.error(`[AC] findContactTag() ERROR:`, this.formatError(error))
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

      const response = await this.client.get(`/api/3/contacts/${contactId}/contactTags`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })

      const contactTags = response.data.contactTags || []

      const tagsWithDetails = await Promise.all(
        contactTags.map(async (ct: any) => {
          try {
            const tagResponse = await this.client.get(`/api/3/tags/${ct.tag}`, {
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            })

            return {
              id: ct.id,
              tag: tagResponse.data.tag?.tag || ct.tag,
              cdate: ct.cdate,
              seriesid: ct.seriesid
            }
          } catch (error) {
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
    tagName: string
  ): Promise<boolean> {
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
    } catch (error: any) {
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
        userProduct.activeCampaignData = { tags: [] }
      }

      userProduct.activeCampaignData.tags = updatedTags
      userProduct.activeCampaignData.lastSyncAt = new Date()

      await userProduct.save()

      return true
    } catch (error: any) {
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
  async syncContactByProduct(userId: string, productId: string): Promise<any> {
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

