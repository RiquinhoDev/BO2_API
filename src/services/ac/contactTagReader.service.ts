// ✅ SPRINT 5 - Task 5.1.1: Contact Tag Reader Service
// Objetivo: Ler tags do Active Campaign e sincronizar com Backoffice
import activeCampaignService from '../activeCampaignService'
import UserProduct from '../../models/UserProduct'
import Product from '../../models/Product'
import User from '../../models/user'

// ═══════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════

export interface ContactTagInfo {
  contactId: string
  email: string
  tags: Array<{
    id: string
    name: string
    appliedAt: Date
    appliedBy: 'system' | 'manual'
  }>
  products: Array<{
    code: string
    name: string
    detectedFromTags: string[]
    currentLevel: number
    isActive: boolean
  }>
}

export interface SyncResult {
  synced: boolean
  reason?: string
  productsUpdated?: number
  tagsAdded?: string[]
  tagsRemoved?: string[]
}

export interface SyncSummary {
  total: number
  synced: number
  failed: number
  errors: Array<{ userId: string; reason?: string; error?: string }>
}

// ═══════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════

class ContactTagReaderService {
  
  /**
   * 🏷️ Buscar todas as tags de um contacto no AC
   * @param email Email do contacto
   * @returns Informação completa do contacto com tags e produtos inferidos
   */
  async getContactTags(email: string): Promise<ContactTagInfo | null> {
    try {
      console.log(`[ContactTagReader] Buscando tags para: ${email}`)
      
      // 1. Buscar contacto no AC
      const contact = await activeCampaignService.getContactByEmail(email)
      if (!contact) {
        console.log(`[ContactTagReader] Contacto não encontrado: ${email}`)
        return null
      }

      // 2. Buscar tags do contacto
      const contactTags = await activeCampaignService.getContactTags(contact.id)
      
      // 3. Inferir produtos baseado nas tags
      const products = await this.inferProductsFromTags(contactTags)
      
      return {
        contactId: contact.id,
        email: contact.email,
        tags: contactTags.map(tag => ({
          id: tag.id,
          name: tag.tag,
          appliedAt: tag.cdate ? new Date(tag.cdate) : new Date(),
          appliedBy: tag.seriesid ? 'system' : 'manual' // Se tem automation = system
        })),
        products
      }
    } catch (error: any) {
      console.error(`[ContactTagReader] Erro ao buscar tags: ${error.message}`)
      throw error
    }
  }

  /**
   * 🔍 Inferir produtos baseado nas tags do AC
   * @param tags Array de tags do Active Campaign
   * @returns Array de produtos detectados
   */
  private async inferProductsFromTags(tags: any[]): Promise<any[]> {
    const products = []
    
    // Buscar todos os product profiles ativos
    const productProfiles = await Product.find({ isActive: true })
    
    for (const profile of productProfiles) {
      // Filtrar tags que começam com o código do produto
      const productTags = tags.filter(tag => 
        tag.tag && tag.tag.startsWith(profile.code + '_')
      )
      
      if (productTags.length > 0) {
        const currentLevel = this.getCurrentLevel(productTags, profile)
        
        products.push({
          code: profile.code,
          name: profile.name,
          detectedFromTags: productTags.map(t => t.tag),
          currentLevel,
          isActive: productTags.some(t => t.tag.includes('_ACTIVE') || t.tag.includes('_ATIVO'))
        })
      }
    }
    
    console.log(`[ContactTagReader] Produtos detectados: ${products.length}`)
    return products
  }

  /**
   * 📊 Determinar nível atual baseado nas tags
   * @param tags Tags relacionadas com o produto
   * @param profile Perfil do produto
   * @returns Nível atual (dias de inatividade ou outro métrico)
   */
  private getCurrentLevel(tags: any[], profile: any): number {
    // Extrair números das tags (ex: "OGI_INATIVO_14D" -> 14)
    const levels = tags
      .map(t => {
        const match = t.tag.match(/_(\d+)D/)
        return match ? parseInt(match[1]) : 0
      })
      .filter(n => n > 0)
    
    // Retornar o nível mais alto
    return levels.length > 0 ? Math.max(...levels) : 0
  }

  /**
   * 🔄 Sincronizar tags AC → BO para um utilizador específico
   * @param userId ID do utilizador no BO
   * @returns Resultado da sincronização
   */
  async syncUserTagsFromAC(userId: string): Promise<SyncResult> {
    try {
      console.log(`[ContactTagReader] Sincronizando tags para userId: ${userId}`)
      
      // 1. Buscar user no BO
      const user = await User.findById(userId)
      if (!user) {
        return { synced: false, reason: 'User not found in BO' }
      }

      // 2. Buscar tags no AC
      const acTags = await this.getContactTags(user.email)
      if (!acTags) {
        return { synced: false, reason: 'Contact not found in AC' }
      }

      let productsUpdated = 0
      const tagsAdded: string[] = []
      const tagsRemoved: string[] = []

      // 3. Para cada produto detectado no AC, atualizar BO
      for (const product of acTags.products) {
        const updated = await this.updateEngagementStateFromAC(
          userId, 
          product,
          acTags.tags
        )
        
        if (updated) {
          productsUpdated++
          tagsAdded.push(...product.detectedFromTags)
        }
      }

      console.log(`[ContactTagReader] ✅ Sincronização completa: ${productsUpdated} produtos atualizados`)
      
      return {
        synced: true,
        productsUpdated,
        tagsAdded,
        tagsRemoved
      }
    } catch (error: any) {
      console.error(`[ContactTagReader] Erro ao sincronizar: ${error.message}`)
      return { synced: false, reason: error.message }
    }
  }

  /**
   * 📝 Atualizar StudentEngagementState baseado em tags do AC
   * @param userId ID do utilizador
   * @param productInfo Informação do produto detectado
   * @param allTags Todas as tags do contacto
   * @returns True se atualizado com sucesso
   */
  private async updateEngagementStateFromAC(
    userId: string,
    productInfo: any,
    allTags: any[]
  ): Promise<boolean> {
    try {
      // Buscar produto no BO
      const product = await Product.findOne({ code: productInfo.code })
      if (!product) {
        console.log(`[ContactTagReader] Produto ${productInfo.code} não encontrado no BO`)
        return false
      }

      // Buscar UserProduct
      const userProduct = await UserProduct.findOne({
        userId,
        productId: product._id
      })
      
      if (!userProduct) {
        console.log(`[ContactTagReader] UserProduct não encontrado para userId=${userId}, productId=${product._id}`)
        return false
      }

      // Atualizar tags no UserProduct
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          'activeCampaignData.tags': productInfo.detectedFromTags,
          'activeCampaignData.lastSyncFromAC': new Date()
        }
      })

      console.log(`[ContactTagReader] ✅ UserProduct ${userProduct._id} atualizado com tags do AC`)
      return true
    } catch (error: any) {
      console.error(`[ContactTagReader] Erro ao atualizar engagement state: ${error.message}`)
      return false
    }
  }

  /**
   * 🔄 Sincronizar TODOS os users (batch)
   * @param limit Número máximo de users a sincronizar
   * @returns Sumário da sincronização
   */
  async syncAllUsersFromAC(limit: number = 100): Promise<SyncSummary> {
    console.log(`[ContactTagReader] Iniciando sync batch de ${limit} users...`)
    
    const users = await User.find({}).limit(limit)
    
    const results: SyncSummary = {
      total: users.length,
      synced: 0,
      failed: 0,
      errors: []
    }

    for (const user of users) {
      try {
        const result = await this.syncUserTagsFromAC(user._id.toString())
        if (result.synced) {
          results.synced++
        } else {
          results.failed++
          results.errors.push({ userId: user._id.toString(), reason: result.reason })
        }
      } catch (error: any) {
        results.failed++
        results.errors.push({ userId: user._id.toString(), error: error.message })
      }
    }

    console.log(`[ContactTagReader] ✅ Batch sync completo: ${results.synced}/${results.total} sucesso`)
    return results
  }
}

// ═══════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════

export default new ContactTagReaderService()
