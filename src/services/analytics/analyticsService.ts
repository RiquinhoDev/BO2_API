import logger from '../../utils/logger'
// src/services/analyticsService.ts - Serviço Completo de Analytics com Cache - VERSÃO CORRIGIDA
import User, { IUser } from '../../models/user'
import { Class } from '../../models/Class'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'
import { IClassAnalytics } from '../../types/analytics.types'



type AnalyticsStudent = Omit<IUser, 'engagement'> & {
  status?: string
  engagementScore?: number
  engagement?: string
  accessCount?: number
  progress?: { completedPercentage?: number }
  lastAccessDate?: Date
}

interface LastAccessStats {
  today: number
  week: number
  month: number
  older: number
}

export class AnalyticsService {
  
  /**
   * MÉTODO PRINCIPAL - Obter analytics de uma turma (sem cache por agora)
   */
  async getClassAnalytics(classId: string, forceRecalculate = false): Promise<IClassAnalytics | null> {
    logger.info(`📊 Buscando analytics para turma: ${classId}`)
    
    try {
      // Verificar se a turma existe
      const classData = await Class.findOne({ classId }).lean()
      if (!classData) {
        logger.info(`❌ Turma ${classId} não encontrada`)
        return null
      }
      
      // Calcular métricas
      const analytics = await this.calculateClassAnalytics(classId, classData.name || 'Turma sem nome')
      
      logger.info(`✅ Analytics calculados para turma ${classId}`)
      return analytics as IClassAnalytics
      
    } catch (error) {
      logger.error(`❌ Erro ao obter analytics da turma ${classId}:`, error)
      return null
    }
  }
  
  /**
   * CALCULAR MÉTRICAS DA TURMA USANDO DADOS REAIS
   */
  private async calculateClassAnalytics(classId: string, className: string): Promise<Partial<IClassAnalytics>> {
    const startTime = Date.now()
    logger.info(`🔢 Calculando métricas para turma ${classId}...`)
    
    // 1. Buscar todos os alunos da turma
const students = await User.find({
  classId,
  isDeleted: { $ne: true }
}).lean<AnalyticsStudent[]>()
    
    logger.info(`👥 Encontrados ${students.length} alunos na turma`)
    
    if (students.length === 0) {
      return this.getEmptyAnalytics(classId, className)
    }
    
    // 2. Calcular métricas básicas
    const totalStudents = students.length
    const activeStudents = students.filter(s => s.status === 'ACTIVE').length
    const inactiveStudents = totalStudents - activeStudents
    
    // 3. Calcular engagement scores e estatísticas
    const engagementData = this.calculateEngagementStats(students)
    
    // 4. Calcular estatísticas de progresso
    const progressData = this.calculateProgressStats(students)
    
    // 5. Calcular estatísticas de atividade
    const activityData = this.calculateActivityStats(students)
    
    // 6. Calcular dados de último acesso
    const lastAccessData = this.calculateLastAccessStats(students)
    
    // 7. Calcular health score
    const healthData = this.calculateHealthScore({
      averageEngagement: engagementData.average,
      averageProgress: progressData.average,
      activityRate: activityData.rate,
      retentionRate: this.calculateRetentionRate(lastAccessData, totalStudents)
    })
    
    // 8. Gerar alertas
    const alerts = this.generateAlerts({
      totalStudents,
      activeStudents,
      averageEngagement: engagementData.average,
      averageProgress: progressData.average,
      activityRate: activityData.rate
    })
    
    const calculationDuration = Date.now() - startTime
    
    return {
      classId,
      className,
      totalStudents,
      activeStudents,
      inactiveStudents,
      
      averageEngagement: Math.round(engagementData.average),
      engagementDistribution: engagementData.distribution,
      
      averageProgress: Math.round(progressData.average),
      progressDistribution: progressData.distribution,
      
      averageAccessCount: Math.round(activityData.average),
      activityDistribution: activityData.distribution,
      
      lastAccess: lastAccessData,
      
      healthScore: healthData.score,
      healthFactors: healthData.factors,
      
      alerts,
      
      lastCalculatedAt: new Date(),
      calculationDuration,
      studentsProcessed: totalStudents,
      dataVersion: '1.0.0'
    }
  }
  
  /**
   * CALCULAR ESTATÍSTICAS DE ENGAGEMENT
   */
  private calculateEngagementStats(students: AnalyticsStudent[]) {
    let totalEngagement = 0
    const distribution = {
      muito_alto: 0,
      alto: 0,
      medio: 0,
      baixo: 0,
      muito_baixo: 0
    }
    
    students.forEach(student => {
      // Usar engagement score já calculado ou calcular
      let score = student.engagementScore || 0
      
      if (!score && typeof calculateCombinedEngagement === 'function') {
        try {
          const result = calculateCombinedEngagement({
            engagement: student.engagement,
            accessCount: student.accessCount || 0,
            progress: student.progress
          })
          score = result.score || 0
          
          // Salvar score calculado para próximas consultas (async)
          User.findByIdAndUpdate(student._id, {
            engagementScore: score,
            engagementLevel: result.level,
            engagementCalculatedAt: new Date()
          }).exec().catch((error: unknown) => logger.error(error))
        } catch (error) {
          logger.error('Erro ao calcular engagement:', error)
          score = 0
        }
      }
      
      totalEngagement += score
      
      // Distribuir por categorias
      if (score >= 80) distribution.muito_alto++
      else if (score >= 60) distribution.alto++
      else if (score >= 40) distribution.medio++
      else if (score >= 20) distribution.baixo++
      else distribution.muito_baixo++
    })
    
    return {
      average: students.length > 0 ? totalEngagement / students.length : 0,
      distribution
    }
  }
  
  /**
   * CALCULAR ESTATÍSTICAS DE PROGRESSO
   */
  private calculateProgressStats(students: AnalyticsStudent[]) {
    let totalProgress = 0
    const distribution = {
      completed: 0,
      advanced: 0,
      intermediate: 0,
      beginner: 0,
      minimal: 0
    }
    
    students.forEach(student => {
      const progress = student.progress?.completedPercentage || 0
      totalProgress += progress
      
      if (progress === 100) distribution.completed++
      else if (progress >= 75) distribution.advanced++
      else if (progress >= 50) distribution.intermediate++
      else if (progress >= 25) distribution.beginner++
      else distribution.minimal++
    })
    
    return {
      average: students.length > 0 ? totalProgress / students.length : 0,
      distribution
    }
  }
  
  /**
   * CALCULAR ESTATÍSTICAS DE ATIVIDADE
   */
  private calculateActivityStats(students: AnalyticsStudent[]) {
    let totalAccess = 0
    const distribution = {
      very_active: 0,
      active: 0,
      moderate: 0,
      low: 0,
      inactive: 0
    }
    
    students.forEach(student => {
      const accessCount = student.accessCount || 0
      totalAccess += accessCount
      
      if (accessCount >= 50) distribution.very_active++
      else if (accessCount >= 20) distribution.active++
      else if (accessCount >= 10) distribution.moderate++
      else if (accessCount >= 1) distribution.low++
      else distribution.inactive++
    })
    
    const activeStudents = students.filter(s => (s.accessCount || 0) > 0).length
    const rate = students.length > 0 ? (activeStudents / students.length) * 100 : 0
    
    return {
      average: students.length > 0 ? totalAccess / students.length : 0,
      rate,
      distribution
    }
  }
  
  /**
   * CALCULAR ESTATÍSTICAS DE ÚLTIMO ACESSO
   */
  private calculateLastAccessStats(students: AnalyticsStudent[]) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000))
    const monthAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000))
    
    const lastAccess = {
      today: 0,
      week: 0,
      month: 0,
      older: 0
    }
    
    students.forEach(student => {
      const lastLogin = student.lastAccessDate ? new Date(student.lastAccessDate) : null
      
      if (!lastLogin) {
        lastAccess.older++
      } else if (lastLogin >= today) {
        lastAccess.today++
      } else if (lastLogin >= weekAgo) {
        lastAccess.week++
      } else if (lastLogin >= monthAgo) {
        lastAccess.month++
      } else {
        lastAccess.older++
      }
    })
    
    return lastAccess
  }
  
  /**
   * CALCULAR HEALTH SCORE
   */
  private calculateHealthScore(metrics: {
    averageEngagement: number
    averageProgress: number
    activityRate: number
    retentionRate: number
  }) {
    const weights = {
      engagement: 0.4,
      progress: 0.3,
      activity: 0.2,
      retention: 0.1
    }
    
    const factors = {
      engagement: Math.round(metrics.averageEngagement),
      activity: Math.round(metrics.activityRate),
      progress: Math.round(metrics.averageProgress),
      retention: Math.round(metrics.retentionRate)
    }
    
    const score = Math.round(
      (factors.engagement * weights.engagement) +
      (factors.activity * weights.activity) +
      (factors.progress * weights.progress) +
      (factors.retention * weights.retention)
    )
    
    return {
      score: Math.min(100, Math.max(0, score)),
      factors
    }
  }
  
  /**
   * CALCULAR TAXA DE RETENÇÃO
   */
  private calculateRetentionRate(lastAccess: LastAccessStats, totalStudents: number): number {
    if (totalStudents === 0) return 0
    const recentAccess = lastAccess.today + lastAccess.week
    return (recentAccess / totalStudents) * 100
  }
  
  /**
   * GERAR ALERTAS AUTOMÁTICOS
   */
  private generateAlerts(metrics: {
    totalStudents: number
    activeStudents: number
    averageEngagement: number
    averageProgress: number
    activityRate: number
  }) {
    const alerts: IClassAnalytics['alerts'] = []
    
    // Alerta de baixo engagement
    if (metrics.averageEngagement < 40) {
      alerts.push({
        type: 'warning',
        message: `Engagement médio baixo (${Math.round(metrics.averageEngagement)}%). Considere estratégias de reativação.`,
        priority: 'high',
        category: 'engagement'
      })
    }
    
    // Alerta de inatividade
    const inactiveRate = ((metrics.totalStudents - metrics.activeStudents) / metrics.totalStudents) * 100
    if (inactiveRate > 30) {
      alerts.push({
        type: 'warning',
        message: `${Math.round(inactiveRate)}% dos alunos estão inativos. Revisar estratégias de retenção.`,
        priority: 'medium',
        category: 'retention'
      })
    }
    
    // Alerta de progresso baixo
    if (metrics.averageProgress < 25) {
      alerts.push({
        type: 'info',
        message: `Progresso médio baixo (${Math.round(metrics.averageProgress)}%). Considere suporte adicional.`,
        priority: 'medium',
        category: 'progress'
      })
    }
    
    // Alerta positivo
    if (metrics.averageEngagement > 70 && metrics.averageProgress > 60) {
      alerts.push({
        type: 'success',
        message: 'Turma com excelente performance! Continue as estratégias atuais.',
        priority: 'low',
        category: 'engagement'
      })
    }
    
    return alerts
  }
  
  /**
   * RETORNAR ANALYTICS VAZIOS
   */
  private getEmptyAnalytics(classId: string, className: string): Partial<IClassAnalytics> {
    return {
      classId,
      className,
      totalStudents: 0,
      activeStudents: 0,
      inactiveStudents: 0,
      averageEngagement: 0,
      engagementDistribution: {
        muito_alto: 0,
        alto: 0,
        medio: 0,
        baixo: 0,
        muito_baixo: 0
      },
      averageProgress: 0,
      progressDistribution: {
        completed: 0,
        advanced: 0,
        intermediate: 0,
        beginner: 0,
        minimal: 0
      },
      averageAccessCount: 0,
      activityDistribution: {
        very_active: 0,
        active: 0,
        moderate: 0,
        low: 0,
        inactive: 0
      },
      lastAccess: {
        today: 0,
        week: 0,
        month: 0,
        older: 0
      },
      healthScore: 0,
      healthFactors: {
        engagement: 0,
        activity: 0,
        progress: 0,
        retention: 0
      },
      alerts: [{
        type: 'info',
        message: 'Turma sem alunos matriculados',
        priority: 'low',
        category: 'activity'
      }],
      lastCalculatedAt: new Date(),
      calculationDuration: 0,
      studentsProcessed: 0,
      dataVersion: '1.0.0'
    }
  }
  
  /**
   * FORÇAR RECÁLCULO DE UMA TURMA
   */
  async recalculateClass(classId: string): Promise<IClassAnalytics | null> {
    logger.info(`🔄 Forçando recálculo da turma ${classId}`)
    return await this.getClassAnalytics(classId, true)
  }
  
  /**
   * VERIFICAR QUAIS TURMAS PRECISAM DE ATUALIZAÇÃO (versão simplificada)
   */
  async getClassesThatNeedUpdate(): Promise<string[]> {
    // Retornar array vazio por agora - pode ser implementado mais tarde
    return []
  }
}

// EXPORTAR INSTÂNCIA SINGLETON
export const analyticsService = new AnalyticsService()