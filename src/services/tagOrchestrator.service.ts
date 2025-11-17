// ================================================================
// 🎯 TAG ORCHESTRATOR SERVICE
// ================================================================
// Serviço responsável por executar decisões do DecisionEngine
// - Aplicar tags no Active Campaign
// - Remover tags no Active Campaign
// - Atualizar StudentEngagementState
// - Registar em CommunicationHistory
// ================================================================

import activeCampaignService from './activeCampaignService'
import ProductProfile from '../models/ProductProfile'
import StudentEngagementState, { IStudentEngagementState } from '../models/StudentEngagementState'
import CommunicationHistory from '../models/CommunicationHistory'
import User from '../models/user'
import { DecisionResult } from './decisionEngine.service'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean
  acResponse?: any
  error?: string
  metadata?: {
    userId: string
    email: string
    productCode: string
    action: string
    tag?: string
    level?: number
    timestamp: Date
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE TAG ORCHESTRATOR
// ─────────────────────────────────────────────────────────────

class TagOrchestrator {

  /**
   * 🎯 MÉTODO PRINCIPAL: Executar decisão
   */
  async executeDecision(
    userId: string,
    productCode: string,
    decision: DecisionResult
  ): Promise<ExecutionResult> {

    // Se não deve executar, retornar sucesso sem fazer nada
    if (!decision.shouldExecute) {
      return {
        success: true,
        metadata: {
          userId,
          email: 'N/A',
          productCode,
          action: decision.action,
          timestamp: new Date()
        }
      }
    }

    // Buscar user
    const user = await User.findById(userId)
    if (!user?.email) {
      return {
        success: false,
        error: 'Utilizador ou email não encontrado',
        metadata: {
          userId,
          email: 'N/A',
          productCode,
          action: decision.action,
          timestamp: new Date()
        }
      }
    }

    try {
      switch (decision.action) {
        case 'APPLY_TAG':
          return await this.applyTag(user, productCode, decision.tag!, decision.level!, 'APPLY')
        
        case 'ESCALATE':
          return await this.applyTag(user, productCode, decision.tag!, decision.level!, 'ESCALATE')
        
        case 'REMOVE_TAG':
        case 'DESESCALATE':
          return await this.removeTag(user, productCode, decision.tag!, decision.action)
        
        default:
          return {
            success: true,
            metadata: {
              userId,
              email: user.email,
              productCode,
              action: decision.action,
              timestamp: new Date()
            }
          }
      }
    } catch (error: any) {
      console.error(`❌ Erro ao executar decisão para ${user.email}:`, error)
      return {
        success: false,
        error: error.message,
        metadata: {
          userId,
          email: user.email,
          productCode,
          action: decision.action,
          timestamp: new Date()
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // APLICAR TAG
  // ─────────────────────────────────────────────────────────────

  /**
   * Aplicar tag ao aluno
   */
  private async applyTag(
    user: any,
    productCode: string,
    tag: string,
    level: number,
    action: 'APPLY' | 'ESCALATE'
  ): Promise<ExecutionResult> {

    const startTime = Date.now()

    try {
      console.log(`🏷️ ${action === 'APPLY' ? 'Aplicando' : 'Escalando para'} tag "${tag}" → ${user.email}`)

      // ===== 1. APLICAR TAG NO ACTIVE CAMPAIGN =====
      const acResponse = await activeCampaignService.addTag(user.email, tag)
      const duration = Date.now() - startTime

      console.log(`✅ Tag "${tag}" aplicada com sucesso (${duration}ms)`)

      // ===== 2. BUSCAR PRODUCT PROFILE PARA COOLDOWN =====
      const profile = await ProductProfile.findOne({ 
        code: productCode.toUpperCase() 
      })

      if (!profile) {
        throw new Error(`Perfil de produto '${productCode}' não encontrado`)
      }

      const levelConfig = profile.reengagementLevels.find(l => l.level === level)
      if (!levelConfig) {
        throw new Error(`Nível ${level} não configurado no perfil`)
      }

      // ===== 3. ATUALIZAR STUDENT ENGAGEMENT STATE =====
      let studentState = await StudentEngagementState.findOne({ 
        userId: user._id, 
        productCode: productCode.toUpperCase() 
      }) as IStudentEngagementState | null

      if (!studentState) {
        // Criar estado se não existe
        studentState = await StudentEngagementState.create({
          userId: user._id,
          productCode: productCode.toUpperCase(),
          currentState: 'ACTIVE',
          daysSinceLastLogin: 0,
          tagsHistory: [],
          totalEmailsSent: 0,
          totalReturns: 0,
          stats: {
            totalDaysInactive: 0,
            currentStreakInactive: 0,
            longestStreakInactive: 0
          }
        }) as IStudentEngagementState
      }

      // Aplicar tag no estado
      studentState.applyTag(tag, level)
      
      // Definir cooldown
      studentState.setCooldown(levelConfig.cooldownDays)
      
      await studentState.save()

      console.log(`📊 Estado atualizado: Nível ${level}, cooldown ${levelConfig.cooldownDays} dias`)

      // ===== 4. REGISTRAR EM COMMUNICATION HISTORY =====
      const lastActivity = this.getUserLastActivity(user, productCode)
      const daysInactive = this.calculateDaysInactive(lastActivity)

      await CommunicationHistory.create({
        userId: user._id,
        productCode: productCode.toUpperCase(),
        level,
        previousLevel: action === 'ESCALATE' && studentState.tagsHistory.length > 1 
          ? studentState.tagsHistory[studentState.tagsHistory.length - 2]?.level 
          : undefined,
        tagApplied: tag,
        acContactId: acResponse.contactId,
        sentAt: new Date(),
        status: 'SENT',
        outcome: 'NO_RESPONSE', // Será atualizado se aluno retornar
        daysInactiveWhenSent: daysInactive,
        sentBy: 'CRON_AUTO',
        source: 'AUTOMATIC',
        notes: `${action === 'APPLY' ? 'Tag aplicada' : 'Escalado para nível'} ${level} (${daysInactive} dias inativo)`
      })

      console.log(`📝 Comunicação registrada`)

      // ===== 5. RETORNAR SUCESSO =====
      return {
        success: true,
        acResponse,
        metadata: {
          userId: user._id.toString(),
          email: user.email,
          productCode,
          action,
          tag,
          level,
          timestamp: new Date()
        }
      }

    } catch (error: any) {
      console.error(`❌ Erro ao aplicar tag:`, error)
      
      return {
        success: false,
        error: error.message,
        metadata: {
          userId: user._id.toString(),
          email: user.email,
          productCode,
          action,
          tag,
          level,
          timestamp: new Date()
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REMOVER TAG
  // ─────────────────────────────────────────────────────────────

  /**
   * Remover tag do aluno (voltou a ser ativo)
   */
  private async removeTag(
    user: any,
    productCode: string,
    tag: string | undefined,
    action: 'REMOVE_TAG' | 'DESESCALATE'
  ): Promise<ExecutionResult> {

    const startTime = Date.now()

    try {
      // Buscar estado atual
      const studentState = await StudentEngagementState.findOne({ 
        userId: user._id, 
        productCode: productCode.toUpperCase() 
      }) as IStudentEngagementState | null

      if (!studentState) {
        console.warn(`⚠️ Estado não encontrado para ${user.email}`)
        return {
          success: true, // Não é erro crítico
          metadata: {
            userId: user._id.toString(),
            email: user.email,
            productCode,
            action,
            timestamp: new Date()
          }
        }
      }

      // Se não tem tag atual, não há nada a remover
      if (!studentState.currentTagAC && !tag) {
        console.log(`ℹ️ Aluno ${user.email} não tem tag ativa`)
        return {
          success: true,
          metadata: {
            userId: user._id.toString(),
            email: user.email,
            productCode,
            action,
            timestamp: new Date()
          }
        }
      }

      const tagToRemove = tag || studentState.currentTagAC

      if (!tagToRemove) {
        console.log(`ℹ️ Sem tag para remover de ${user.email}`)
        return { success: true }
      }

      console.log(`🏷️ Removendo tag "${tagToRemove}" de ${user.email}`)

      // ===== 1. REMOVER TAG NO ACTIVE CAMPAIGN =====
      await activeCampaignService.removeTag(user.email, tagToRemove)
      const duration = Date.now() - startTime

      console.log(`✅ Tag "${tagToRemove}" removida com sucesso (${duration}ms)`)

      // ===== 2. ATUALIZAR STUDENT ENGAGEMENT STATE =====
      studentState.removeTag('RETURNED')
      studentState.markAsReturned()
      await studentState.save()

      console.log(`📊 Estado atualizado: Aluno retornou`)

      // ===== 3. ATUALIZAR COMMUNICATION HISTORY =====
      // Buscar última comunicação com esta tag
      const lastComm = await CommunicationHistory.findOne({
        userId: user._id,
        productCode: productCode.toUpperCase(),
        tagApplied: tagToRemove,
        outcome: { $ne: 'SUCCESS' } // Ainda não marcado como sucesso
      }).sort({ sentAt: -1 })

      if (lastComm) {
        lastComm.markAsReturned()
        await lastComm.save()
        console.log(`📝 Comunicação atualizada: Aluno retornou`)
      }

      // ===== 4. RETORNAR SUCESSO =====
      return {
        success: true,
        metadata: {
          userId: user._id.toString(),
          email: user.email,
          productCode,
          action,
          tag: tagToRemove,
          timestamp: new Date()
        }
      }

    } catch (error: any) {
      console.error(`❌ Erro ao remover tag:`, error)
      
      return {
        success: false,
        error: error.message,
        metadata: {
          userId: user._id.toString(),
          email: user.email,
          productCode,
          action,
          tag,
          timestamp: new Date()
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MÉTODOS AUXILIARES
  // ─────────────────────────────────────────────────────────────

  /**
   * Obter última atividade do user
   */
  private getUserLastActivity(user: any, productCode: string): Date {
    const courseData = user.communicationByCourse?.get(productCode)
    
    if (courseData?.lastActivityDate) {
      return courseData.lastActivityDate
    }

    if (user.lastLogin) {
      return user.lastLogin
    }

    return user.createdAt || new Date()
  }

  /**
   * Calcular dias de inatividade
   */
  private calculateDaysInactive(lastActivity: Date): number {
    const now = new Date()
    const diffMs = now.getTime() - lastActivity.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  /**
   * Extrair código do produto de uma tag
   * Ex: "CLAREZA_10D" → "CLAREZA"
   */
  private extractProductFromTag(tag: string): string {
    const parts = tag.split('_')
    return parts[0]
  }

  // ─────────────────────────────────────────────────────────────
  // MÉTODOS PÚBLICOS AUXILIARES
  // ─────────────────────────────────────────────────────────────

  /**
   * Executar múltiplas decisões em lote
   */
  async executeMultipleDecisions(
    decisions: Array<{
      userId: string
      productCode: string
      decision: DecisionResult
    }>
  ): Promise<ExecutionResult[]> {
    
    const results: ExecutionResult[] = []

    for (const item of decisions) {
      try {
        const result = await this.executeDecision(
          item.userId,
          item.productCode,
          item.decision
        )
        results.push(result)
      } catch (error: any) {
        console.error(`❌ Erro ao executar decisão para ${item.userId}:`, error)
        results.push({
          success: false,
          error: error.message,
          metadata: {
            userId: item.userId,
            email: 'unknown',
            productCode: item.productCode,
            action: item.decision.action,
            timestamp: new Date()
          }
        })
      }
    }

    return results
  }

  /**
   * Estatísticas de execução
   */
  getExecutionStats(results: ExecutionResult[]): any {
    const total = results.length
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    const byAction: any = {}
    results.forEach(r => {
      const action = r.metadata?.action || 'UNKNOWN'
      byAction[action] = (byAction[action] || 0) + 1
    })

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : '0%',
      byAction
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTAR SINGLETON
// ─────────────────────────────────────────────────────────────

export default new TagOrchestrator()

