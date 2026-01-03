// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilziadoresServices/tagRulesExecution.service.ts
// Service: Tag Rules Execution para CRON Jobs
// Executa tag rules associadas a jobs CRON após sync
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import TagRule from '../../models/acTags/TagRule'
import { ICronJobConfig } from '../../models/SyncModels/CronJobConfig'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import UserAction from '../../models/UserAction'
import activeCampaignService from '../ac/activeCampaignService'



// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface RuleExecutionResult {
  ruleId: string
  ruleName: string
  status: 'success' | 'error' | 'skipped'
  studentsEvaluated: number
  studentsMatched: number
  tagsApplied: number
  duration: number
  errorMessage?: string
}

interface ExecutionSummary {
  success: boolean
  totalRules: number
  rulesExecuted: number
  rulesFailed: number
  rulesSkipped: number
  totalStudentsEvaluated: number
  totalTagsApplied: number
  duration: number
  results: RuleExecutionResult[]
  errorMessage?: string
}

// ─────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────

class TagRulesExecutionService {
  
  /**
   * Executar Tag Rules associadas a um job
   */
  async executeRulesForJob(job: ICronJobConfig): Promise<ExecutionSummary> {
    const startTime = Date.now()
    
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`🏷️ EXECUTANDO TAG RULES PARA JOB: ${job.name}`)
    console.log(`${'═'.repeat(70)}`)

    try {
      // Verificar se execução de regras está habilitada
      if (!job.tagRuleOptions?.enabled) {
        console.log(`⏭️  Tag Rules desabilitadas para este job`)
        return this.createSkippedSummary('Tag Rules desabilitadas')
      }

      // Buscar regras selecionadas
      const rules = await this.getRulesToExecute(job)
      
      if (rules.length === 0) {
        console.log(`⏭️  Nenhuma regra selecionada para executar`)
        return this.createSkippedSummary('Nenhuma regra selecionada')
      }

      console.log(`📋 ${rules.length} regras a executar`)

      // Executar regras
      const results: RuleExecutionResult[] = []
      let totalStudentsEvaluated = 0
      let totalTagsApplied = 0

      for (const rule of rules) {
        const result = await this.executeRule(rule, job)
        results.push(result)
        
        totalStudentsEvaluated += result.studentsEvaluated
        totalTagsApplied += result.tagsApplied

        // Parar se configurado e houver erro
        if (job.tagRuleOptions.stopOnError && result.status === 'error') {
          console.log(`⚠️  Parando execução devido a erro (stopOnError=true)`)
          break
        }
      }

      // Calcular estatísticas
      const rulesExecuted = results.filter(r => r.status === 'success').length
      const rulesFailed = results.filter(r => r.status === 'error').length
      const rulesSkipped = results.filter(r => r.status === 'skipped').length

      const duration = Date.now() - startTime

      console.log(`\n${'─'.repeat(70)}`)
      console.log(`✅ TAG RULES EXECUTADAS`)
      console.log(`${'─'.repeat(70)}`)
      console.log(`   Total de regras: ${rules.length}`)
      console.log(`   Executadas com sucesso: ${rulesExecuted}`)
      console.log(`   Falhadas: ${rulesFailed}`)
      console.log(`   Alunos avaliados: ${totalStudentsEvaluated}`)
      console.log(`   Tags aplicadas: ${totalTagsApplied}`)
      console.log(`   Tempo total: ${(duration / 1000).toFixed(2)}s`)
      console.log(`${'═'.repeat(70)}\n`)

      return {
        success: rulesFailed === 0,
        totalRules: rules.length,
        rulesExecuted,
        rulesFailed,
        rulesSkipped,
        totalStudentsEvaluated,
        totalTagsApplied,
        duration,
        results
      }

    } catch (error: any) {
      const duration = Date.now() - startTime
      
      console.error(`\n${'═'.repeat(70)}`)
      console.error(`❌ ERRO AO EXECUTAR TAG RULES`)
      console.error(`${'═'.repeat(70)}`)
      console.error(error)
      console.error(`${'═'.repeat(70)}\n`)

      return {
        success: false,
        totalRules: 0,
        rulesExecuted: 0,
        rulesFailed: 0,
        rulesSkipped: 0,
        totalStudentsEvaluated: 0,
        totalTagsApplied: 0,
        duration,
        results: [],
        errorMessage: error.message
      }
    }
  }

  /**
   * Buscar regras a executar
   */
  private async getRulesToExecute(job: ICronJobConfig) {
    if (job.tagRuleOptions.executeAllRules) {
      // Buscar todas as regras da plataforma
      return await this.getAllRulesForPlatform(job.syncType)
    } else {
      // Buscar apenas regras selecionadas
      if (job.tagRules.length === 0) {
        return []
      }
      
      return await TagRule.find({
        _id: { $in: job.tagRules },
        isActive: true
      }).populate('product')
    }
  }

  /**
   * Buscar todas as regras de uma plataforma
   */
  private async getAllRulesForPlatform(syncType: string) {
    if (syncType === 'all') {
      // Todas as regras ativas
      return await TagRule.find({ isActive: true }).populate('product')
    }

    // Buscar produtos da plataforma
    const products = await Product.find({ platform: syncType })
    const productIds = products.map(p => p._id)

    // Buscar regras desses produtos
    return await TagRule.find({
      product: { $in: productIds },
      isActive: true
    }).populate('product')
  }

  /**
   * Executar uma regra específica
   */
  private async executeRule(
    rule: any,
    job: ICronJobConfig
  ): Promise<RuleExecutionResult> {
    const startTime = Date.now()

    console.log(`\n📏 Executando regra: ${rule.name}`)

    try {
      // Buscar alunos elegíveis
      const eligibleStudents = await this.getEligibleStudents(rule)
      
      console.log(`   👥 ${eligibleStudents.length} alunos elegíveis`)

      if (eligibleStudents.length === 0) {
        return {
          ruleId: rule._id.toString(),
          ruleName: rule.name,
          status: 'skipped',
          studentsEvaluated: 0,
          studentsMatched: 0,
          tagsApplied: 0,
          duration: Date.now() - startTime
        }
      }

      // Aplicar tags no Active Campaign
      let tagsApplied = 0

      for (const student of eligibleStudents) {
        try {
          await activeCampaignService.addTag(
            student.email,
            rule.tagName
          )
          tagsApplied++
        } catch (error) {
          console.error(`   ⚠️  Erro ao aplicar tag para ${student.email}:`, error)
        }
      }

      const duration = Date.now() - startTime

      console.log(`   ✅ ${tagsApplied} tags aplicadas em ${(duration / 1000).toFixed(2)}s`)

      return {
        ruleId: rule._id.toString(),
        ruleName: rule.name,
        status: 'success',
        studentsEvaluated: eligibleStudents.length,
        studentsMatched: eligibleStudents.length,
        tagsApplied,
        duration
      }

    } catch (error: any) {
      const duration = Date.now() - startTime

      console.error(`   ❌ Erro: ${error.message}`)

      return {
        ruleId: rule._id.toString(),
        ruleName: rule.name,
        status: 'error',
        studentsEvaluated: 0,
        studentsMatched: 0,
        tagsApplied: 0,
        duration,
        errorMessage: error.message
      }
    }
  }

  /**
   * Buscar alunos elegíveis para uma regra
   */
  private async getEligibleStudents(rule: any) {
    // Este é o mesmo código do evaluateRules.job.ts
    // Reutilizar a lógica de avaliação de regras
    
    const query: any = { product: rule.product._id }

    // Avaliar condições da regra
    for (const condition of rule.conditions) {
      switch (condition.field) {
        case 'daysSinceLastAction':
          if (condition.operator === 'greaterThan') {
            const daysAgo = new Date()
            daysAgo.setDate(daysAgo.getDate() - condition.value)
            
            const recentActions = await UserAction.find({
              userProduct: { $exists: true },
              createdAt: { $gte: daysAgo }
            }).distinct('userProduct')
            
            query._id = { $nin: recentActions }
          }
          break

        case 'daysSinceLastLogin':
          if (condition.operator === 'greaterThan') {
            const daysAgo = new Date()
            daysAgo.setDate(daysAgo.getDate() - condition.value)
            query['lastLoginAt'] = { $lt: daysAgo }
          }
          break

        // Adicionar outros campos conforme necessário
      }
    }

    return await UserProduct.find(query)
      .populate('user', 'email name')
      .lean()
  }

  /**
   * Criar summary para caso de skip
   */
  private createSkippedSummary(reason: string): ExecutionSummary {
    return {
      success: true,
      totalRules: 0,
      rulesExecuted: 0,
      rulesFailed: 0,
      rulesSkipped: 0,
      totalStudentsEvaluated: 0,
      totalTagsApplied: 0,
      duration: 0,
      results: [],
      errorMessage: reason
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────

export const tagRulesExecutionService = new TagRulesExecutionService()
export default tagRulesExecutionService