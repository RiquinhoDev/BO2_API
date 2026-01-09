// ✅ SPRINT 5 - Task 5.1.1: Contact Tag Reader Service
// Objetivo: Ler tags do Active Campaign e sincronizar com Backoffice

import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'
import User from '../../models/user'
import type { ACContactResponse } from '../../types/activecampaign.types'
import activeCampaignService from './activeCampaignService'

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

type ACContactTagLite = {
  id: string
  tag: string
  cdate?: string
  seriesid?: string | null
}

type ProductProfileLite = {
  code: string
  name: string
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

      // 1. Buscar contacto no AC (getContactByEmail devolve ACContactResponse)
      const contactResp: ACContactResponse | null = await activeCampaignService.getContactByEmail(email)

      if (!contactResp?.contact) {
        console.log(`[ContactTagReader] Contacto não encontrado: ${email}`)
        return null
      }

      const contact = contactResp.contact

      // 2. Buscar tags do contacto
      const contactTags = (await activeCampaignService.getContactTags(contact.id)) as ACContactTagLite[]

      // 3. Inferir produtos baseado nas tags
      const products = await this.inferProductsFromTags(contactTags)

      return {
        contactId: contact.id,
        email: contact.email,
        tags: contactTags.map((tag) => ({
          id: tag.id,
          name: tag.tag,
          appliedAt: tag.cdate ? new Date(tag.cdate) : new Date(),
          appliedBy: tag.seriesid ? 'system' : 'manual' // Se tem automation = system
        })),
        products
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error(`[ContactTagReader] Erro ao buscar tags: ${message}`)
      throw error
    }
  }

  /**
   * 🔍 Inferir produtos baseado nas tags do AC
   */
  private async inferProductsFromTags(tags: ACContactTagLite[]): Promise<ContactTagInfo['products']> {
    const products: ContactTagInfo['products'] = []

    // Buscar todos os product profiles ativos
    const productProfiles = await Product.find({ isActive: true })
      .select('code name')
      .lean<ProductProfileLite[]>()

for (const profile of productProfiles) {
  const code = profile.code.toUpperCase()

  const productTags = tags.filter(t => {
    const tag = String(t.tag || '').toUpperCase()
    return tag.startsWith(`${code} -`) || tag.startsWith(`${code}_`) || tag.startsWith(code)
  })
      if (productTags.length > 0) {
        const detectedFromTags = productTags.map((t) => t.tag)
        const currentLevel = this.getCurrentLevel(detectedFromTags)

        products.push({
          code: profile.code,
          name: profile.name,
          detectedFromTags,
          currentLevel,
          isActive: detectedFromTags.some((t) => t.includes('_ACTIVE') || t.includes('_ATIVO'))
        })
      }
    }

    console.log(`[ContactTagReader] Produtos detectados: ${products.length}`)
    return products
  }

  /**
   * 📊 Determinar nível atual baseado nas tags
   * (ex: "OGI_INATIVO_14D" -> 14)
   */
private getCurrentLevel(tagNames: string[]): number {
  const levels = tagNames
    .map((name) => {
      const n = String(name)

      // "Inativo 7d" / "INATIVO 14D"
      const m1 = n.match(/(\d+)\s*d\b/i)
      if (m1?.[1]) return parseInt(m1[1], 10)

      // fallback antigo "_14D"
      const m2 = n.match(/_(\d+)D\b/i)
      if (m2?.[1]) return parseInt(m2[1], 10)

      return 0
    })
    .filter((n) => n > 0)

  return levels.length ? Math.max(...levels) : 0
}

  /**
   * 🔄 Sincronizar tags AC → BO para um utilizador específico
   * @param userId ID do utilizador no BO
   */
  async syncUserTagsFromAC(userId: string): Promise<SyncResult> {
    try {
      console.log(`[ContactTagReader] Sincronizando tags para userId: ${userId}`)

      // 1. Buscar user no BO
      const user = await User.findById(userId)
      if (!user?.email) {
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
        const updated = await this.updateEngagementStateFromAC(userId, product)

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error(`[ContactTagReader] Erro ao sincronizar: ${message}`)
      return { synced: false, reason: message }
    }
  }

  /**
   * 📝 Atualizar UserProduct.activeCampaignData baseado em tags do AC
   */
  private async updateEngagementStateFromAC(
    userId: string,
    productInfo: ContactTagInfo['products'][number]
  ): Promise<boolean> {
    try {
      const product = await Product.findOne({ code: productInfo.code })
      if (!product?._id) {
        console.log(`[ContactTagReader] Produto ${productInfo.code} não encontrado no BO`)
        return false
      }

      const userProduct = await UserProduct.findOne({
        userId,
        productId: product._id
      })

      if (!userProduct?._id) {
        console.log(
          `[ContactTagReader] UserProduct não encontrado para userId=${userId}, productId=${product._id.toString()}`
        )
        return false
      }

      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          'activeCampaignData.tags': productInfo.detectedFromTags,
          'activeCampaignData.lastSyncFromAC': new Date()
        }
      })

      console.log(`[ContactTagReader] ✅ UserProduct ${userProduct._id.toString()} atualizado com tags do AC`)
      return true
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error(`[ContactTagReader] Erro ao atualizar engagement state: ${message}`)
      return false
    }
  }

  /**
   * 🔄 Sincronizar TODOS os users (batch)
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
      const userId = user?._id?.toString?.() || ''
      if (!userId) continue

      try {
        const result = await this.syncUserTagsFromAC(userId)
        if (result.synced) {
          results.synced++
        } else {
          results.failed++
          results.errors.push({ userId, reason: result.reason })
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        results.failed++
        results.errors.push({ userId, error: message })
      }
    }

    console.log(`[ContactTagReader] ✅ Batch sync completo: ${results.synced}/${results.total} sucesso`)
    return results
  }
}

export default new ContactTagReaderService()
