// ════════════════════════════════════════════════════════════
// 📁 src/services/tagRuleEngineV2.ts
// 🎯 SPRINT 5.2 - Tag Rule Engine V2 (Avalia UserProducts)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import TagRule, { ITagRule } from '../models/TagRule'
import { UserProduct } from '../models/UserProduct'
import { Product } from '../models/Product'
import User from '../models/user'
import CommunicationHistory from '../models/CommunicationHistory'
import activeCampaignService from './activeCampaignService'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

interface ExecutionSummary {
  rulesExecuted: number
  usersAffected: number
  executionTime: number
  errors: Array<{ ruleId: string; error: string }>
}

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL V2
// ─────────────────────────────────────────────────────────────

class TagRuleEngineV2 {
  
  /**
   * 🎯 CORE: Executa todas as regras ativas
   * AVALIA UserProducts, não Users globais
   */
  async executeAllRules(): Promise<ExecutionSummary> {
    const startTime = Date.now()
    let totalUsersAffected = 0
    const errors: Array<{ ruleId: string; error: string }> = []
    
    try {
      // Buscar todas as regras ativas ordenadas por prioridade
      const rules = await TagRule.find({ isActive: true })
        .sort({ priority: -1 })
        .lean()
      
      console.log(`[TagRuleEngineV2] 🚀 Encontradas ${rules.length} regras ativas`)
      
      for (const rule of rules) {
        try {
          // Verificar cooldown da regra
          if (!this.canRuleExecute(rule)) {
            console.log(`[TagRuleEngineV2] ⏰ Regra "${rule.name}" em cooldown. Skip.`)
            continue
          }
          
          // Executar regra POR PRODUTO
          const usersAffected = await this.executeRuleForProduct(rule)
          totalUsersAffected += usersAffected
          
          // Atualizar stats da regra
          await TagRule.findByIdAndUpdate(rule._id, {
            $set: {
              lastExecutedAt: new Date(),
              'executionStats.lastRunUsersAffected': usersAffected
            },
            $inc: {
              'executionStats.totalRuns': 1,
              'executionStats.totalUsersAffected': usersAffected
            }
          })
          
          console.log(`[TagRuleEngineV2] ✅ Regra "${rule.name}": ${usersAffected} users afetados`)
          
        } catch (error: any) {
          console.error(`[TagRuleEngineV2] ❌ Erro na regra "${rule.name}":`, error)
          errors.push({
            ruleId: rule._id.toString(),
            error: error.message
          })
        }
      }
      
      const executionTime = Date.now() - startTime
      
      console.log(`[TagRuleEngineV2] 🎉 Execução completa: ${rules.length} regras, ${totalUsersAffected} users afetados, ${executionTime}ms`)
      
      return {
        rulesExecuted: rules.length,
        usersAffected: totalUsersAffected,
        executionTime,
        errors
      }
      
    } catch (error: any) {
      console.error('[TagRuleEngineV2] ❌ Erro fatal na execução:', error)
      throw error
    }
  }
  
  /**
   * 🎯 Executa uma regra específica para um produto
   * CORE DA ESCALABILIDADE: Avalia UserProducts, não Users
   */
  private async executeRuleForProduct(rule: ITagRule): Promise<number> {
    try {
      console.log(`[TagRuleEngineV2] 📋 Executando regra "${rule.name}" para courseId ${rule.courseId}`)
      
      // 1️⃣ Buscar produto pelo courseId (que é o code do produto)
      const product = await Product.findOne({ code: rule.courseId })
      
      if (!product) {
        console.warn(`[TagRuleEngineV2] ⚠️ Produto não encontrado: ${rule.courseId}`)
        return 0
      }
      
      // 2️⃣ Buscar todos os UserProducts deste produto
      const userProducts = await UserProduct.find({ productId: product._id })
        .populate('userId', 'email name')
        .lean()
      
      console.log(`[TagRuleEngineV2] 🔍 Encontrados ${userProducts.length} UserProducts para avaliar`)
      
      let usersAffected = 0
      
      // 3️⃣ Avaliar CADA UserProduct individualmente
      for (const userProduct of userProducts) {
        try {
          const shouldApplyTag = this.evaluateConditions(rule.conditions, userProduct)
          
          if (shouldApplyTag) {
            // Verificar cooldown do user neste produto
            if (!this.canSendToUserProduct(userProduct, rule.cooldownHours)) {
              console.log(`[TagRuleEngineV2] ⏰ UserProduct ${userProduct._id} em cooldown. Skip.`)
              continue
            }
            
            // Aplicar ações (add/remove tags)
            await this.applyActionsToUserProduct(
              userProduct,
              rule.actions,
              rule._id as mongoose.Types.ObjectId
            )
            
            usersAffected++
          }
        } catch (error: any) {
          console.error(`[TagRuleEngineV2] ❌ Erro ao processar UserProduct ${userProduct._id}:`, error)
        }
      }
      
      console.log(`[TagRuleEngineV2] ✅ Regra "${rule.name}": ${usersAffected}/${userProducts.length} UserProducts afetados`)
      
      return usersAffected
      
    } catch (error: any) {
      console.error(`[TagRuleEngineV2] ❌ Erro ao executar regra "${rule.name}":`, error)
      return 0
    }
  }
  
  /**
   * 🔍 Avalia condições da regra contra um UserProduct
   * Todas as condições devem ser verdadeiras (AND)
   */
  private evaluateConditions(conditions: any[], userProduct: any): boolean {
    for (const condition of conditions) {
      const fieldValue = this.getNestedValue(userProduct, condition.field)
      
      if (!this.compareValues(fieldValue, condition.operator, condition.value)) {
        return false // Todas as condições devem ser verdadeiras (AND)
      }
    }
    
    return true
  }
  
  /**
   * 🔍 Extrai valor nested de um objeto (ex: "progress.progressPercentage")
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }
  
  /**
   * 🔍 Compara valores baseado no operador
   */
  private compareValues(fieldValue: any, operator: string, ruleValue: any): boolean {
    // Converter datas se necessário
    if (ruleValue instanceof Date || typeof ruleValue === 'string') {
      if (fieldValue instanceof Date || typeof fieldValue === 'string') {
        const fieldDate = new Date(fieldValue)
        const ruleDate = new Date(ruleValue)
        
        switch (operator) {
          case 'lt': return fieldDate < ruleDate
          case 'lte': return fieldDate <= ruleDate
          case 'gt': return fieldDate > ruleDate
          case 'gte': return fieldDate >= ruleDate
          case 'eq': return fieldDate.getTime() === ruleDate.getTime()
          case 'ne': return fieldDate.getTime() !== ruleDate.getTime()
          default: return false
        }
      }
    }
    
    // Comparação numérica/string
    switch (operator) {
      case 'lt': return fieldValue < ruleValue
      case 'lte': return fieldValue <= ruleValue
      case 'gt': return fieldValue > ruleValue
      case 'gte': return fieldValue >= ruleValue
      case 'eq': return fieldValue === ruleValue
      case 'ne': return fieldValue !== ruleValue
      default:
        console.warn(`[TagRuleEngineV2] ⚠️ Operador desconhecido: ${operator}`)
        return false
    }
  }
  
  /**
   * 🏷️ Aplica ações (add/remove tags) a um UserProduct específico
   */
  private async applyActionsToUserProduct(
    userProduct: any,
    actions: any[],
    tagRuleId: mongoose.Types.ObjectId
  ): Promise<void> {
    const user = userProduct.userId
    
    if (!user || !user.email) {
      console.warn(`[TagRuleEngineV2] ⚠️ User inválido no UserProduct ${userProduct._id}`)
      return
    }
    
    // Buscar/criar contato no AC
    const acContact = await activeCampaignService.findOrCreateContact(user.email)
    
    for (const action of actions) {
      try {
        if (action.type === 'add') {
          // Adicionar tag no AC
          await activeCampaignService.addTag(acContact.id, action.tagName)
          
          // Registar no UserProduct
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $addToSet: { 'activeCampaignData.tags': action.tagName },
            $set: { 
              'activeCampaignData.contactId': acContact.id,
              'activeCampaignData.lastSyncAt': new Date()
            }
          })
          
          // Registar em CommunicationHistory
          await CommunicationHistory.create({
            userId: user._id,
            tagRuleId,
            courseId: userProduct.productId.toString(),
            tagApplied: action.tagName,
            tagId: action.tagId,
            contactId: acContact.id.toString(),
            status: 'sent',
            sentAt: new Date(),
            openCount: 0,
            clickCount: 0
          })
          
          console.log(`[TagRuleEngineV2] ✅ Tag "${action.tagName}" adicionada ao UserProduct ${userProduct._id}`)
          
        } else if (action.type === 'remove') {
          // Remover tag no AC
          await activeCampaignService.removeTag(acContact.id, action.tagName)
          
          // Remover do UserProduct
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $pull: { 'activeCampaignData.tags': action.tagName },
            $set: { 'activeCampaignData.lastSyncAt': new Date() }
          })
          
          console.log(`[TagRuleEngineV2] ✅ Tag "${action.tagName}" removida do UserProduct ${userProduct._id}`)
        }
        
      } catch (error: any) {
        console.error(`[TagRuleEngineV2] ❌ Erro ao aplicar ação ${action.type} tag "${action.tagName}":`, error)
      }
    }
  }
  
  /**
   * ⏰ Verifica se a regra pode executar (cooldown)
   */
  private canRuleExecute(rule: ITagRule): boolean {
    if (!rule.lastExecutedAt) return true
    
    const hoursSinceLastRun = 
      (Date.now() - new Date(rule.lastExecutedAt).getTime()) / (1000 * 60 * 60)
    
    return hoursSinceLastRun >= rule.cooldownHours
  }
  
  /**
   * ⏰ Verifica se pode enviar email a um UserProduct (cooldown)
   */
  private canSendToUserProduct(userProduct: any, cooldownHours: number): boolean {
    const lastSyncAt = userProduct.activeCampaignData?.lastSyncAt
    
    if (!lastSyncAt) return true
    
    const hoursSinceLastSync = 
      (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60)
    
    return hoursSinceLastSync >= cooldownHours
  }
  
  /**
   * 🎯 Executa regra manualmente (on-demand)
   */
  async executeRuleManually(ruleId: string): Promise<{
    success: boolean
    usersAffected: number
    error?: string
  }> {
    try {
      const rule = await TagRule.findById(ruleId)
      
      if (!rule) {
        return { success: false, usersAffected: 0, error: 'Regra não encontrada' }
      }
      
      const usersAffected = await this.executeRuleForProduct(rule)
      
      // Atualizar stats
      await TagRule.findByIdAndUpdate(ruleId, {
        $set: {
          lastExecutedAt: new Date(),
          'executionStats.lastRunUsersAffected': usersAffected
        },
        $inc: {
          'executionStats.totalRuns': 1,
          'executionStats.totalUsersAffected': usersAffected
        }
      })
      
      return { success: true, usersAffected }
      
    } catch (error: any) {
      console.error('[TagRuleEngineV2] ❌ Erro na execução manual:', error)
      return { success: false, usersAffected: 0, error: error.message }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export default new TagRuleEngineV2()

