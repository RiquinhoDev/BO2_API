// ════════════════════════════════════════════════════════════
// 📁 src/services/ac/contactTagReader.service.ts
// CORE: Leitura de tags do Active Campaign
// ════════════════════════════════════════════════════════════

import activeCampaignService from '../activeCampaignService'
import ProductProfile from '../../models/ProductProfile'
import ACContactState from '../../models/ACContactState'
import User from '../../models/user'
import StudentEngagementState from '../../models/StudentEngagementState'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export interface ContactTagInfo {
  contactId: string
  email: string
  lastSyncAt: Date
  tags: Array<{
    id: string
    name: string
    appliedAt: Date
    source: 'bo_system' | 'ac_manual' | 'ac_automation' | 'unknown'
    isSystemTag: boolean
  }>
  detectedProducts: Array<{
    code: string
    name: string
    detectedFromTags: string[]
    currentLevel: number | null
    confidence: number // 0-100
    isActive: boolean
    suggestedAction: string
  }>
  inconsistencies: Array<{
    type: 'missing_in_bo' | 'missing_in_ac' | 'level_mismatch' | 'state_conflict'
    description: string
    severity: 'low' | 'medium' | 'high'
    suggestedFix: string
  }>
  boState?: {
    userId: string
    currentProducts: string[]
    engagementStates: Array<{
      productCode: string
      currentLevel: number
      currentTagAC: string
      lastUpdate: Date
    }>
  }
}

export interface SyncResult {
  email: string
  success: boolean
  action: 'synced' | 'no_changes' | 'error' | 'conflict_detected'
  changesCount: number
  conflictsCount: number
  errors?: string[]
  metadata?: {
    tagsAdded: string[]
    tagsRemoved: string[]
    productsDetected: string[]
    inconsistenciesFound: number
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL
// ─────────────────────────────────────────────────────────────

export class ContactTagReader {

  /**
   * 🏷️ CORE METHOD: Buscar todas as tags de um contacto
   * 
   * @param email Email do contacto
   * @returns Informação completa sobre tags e produtos detectados
   */
  async getContactTags(email: string): Promise<ContactTagInfo | null> {
    try {
      console.log(`🔍 Buscando tags AC para: ${email}`)

      // 1. Buscar contacto no AC
      const acContact = await activeCampaignService.getContactByEmail(email)
      if (!acContact) {
        console.log(`⚠️ Contacto ${email} não existe no AC`)
        return null
      }

      // 2. Buscar todas as tags do contacto
      const contactTags = await this.getContactAllTags(acContact.contact.id)

      // 3. Analisar e categorizar tags
      const categorizedTags = await this.categorizeTags(contactTags)

      // 4. Detectar produtos baseado nas tags
      const detectedProducts = await this.inferProductsFromTags(categorizedTags)

      // 5. Buscar estado atual no BO
      const boState = await this.getBOState(email)

      // 6. Detectar inconsistências
      const inconsistencies = await this.detectInconsistencies(
        categorizedTags, 
        detectedProducts, 
        boState
      )

      // 7. Salvar estado no cache
      await this.saveACContactState({
        email,
        contactId: acContact.contact.id,
        tags: categorizedTags,
        detectedProducts,
        boState,
        lastSyncAt: new Date()
      })

      const result: ContactTagInfo = {
        contactId: acContact.contact.id,
        email,
        lastSyncAt: new Date(),
        tags: categorizedTags,
        detectedProducts,
        inconsistencies,
        boState
      }

      console.log(`✅ Tags AC carregadas: ${email} (${categorizedTags.length} tags, ${detectedProducts.length} produtos)`)
      return result

    } catch (error) {
      console.error(`❌ Erro ao buscar tags AC para ${email}:`, error)
      throw error
    }
  }

  /**
   * 🔍 Buscar todas as tags de um contacto (método helper)
   */
  private async getContactAllTags(contactId: string): Promise<any[]> {
    try {
      // Usar API AC para buscar contactTags
      const response = await activeCampaignService.retryRequest(async () => {
        return await (activeCampaignService as any).client.get('/api/3/contactTags', {
          params: {
            'filters[contact]': contactId,
            limit: 100 // Máximo permitido
          }
        })
      })

      const contactTags = response.data.contactTags || []
      
      // Buscar detalhes de cada tag
      const tagsWithDetails = []
      for (const contactTag of contactTags) {
        const tagDetails = await this.getTagDetails(contactTag.tag)
        if (tagDetails) {
          tagsWithDetails.push({
            id: contactTag.tag,
            contactTagId: contactTag.id,
            appliedAt: new Date(contactTag.cdate),
            ...tagDetails
          })
        }
      }

      return tagsWithDetails

    } catch (error) {
      console.error(`❌ Erro ao buscar todas as tags:`, error)
      return []
    }
  }

  /**
   * 🏷️ Buscar detalhes de uma tag específica
   */
  private async getTagDetails(tagId: string): Promise<any | null> {
    try {
      const response = await activeCampaignService.retryRequest(async () => {
        return await (activeCampaignService as any).client.get(`/api/3/tags/${tagId}`)
      })

      return {
        name: response.data.tag.tag,
        description: response.data.tag.description || null,
        tagType: response.data.tag.tagType || 'contact'
      }

    } catch (error) {
      console.error(`❌ Erro ao buscar tag ${tagId}:`, error)
      return null
    }
  }

  /**
   * 🏷️ Categorizar tags (sistema vs manual)
   */
  private async categorizeTags(tags: any[]): Promise<any[]> {
    const systemPrefixes = [
      'CLAREZA_', 'OGI_', 'BIBLIOTECA_', // Produtos conhecidos
      'ACTIVE', 'INACTIVE', 'ENGAGED', 'DISENGAGED' // Estados
    ]

    return tags.map(tag => ({
      ...tag,
      isSystemTag: systemPrefixes.some(prefix => 
        tag.name.toUpperCase().startsWith(prefix)
      ),
      source: this.inferTagSource(tag.name)
    }))
  }

  /**
   * 🧠 Inferir origem da tag
   */
  private inferTagSource(tagName: string): string {
    const upperTag = tagName.toUpperCase()

    // Tags do nosso sistema (padrões conhecidos)
    if (upperTag.match(/^(CLAREZA|OGI|BIBLIOTECA)_\d+D$/)) {
      return 'bo_system'
    }

    // Tags de automação AC (padrões comuns)
    if (upperTag.includes('AUTO_') || upperTag.includes('TRIGGER_')) {
      return 'ac_automation'
    }

    // Tags manuais (resto)
    return 'ac_manual'
  }

  /**
   * 🔎 Inferir produtos baseado nas tags
   */
  private async inferProductsFromTags(tags: any[]): Promise<any[]> {
    try {
      const productProfiles = await ProductProfile.find({ isActive: true })
      const detectedProducts = []

      for (const profile of productProfiles) {
        const productTags = tags.filter(tag => 
          tag.name.toUpperCase().startsWith(profile.code.toUpperCase())
        )

        if (productTags.length > 0) {
          const currentLevel = this.inferCurrentLevel(productTags, profile)
          const confidence = this.calculateConfidence(productTags, profile)
          
          detectedProducts.push({
            code: profile.code,
            name: profile.name,
            detectedFromTags: productTags.map((t: any) => t.name),
            currentLevel,
            confidence,
            isActive: productTags.some((t: any) => !t.name.includes('INACTIVE')),
            suggestedAction: this.suggestAction(productTags, profile, currentLevel)
          })
        }
      }

      return detectedProducts

    } catch (error) {
      console.error(`❌ Erro ao inferir produtos:`, error)
      return []
    }
  }

  /**
   * 📊 Inferir nível atual baseado nas tags
   */
  private inferCurrentLevel(productTags: any[], profile: any): number | null {
    // Procurar por padrões como CLAREZA_7D, OGI_21D, etc
    for (const tag of productTags) {
      const match = tag.name.match(new RegExp(`${profile.code}_(\d+)D`, 'i'))
      if (match) {
        const days = parseInt(match[1])
        // Mapear dias para nível
        const level = profile.reengagementLevels.find((l: any) => l.daysInactive === days)
        return level ? level.level : null
      }
    }

    // Se não encontrar padrão específico mas tem tags do produto
    return productTags.length > 0 ? 1 : null
  }

  /**
   * 📈 Calcular confiança da detecção
   */
  private calculateConfidence(productTags: any[], profile: any): number {
    let confidence = 0

    // Base: tem tags do produto (+30)
    if (productTags.length > 0) confidence += 30

    // Bonus: tags seguem padrão conhecido (+40)
    const hasKnownPattern = productTags.some((tag: any) => 
      tag.name.match(new RegExp(`${profile.code}_\\d+D`, 'i'))
    )
    if (hasKnownPattern) confidence += 40

    // Bonus: múltiplas tags do produto (+20)
    if (productTags.length > 1) confidence += 20

    // Bonus: tags recentes (+10)
    const hasRecentTag = productTags.some((tag: any) => {
      const daysSince = (Date.now() - tag.appliedAt.getTime()) / (1000 * 60 * 60 * 24)
      return daysSince <= 30
    })
    if (hasRecentTag) confidence += 10

    return Math.min(confidence, 100)
  }

  /**
   * 💡 Sugerir ação baseada na análise
   */
  private suggestAction(productTags: any[], profile: any, currentLevel: number | null): string {
    if (!currentLevel) {
      return "Verificar se utilizador deve ter tags deste produto"
    }

    if (currentLevel === 1) {
      return "Utilizador em nível inicial - monitorizar progresso"
    }

    if (currentLevel >= 3) {
      return "Utilizador em risco alto - considerar ações adicionais"
    }

    return "Estado normal - continuar monitorização"
  }

  /**
   * 🏠 Buscar estado atual no BO
   */
  private async getBOState(email: string): Promise<any | null> {
    try {
      const user = await User.findOne({ email }).lean()
      if (!user) return null

      // Buscar estados de engagement
      const engagementStates = await StudentEngagementState.find({ 
        userId: user._id 
      }).lean()

      return {
        userId: user._id.toString(),
        currentProducts: (user as any).courses || [],
        engagementStates: engagementStates.map((state: any) => ({
          productCode: state.productCode,
          currentLevel: state.currentLevel || 0,
          currentTagAC: state.currentTagAC || '',
          lastUpdate: state.updatedAt
        }))
      }

    } catch (error) {
      console.error(`❌ Erro ao buscar estado BO:`, error)
      return null
    }
  }

  /**
   * ⚠️ Detectar inconsistências BO vs AC
   */
  private async detectInconsistencies(
    acTags: any[], 
    detectedProducts: any[], 
    boState: any
  ): Promise<any[]> {
    const inconsistencies = []

    if (!boState) {
      inconsistencies.push({
        type: 'missing_in_bo',
        description: 'Contacto existe no AC mas não no BO',
        severity: 'medium',
        suggestedFix: 'Criar utilizador no BO ou remover tags AC'
      })
      return inconsistencies
    }

    // Verificar produtos detectados vs BO
    for (const detectedProduct of detectedProducts) {
      const boEngagement = boState.engagementStates.find(
        (e: any) => e.productCode === detectedProduct.code
      )

      if (!boEngagement) {
        inconsistencies.push({
          type: 'missing_in_bo',
          description: `Produto ${detectedProduct.code} detectado no AC mas sem estado no BO`,
          severity: 'high',
          suggestedFix: 'Criar StudentEngagementState no BO'
        })
        continue
      }

      // Verificar níveis
      if (detectedProduct.currentLevel && 
          detectedProduct.currentLevel !== boEngagement.currentLevel) {
        inconsistencies.push({
          type: 'level_mismatch',
          description: `Nível AC (${detectedProduct.currentLevel}) ≠ BO (${boEngagement.currentLevel})`,
          severity: 'medium',
          suggestedFix: 'Sincronizar níveis ou verificar lógica'
        })
      }

      // Verificar tags
      const expectedTag = boEngagement.currentTagAC
      const hasExpectedTag = acTags.some((tag: any) => tag.name === expectedTag)
      
      if (expectedTag && !hasExpectedTag) {
        inconsistencies.push({
          type: 'missing_in_ac',
          description: `Tag esperada "${expectedTag}" não encontrada no AC`,
          severity: 'low',
          suggestedFix: 'Re-aplicar tag ou atualizar BO'
        })
      }
    }

    // Verificar produtos no BO sem tags AC
    for (const boEngagement of boState.engagementStates) {
      const acProduct = detectedProducts.find((p: any) => p.code === boEngagement.productCode)
      
      if (!acProduct && boEngagement.currentTagAC) {
        inconsistencies.push({
          type: 'missing_in_ac',
          description: `Produto ${boEngagement.productCode} ativo no BO mas sem tags AC`,
          severity: 'medium',
          suggestedFix: 'Aplicar tags AC ou limpar estado BO'
        })
      }
    }

    return inconsistencies
  }

  /**
   * 💾 Salvar estado no cache local
   */
  private async saveACContactState(data: any): Promise<void> {
    try {
      await ACContactState.findOneAndUpdate(
        { email: data.email },
        {
          ...data,
          lastSyncAt: new Date()
        },
        { 
          upsert: true,
          new: true
        }
      )
    } catch (error) {
      console.error(`❌ Erro ao salvar estado AC:`, error)
    }
  }

  /**
   * 🔄 Sincronizar tags de um utilizador AC → BO
   */
  async syncUserTagsFromAC(email: string): Promise<SyncResult> {
    try {
      console.log(`🔄 Sincronizando tags AC → BO: ${email}`)

      const contactInfo = await this.getContactTags(email)
      if (!contactInfo) {
        return {
          email,
          success: false,
          action: 'error',
          changesCount: 0,
          conflictsCount: 0,
          errors: ['Contacto não encontrado no AC']
        }
      }

      let changesCount = 0
      let conflictsCount = contactInfo.inconsistencies.length
      const metadata = {
        tagsAdded: [],
        tagsRemoved: [],
        productsDetected: contactInfo.detectedProducts.map((p: any) => p.code),
        inconsistenciesFound: conflictsCount
      }

      // Aplicar mudanças se não houver conflitos críticos
      if (conflictsCount === 0 || 
          !contactInfo.inconsistencies.some((i: any) => i.severity === 'high')) {
        
        // Atualizar StudentEngagementState baseado no AC
        for (const product of contactInfo.detectedProducts) {
          if (product.confidence >= 70) { // Só produtos com alta confiança
            await this.updateEngagementStateFromAC(
              contactInfo.boState?.userId, 
              product
            )
            changesCount++
          }
        }
      }

      const result: SyncResult = {
        email,
        success: true,
        action: changesCount > 0 ? 'synced' : 'no_changes',
        changesCount,
        conflictsCount,
        metadata
      }

      console.log(`✅ Sync completo: ${email} (${changesCount} mudanças, ${conflictsCount} conflitos)`)
      return result

    } catch (error: any) {
      console.error(`❌ Erro sync AC → BO para ${email}:`, error)
      return {
        email,
        success: false,
        action: 'error',
        changesCount: 0,
        conflictsCount: 0,
        errors: [error.message]
      }
    }
  }

  /**
   * ⚡ Atualizar StudentEngagementState baseado em dados AC
   */
  private async updateEngagementStateFromAC(
    userId: string | undefined, 
    detectedProduct: any
  ): Promise<void> {
    if (!userId || !detectedProduct.currentLevel) return

    try {
      await StudentEngagementState.findOneAndUpdate(
        { userId, productCode: detectedProduct.code },
        {
          $set: {
            currentLevel: detectedProduct.currentLevel,
            currentTagAC: detectedProduct.detectedFromTags[0] || '',
            lastSyncFromAC: new Date(),
            syncSource: 'ac_reader'
          }
        },
        { upsert: true }
      )

      console.log(`✅ Estado atualizado AC → BO: ${detectedProduct.code} nível ${detectedProduct.currentLevel}`)

    } catch (error) {
      console.error(`❌ Erro ao atualizar estado:`, error)
    }
  }

  /**
   * 📊 Buscar múltiplos contactos (batch)
   */
  async getMultipleContactTags(emails: string[]): Promise<ContactTagInfo[]> {
    console.log(`🔍 Buscando tags AC para ${emails.length} contactos...`)

    const results = []
    const batchSize = 10 // Processar em lotes para não sobrecarregar

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize)
      
      const batchPromises = batch.map(email => 
        this.getContactTags(email).catch(error => {
          console.error(`❌ Erro para ${email}:`, error)
          return null
        })
      )

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults.filter(r => r !== null))

      // Pequeno delay entre batches
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`✅ Processados ${results.length}/${emails.length} contactos`)
    return results as ContactTagInfo[]
  }

  /**
   * 🔄 Sync múltiplos utilizadores AC → BO
   */
  async syncMultipleUsersFromAC(emails: string[]): Promise<SyncResult[]> {
    console.log(`🔄 Sync múltiplo AC → BO: ${emails.length} utilizadores`)

    const results = []
    
    for (const email of emails) {
      const result = await this.syncUserTagsFromAC(email)
      results.push(result)
      
      // Pequeno delay entre syncs
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const summary = {
      total: results.length,
      synced: results.filter(r => r.action === 'synced').length,
      noChanges: results.filter(r => r.action === 'no_changes').length,
      errors: results.filter(r => r.action === 'error').length,
      conflicts: results.reduce((sum, r) => sum + r.conflictsCount, 0)
    }

    console.log(`✅ Sync múltiplo completo:`, summary)
    return results
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export default new ContactTagReader()

