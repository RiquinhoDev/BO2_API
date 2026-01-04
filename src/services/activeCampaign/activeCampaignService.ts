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
  console.log('\n🔍 ═'.repeat(40))
  console.log('🔍 [MONITOR] addTag() CHAMADO!')
  console.log(`🔍 [MONITOR] Email: ${email}`)
  console.log(`🔍 [MONITOR] Tag: "${tagName}"`)
  console.log(`🔍 [MONITOR] Timestamp: ${new Date().toISOString()}`)
  console.log('🔍 [MONITOR] Stack trace:')
  
  const stack = new Error().stack
  if (stack) {
    const lines = stack.split('\n')
    const relevantLines = lines
      .filter(line => !line.includes('node_modules'))
      .slice(0, 10)
    
    relevantLines.forEach(line => {
      console.log(`🔍 [MONITOR]    ${line.trim()}`)
    })
  }
  
  console.log('🔍 ═'.repeat(40))
  console.log()
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
    console.log(`[AC Service] 🔍 Buscando tags pelo email: ${email}`)
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR CONTACTO PELO EMAIL
    // ═══════════════════════════════════════════════════════════
    const contact = await this.getContactByEmail(email)
    
    if (!contact) {
      console.warn(`[AC Service] ⚠️  Contacto ${email} não existe no AC`)
      return []
    }
    
    const contactId = contact.contact.id
    console.log(`[AC Service] ✅ Contacto encontrado (ID: ${contactId})`)
    
    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR TAGS USANDO MÉTODO EXISTENTE getContactTags(contactId)
    // ═══════════════════════════════════════════════════════════
    const contactTagsObjects = await this.getContactTags(contactId)
    
    // ═══════════════════════════════════════════════════════════
    // 3. EXTRAIR SÓ OS NOMES DAS TAGS (strings)
    // ═══════════════════════════════════════════════════════════
    const tagNames = contactTagsObjects
      .map((ct: any) => ct.tag)
      .filter(Boolean) // Remove null/undefined
    
    console.log(`[AC Service] ✅ ${tagNames.length} tags encontradas`)
    
    // Log das tags (limitado a 10 para não poluir)
    if (tagNames.length > 0 && tagNames.length <= 10) {
      console.log(`[AC Service] Tags: ${tagNames.join(', ')}`)
    } else if (tagNames.length > 10) {
      console.log(`[AC Service] Tags (primeiras 10): ${tagNames.slice(0, 10).join(', ')}...`)
    }
    
    return tagNames
    
  } catch (error: any) {
    console.error(`[AC Service] ❌ Erro ao buscar tags do contacto:`)
    console.error(`[AC Service] ${this.formatError(error)}`)
    
    // Retornar array vazio em caso de erro (não bloquear orquestração)
    return []
  }
}

/**
 * ✅ FIX: Remover tag de um contacto (COM VERIFICAÇÃO!)
 * 
 * ANTES: Sempre retornava TRUE (mesmo se falhou)
 * DEPOIS: Verifica se tag foi REALMENTE removida
 * 
 * @param email Email do contacto
 * @param tagName Nome da tag a remover
 * @param maxRetries Número máximo de tentativas (default: 3)
 * @returns TRUE se removida, FALSE se falhou
 */
async removeTag(
  email: string, 
  tagName: string,
  maxRetries: number = 3
): Promise<boolean> {
  await this.checkRateLimit()

  console.log(`[AC Service] 🗑️  removeTag() INICIADO`)
  console.log(`   email: ${email}`)
  console.log(`   tagName: ${tagName}`)
  console.log(`   maxRetries: ${maxRetries}`)

  // ═══════════════════════════════════════════════════════════
  // PASSO 1: BUSCAR CONTACTO
  // ═══════════════════════════════════════════════════════════
  
  try {
    console.log(`[AC Service] 📡 PASSO 1/5: Buscando contacto...`)
    const contact = await this.getContactByEmail(email)
    
    if (!contact) {
      console.warn(`[AC Service] ⚠️  PASSO 1/5 FALHOU: Contacto ${email} não existe.`)
      return false
    }
    
    console.log(`[AC Service] ✅ PASSO 1/5: Contacto encontrado (ID: ${contact.contact.id})`)

    // ═══════════════════════════════════════════════════════════
    // PASSO 2: BUSCAR TAG
    // ═══════════════════════════════════════════════════════════
    
    console.log(`[AC Service] 📡 PASSO 2/5: Buscando tag "${tagName}"...`)
    const tagId = await this.findTagByName(tagName)
    
    if (!tagId) {
      console.warn(`[AC Service] ⚠️  PASSO 2/5: Tag "${tagName}" não existe no AC.`)
      console.warn(`[AC Service] ℹ️  Tag nunca foi criada, considerando como removida.`)
      return true  // Tag não existe = já está "removida"
    }
    
    console.log(`[AC Service] ✅ PASSO 2/5: Tag encontrada (ID: ${tagId})`)

    // ═══════════════════════════════════════════════════════════
    // PASSO 3: BUSCAR ASSOCIAÇÃO CONTACTTAG
    // ═══════════════════════════════════════════════════════════
    
    console.log(`[AC Service] 📡 PASSO 3/5: Buscando associação contactTag...`)
    const contactTagId = await this.findContactTag(contact.contact.id, tagId)
    
    if (!contactTagId) {
      console.warn(`[AC Service] ⚠️  PASSO 3/5: Contacto não tem tag "${tagName}".`)
      console.warn(`[AC Service] ℹ️  Tag já não está aplicada, considerando como removida.`)
      return true  // Tag não está aplicada = já está removida
    }
    
    console.log(`[AC Service] ✅ PASSO 3/5: Associação encontrada (contactTagId: ${contactTagId})`)

    // ═══════════════════════════════════════════════════════════
    // PASSO 4: TENTAR REMOVER (COM RETRY)
    // ═══════════════════════════════════════════════════════════
    
    console.log(`[AC Service] 📡 PASSO 4/5: Removendo associação...`)
    
    let attempt = 0
    let deleted = false
    
    while (attempt < maxRetries && !deleted) {
      attempt++
      console.log(`[AC Service]    Tentativa ${attempt}/${maxRetries}...`)
      
      try {
        // DELETE request
        await this.retryRequest(async () => {
          await this.client.delete(`/api/3/contactTags/${contactTagId}`)
        })
        
        console.log(`[AC Service]    ✅ DELETE executado (HTTP 200 OK)`)
        
        // Aguardar 2 segundos para AC processar
        console.log(`[AC Service]    ⏱️  Aguardando 2s para AC processar...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // ✅ NOVO: VERIFICAR se tag foi REALMENTE removida
        console.log(`[AC Service]    🔍 Verificando se tag foi removida...`)
        const tagsAfter = await this.getContactTagsByEmail(email)
        
        if (tagsAfter.includes(tagName)) {
          console.warn(`[AC Service]    ❌ Tag "${tagName}" AINDA PRESENTE após DELETE!`)
          
          if (attempt < maxRetries) {
            console.log(`[AC Service]    🔄 Aguardando 3s antes de retry...`)
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        } else {
          console.log(`[AC Service]    ✅ Verificação OK: Tag realmente removida!`)
          deleted = true
        }
        
      } catch (error: any) {
        console.error(`[AC Service]    ❌ Erro no DELETE:`, error.message)
        
        if (attempt < maxRetries) {
          console.log(`[AC Service]    🔄 Aguardando 3s antes de retry...`)
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // PASSO 5: RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════
    
    if (deleted) {
      console.log(`[AC Service] ✅ PASSO 4/5: Tag removida com sucesso!`)
      console.log(`[AC Service] ═`.repeat(40))
      console.log(`[AC Service] ✅ Tag "${tagName}" VERIFICADA: REMOVIDA DO AC!`)
      console.log(`[AC Service] ═`.repeat(40))
      return true
    } else {
      console.error(`[AC Service] ❌ PASSO 4/5: FALHA após ${maxRetries} tentativas!`)
      console.error(`[AC Service] ═`.repeat(40))
      console.error(`[AC Service] 🚨 Tag "${tagName}" NÃO foi removida do AC!`)
      console.error(`[AC Service] ═`.repeat(40))
      return false
    }
    
  } catch (error: any) {
    console.error(`[AC Service] ❌ ERRO FATAL em removeTag():`)
    console.error(`[AC Service] ❌ ${error.message}`)
    console.error(error.stack)
    return false
  }
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
  console.log(`[AC Service] 🗑️  removeTagBatch() INICIADO`)
  console.log(`   email: ${email}`)
  console.log(`   tags: ${tagNames.length}`)
  console.log(`   batchSize: ${batchSize}`)

  const result = {
    success: [] as string[],
    failed: [] as string[],
    total: tagNames.length
  }

  // Processar em batches
  for (let i = 0; i < tagNames.length; i += batchSize) {
    const batch = tagNames.slice(i, i + batchSize)
    
    console.log(`[AC Service] 📦 Processando batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tagNames.length / batchSize)}`)
    console.log(`[AC Service]    Tags: ${batch.join(', ')}`)
    
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
      console.log(`[AC Service] ⏱️  Aguardando 2s antes do próximo batch...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log(`[AC Service] ═`.repeat(40))
  console.log(`[AC Service] 📊 RESULTADO removeTagBatch():`)
  console.log(`[AC Service]    ✅ Sucesso: ${result.success.length}/${result.total}`)
  console.log(`[AC Service]    ❌ Falha: ${result.failed.length}/${result.total}`)
  
  if (result.failed.length > 0) {
    console.log(`[AC Service]    Tags que falharam:`)
    result.failed.forEach(tag => console.log(`[AC Service]       - ${tag}`))
  }
  
  console.log(`[AC Service] ═`.repeat(40))

  return result
}

// ═══════════════════════════════════════════════════════════
// ATUALIZAR MÉTODO removeTags() PARA USAR removeTagBatch()
// ═══════════════════════════════════════════════════════════

/**
 * ✅ ATUALIZADO: Remover múltiplas tags (usa removeTagBatch)
 */
async removeTags(email: string, tagNames: string[]): Promise<void> {
  console.log(`[removeTags] 🗑️  Removendo ${tagNames.length} tags de ${email}`)
  
  const result = await this.removeTagBatch(email, tagNames)
  
  if (result.failed.length > 0) {
    console.warn(`[removeTags] ⚠️  ${result.failed.length} tags falharam:`)
    result.failed.forEach(tag => console.warn(`[removeTags]    - ${tag}`))
  }
  
  console.log(`[removeTags] ✅ ${result.success.length} tags removidas com sucesso`)
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
    const Product = (await import('../../models/product/Product')).default
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
  console.log('[AC Service] 🔍 removeTagFromUserProduct() INICIADO')
  console.log('[AC Service] ═'.repeat(40))
  console.log(`[AC Service]    userId: ${userId}`)
  console.log(`[AC Service]    productId: ${productId}`)
  console.log(`[AC Service]    tagName: "${tagName}"`)
  console.log('[AC Service] ═'.repeat(40))

  try {
    // 1. Buscar UserProduct
    console.log('[AC Service] 📡 PASSO 1/4: Buscando UserProduct...')
    
    const userProduct = await UserProduct.findOne({ userId, productId })
    
    if (!userProduct) {
      console.log('[AC Service] ❌ PASSO 1/4: UserProduct NÃO encontrado!')
      return false
    }
    
    console.log('[AC Service] ✅ PASSO 1/4: UserProduct encontrado')
    console.log(`[AC Service]    _id: ${userProduct._id}`)
    
    // 2. Buscar User (para email)
    console.log('[AC Service] 📡 PASSO 2/4: Buscando User...')
    
    const user = await User.findById(userId)
    
    if (!user?.email) {
      console.log('[AC Service] ❌ PASSO 2/4: User NÃO encontrado ou sem email!')
      return false
    }
    
    console.log('[AC Service] ✅ PASSO 2/4: User encontrado')
    console.log(`[AC Service]    email: ${user.email}`)
    
    // 3. REMOVER do Active Campaign
    console.log('[AC Service] 📡 PASSO 3/4: Removendo tag do AC...')
    console.log(`[AC Service]    Chamando: removeTag("${user.email}", "${tagName}")`)
    
    const removedFromAC = await this.removeTag(user.email, tagName)
    
    if (!removedFromAC) {
      console.log('[AC Service] ⚠️  PASSO 3/4: removeTag() retornou FALSE!')
      console.log('[AC Service] ⚠️  Tag NÃO foi removida do Active Campaign!')
      // Continuar mesmo assim para remover da BD
    } else {
      console.log('[AC Service] ✅ PASSO 3/4: Tag removida do AC com sucesso!')
    }
    
    // 4. REMOVER da BD (UserProduct.activeCampaignData.tags)
    console.log('[AC Service] 📡 PASSO 4/4: Removendo tag da BD...')
    
    const currentTags = userProduct.activeCampaignData?.tags || []
    console.log(`[AC Service]    Tags ANTES: ${currentTags.length}`)
    currentTags.forEach((tag: string, i: number) => {
      console.log(`[AC Service]       ${i + 1}. "${tag}"`)
    })
    
    const tagExists = currentTags.includes(tagName)
    console.log(`[AC Service]    Tag "${tagName}" existe na BD? ${tagExists ? 'SIM' : 'NÃO'}`)
    
    if (!tagExists) {
      console.log('[AC Service] ⚠️  PASSO 4/4: Tag NÃO estava na BD!')
      console.log('[AC Service] ℹ️  Possível inconsistência: tag no AC mas não na BD')
    }
    
    // Filtrar tag
    const updatedTags = currentTags.filter((t: string) => t !== tagName)
    console.log(`[AC Service]    Tags DEPOIS: ${updatedTags.length}`)
    
    if (updatedTags.length === currentTags.length) {
      console.log('[AC Service] ⚠️  NENHUMA tag foi removida da lista!')
    } else {
      console.log(`[AC Service] ✅ Tag "${tagName}" removida da lista`)
    }
    
    // Atualizar BD
    if (!userProduct.activeCampaignData) {
      userProduct.activeCampaignData = { tags: [] }
    }
    
    userProduct.activeCampaignData.tags = updatedTags
    userProduct.activeCampaignData.lastSyncAt = new Date()
    
    await userProduct.save()
    
    console.log('[AC Service] ✅ PASSO 4/4: BD atualizada!')
    console.log('[AC Service] ═'.repeat(40))
    console.log(`[AC Service] ✅ Tag "${tagName}" removed from UserProduct`)
    console.log('[AC Service] ═'.repeat(40))
    
    return true
    
  } catch (error: any) {
    console.error('[AC Service] ❌ ERRO FATAL em removeTagFromUserProduct:')
    console.error(`[AC Service] ❌ ${error.message}`)
    console.error(error.stack)
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

