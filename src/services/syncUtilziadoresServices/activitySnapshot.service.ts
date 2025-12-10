// ════════════════════════════════════════════════════════════
// 📁 src/services/activitySnapshot.service.ts
// Service: Activity Snapshot
// Criação e gestão de snapshots mensais de atividade
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import ActivitySnapshot, { IActivitySnapshot, Platform, SnapshotSource } from '../../models/SyncModels/ActivitySnapshot'
import { User } from '../../models'


// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CreateSnapshotDTO {
  userId: mongoose.Types.ObjectId
  platform: Platform
  month: Date
  wasActive: boolean
  hadLogin: boolean
  hadActivity: boolean
  loginCount?: number
  activityCount?: number
  engagementScore?: number
  progress?: {
    completedLessons: number
    totalLessons: number
    percentage: number
  }
  platformSpecific?: any
  source?: SnapshotSource
  syncHistoryId?: mongoose.Types.ObjectId
}

interface MonthlyBatchDTO {
  month: Date
  platform: Platform
  userActivities: Array<{
    userId: mongoose.Types.ObjectId
    wasActive: boolean
    hadLogin: boolean
    hadActivity: boolean
    loginCount: number
    activityCount: number
    progress?: {
      completedLessons: number
      totalLessons: number
      percentage: number
    }
  }>
  source?: SnapshotSource
}

interface CohortRetentionData {
  cohortMonth: Date
  platform: Platform
  milestones: Array<{
    month: number
    total: number
    active: number
    rate: number
  }>
}

// ─────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────

export class ActivitySnapshotService {

  // ═══════════════════════════════════════════════════════════
  // CREATE SINGLE SNAPSHOT
  // ═══════════════════════════════════════════════════════════
  
  async createSnapshot(dto: CreateSnapshotDTO): Promise<IActivitySnapshot> {
    console.log(`📸 Criando snapshot: User ${dto.userId} | Platform ${dto.platform}`)

    // Normalizar mês para primeiro dia
    const normalizedMonth = this.normalizeMonth(dto.month)

    // Calcular engagement score se não fornecido
    const engagementScore = dto.engagementScore ?? this.calculateEngagementScore({
      hadLogin: dto.hadLogin,
      hadActivity: dto.hadActivity,
      loginCount: dto.loginCount || 0,
      activityCount: dto.activityCount || 0
    })

    // Verificar se já existe snapshot
    const existing = await ActivitySnapshot.findOne({
      userId: dto.userId,
      platform: dto.platform,
      snapshotMonth: normalizedMonth
    })

    if (existing) {
      console.log(`♻️ Snapshot já existe, atualizando...`)
      
      // Atualizar snapshot existente
      existing.wasActive = dto.wasActive
      existing.hadLogin = dto.hadLogin
      existing.hadActivity = dto.hadActivity
      existing.loginCount = dto.loginCount || 0
      existing.activityCount = dto.activityCount || 0
      existing.engagementScore = engagementScore
      
      if (dto.progress) {
        existing.progress = dto.progress
      }
      
      if (dto.platformSpecific) {
        existing.platformSpecific = dto.platformSpecific
      }

      await existing.save()
      return existing
    }

    // Criar novo snapshot
    const snapshot = await ActivitySnapshot.create({
      userId: dto.userId,
      platform: dto.platform,
      snapshotMonth: normalizedMonth,
      wasActive: dto.wasActive,
      hadLogin: dto.hadLogin,
      hadActivity: dto.hadActivity,
      loginCount: dto.loginCount || 0,
      activityCount: dto.activityCount || 0,
      engagementScore,
      progress: dto.progress,
      platformSpecific: dto.platformSpecific,
      source: dto.source || 'SYNC',
      syncHistoryId: dto.syncHistoryId
    })

    console.log(`✅ Snapshot criado: ${snapshot._id}`)
    
    return snapshot
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE BATCH SNAPSHOTS
  // ═══════════════════════════════════════════════════════════
  
  async createBatchSnapshots(dto: MonthlyBatchDTO): Promise<{
    created: number
    updated: number
    errors: number
  }> {
    console.log(`📸 Criando batch snapshots: ${dto.userActivities.length} users`)

    const normalizedMonth = this.normalizeMonth(dto.month)
    
    let created = 0
    let updated = 0
    let errors = 0

    // Processar em batches para performance
    const batchSize = 100
    
    for (let i = 0; i < dto.userActivities.length; i += batchSize) {
      const batch = dto.userActivities.slice(i, i + batchSize)
      
      const operations = batch.map(activity => {
        const engagementScore = this.calculateEngagementScore(activity)
        
        return {
          updateOne: {
            filter: {
              userId: activity.userId,
              platform: dto.platform,
              snapshotMonth: normalizedMonth
            },
            update: {
              $set: {
                wasActive: activity.wasActive,
                hadLogin: activity.hadLogin,
                hadActivity: activity.hadActivity,
                loginCount: activity.loginCount,
                activityCount: activity.activityCount,
                engagementScore,
                progress: activity.progress,
                source: dto.source || 'CRON',
                createdAt: new Date()
              }
            },
            upsert: true
          }
        }
      })

      try {
        const result = await ActivitySnapshot.bulkWrite(operations)
        created += result.upsertedCount
        updated += result.modifiedCount
      } catch (error: any) {
        console.error(`❌ Erro no batch ${i}-${i + batchSize}:`, error.message)
        errors += batch.length
      }
    }

    console.log(`✅ Batch completo: ${created} criados, ${updated} atualizados, ${errors} erros`)
    
    return { created, updated, errors }
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE MONTHLY SNAPSHOTS (CRON JOB)
  // ═══════════════════════════════════════════════════════════
  
  async createMonthlySnapshots(
    month: Date,
    platform?: Platform
  ): Promise<{
    totalProcessed: number
    snapshotsCreated: number
    duration: number
  }> {
    const startTime = Date.now()
    
    console.log(`📸 Criando snapshots mensais: ${month.toISOString().slice(0, 7)}`)

    const normalizedMonth = this.normalizeMonth(month)
    const platforms: Platform[] = platform ? [platform] : ['HOTMART', 'CURSEDUCA', 'DISCORD']
    
    let totalProcessed = 0
    let snapshotsCreated = 0

    for (const plt of platforms) {
      console.log(`🔄 Processando plataforma: ${plt}`)

      // Buscar todos os users ativos nesta plataforma
      const users = await this.getActiveUsersForPlatform(plt, normalizedMonth)
      
      console.log(`👥 ${users.length} users encontrados`)

      // Criar snapshots
      for (const user of users) {
        try {
          const activity = await this.getUserActivityForMonth(user._id, plt, normalizedMonth)
          
          await this.createSnapshot({
            userId: user._id,
            platform: plt,
            month: normalizedMonth,
            wasActive: activity.wasActive,
            hadLogin: activity.hadLogin,
            hadActivity: activity.hadActivity,
            loginCount: activity.loginCount,
            activityCount: activity.activityCount,
            progress: activity.progress,
            source: 'CRON'
          })

          snapshotsCreated++
          totalProcessed++

        } catch (error: any) {
          console.error(`❌ Erro ao criar snapshot para user ${user._id}:`, error.message)
        }
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000)
    
    console.log(`✅ Snapshots mensais criados: ${snapshotsCreated}/${totalProcessed} (${duration}s)`)
    
    return {
      totalProcessed,
      snapshotsCreated,
      duration
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GET SNAPSHOTS
  // ═══════════════════════════════════════════════════════════
  
  async getUserSnapshots(
    userId: mongoose.Types.ObjectId,
    startMonth: Date,
    endMonth: Date,
    platform?: Platform
  ): Promise<IActivitySnapshot[]> {
    return ActivitySnapshot.getUserSnapshots(
      userId,
      startMonth,
      endMonth,
      platform
    )
  }

  async getSnapshotForMonth(
    userId: mongoose.Types.ObjectId,
    platform: Platform,
    month: Date
  ): Promise<IActivitySnapshot | null> {
    return ActivitySnapshot.getSnapshotForMonth(userId, platform, month)
  }

  async getMonthlyStats(
    month: Date,
    platform?: Platform
  ): Promise<any> {
    return ActivitySnapshot.getMonthlyStats(month, platform)
  }

  // ═══════════════════════════════════════════════════════════
  // COHORT ANALYSIS
  // ═══════════════════════════════════════════════════════════
  
  async getCohortRetention(
    cohortMonth: Date,
    platform: Platform,
    milestones: number[] = [1, 3, 6, 12]
  ): Promise<CohortRetentionData> {
    console.log(`📊 Calculando cohort retention: ${cohortMonth.toISOString().slice(0, 7)}`)

    const results = await Promise.all(
      milestones.map(async milestone => {
        const retention = await ActivitySnapshot.getCohortRetention(
          cohortMonth,
          platform,
          milestone
        )
        
        return {
          month: milestone,
          total: retention.total,
          active: retention.active,
          rate: retention.rate
        }
      })
    )

    return {
      cohortMonth,
      platform,
      milestones: results
    }
  }

  async getActiveUsersInMonth(
    month: Date,
    platform: Platform
  ): Promise<mongoose.Types.ObjectId[]> {
    return ActivitySnapshot.getActiveUsersInMonth(month, platform)
  }

  // ═══════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════
  
  async cleanupOldSnapshots(
    olderThanMonths: number = 18
  ): Promise<number> {
    console.log(`🧹 Limpando snapshots mais antigos que ${olderThanMonths} meses`)

    const deletedCount = await ActivitySnapshot.cleanupOldSnapshots(olderThanMonths)
    
    console.log(`✅ ${deletedCount} snapshots deletados`)
    
    return deletedCount
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════
  
  private normalizeMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
  }

  private calculateEngagementScore(activity: {
    hadLogin: boolean
    hadActivity: boolean
    loginCount: number
    activityCount: number
  }): number {
    let score = 0
    
    // Login contribui 20%
    if (activity.hadLogin) {
      score += 20
    }
    
    // Atividade contribui 30%
    if (activity.hadActivity) {
      score += 30
    }
    
    // Número de logins (até 20%)
    score += Math.min(activity.loginCount * 2, 20)
    
    // Número de atividades (até 30%)
    score += Math.min(activity.activityCount * 3, 30)
    
    return Math.min(score, 100)
  }

  private async getActiveUsersForPlatform(
    platform: Platform,
    month: Date
  ): Promise<any[]> {
    // TODO: Implementar query real baseada na plataforma
    // Por agora, retornar mock data
    
    switch (platform) {
      case 'HOTMART':
        // Buscar users com hotmartUserId
        return User.find({ 
          hotmartUserId: { $exists: true, $ne: null }
        }).limit(100).lean()
      
      case 'CURSEDUCA':
        // Buscar users com curseducaUserId
        return User.find({ 
          curseducaUserId: { $exists: true, $ne: null }
        }).limit(100).lean()
      
      case 'DISCORD':
        // Buscar users com discordId
        return User.find({ 
          discordId: { $exists: true, $ne: null }
        }).limit(100).lean()
      
      default:
        return []
    }
  }

  private async getUserActivityForMonth(
    userId: mongoose.Types.ObjectId,
    platform: Platform,
    month: Date
  ): Promise<{
    wasActive: boolean
    hadLogin: boolean
    hadActivity: boolean
    loginCount: number
    activityCount: number
    progress?: any
  }> {
    // TODO: Implementar lógica real para buscar atividade do mês
    // Por agora, retornar mock data
    
    // Esta função deve:
    // 1. Buscar logins do user neste mês
    // 2. Buscar atividades (lições, mensagens) neste mês
    // 3. Calcular progresso
    // 4. Retornar dados agregados

    const mockLoginCount = Math.floor(Math.random() * 10)
    const mockActivityCount = Math.floor(Math.random() * 20)

    return {
      wasActive: mockLoginCount > 0 || mockActivityCount > 0,
      hadLogin: mockLoginCount > 0,
      hadActivity: mockActivityCount > 0,
      loginCount: mockLoginCount,
      activityCount: mockActivityCount,
      progress: {
        completedLessons: mockActivityCount,
        totalLessons: 100,
        percentage: (mockActivityCount / 100) * 100
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ANALYTICS HELPERS
  // ═══════════════════════════════════════════════════════════
  
  async getUserEngagementTrend(
    userId: mongoose.Types.ObjectId,
    platform: Platform,
    months: number = 6
  ): Promise<Array<{
    month: Date
    engagementScore: number
    wasActive: boolean
  }>> {
    const endMonth = new Date()
    const startMonth = new Date()
    startMonth.setMonth(startMonth.getMonth() - months)

    const snapshots = await this.getUserSnapshots(
      userId,
      startMonth,
      endMonth,
      platform
    )

    return snapshots.map(s => ({
      month: s.snapshotMonth,
      engagementScore: s.engagementScore,
      wasActive: s.wasActive
    }))
  }

  async getPlatformEngagementTrend(
    platform: Platform,
    months: number = 12
  ): Promise<Array<{
    month: Date
    avgEngagement: number
    activeUsers: number
    totalUsers: number
  }>> {
    const results: any[] = []
    
    for (let i = months - 1; i >= 0; i--) {
      const month = new Date()
      month.setMonth(month.getMonth() - i)
      const normalizedMonth = this.normalizeMonth(month)

      const stats = await ActivitySnapshot.getMonthlyStats(normalizedMonth, platform)
      
      results.push({
        month: normalizedMonth,
        avgEngagement: stats.avgEngagement,
        activeUsers: stats.activeUsers,
        totalUsers: stats.totalSnapshots
      })
    }

    return results
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────

export const activitySnapshotService = new ActivitySnapshotService()

export default activitySnapshotService