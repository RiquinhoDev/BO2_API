// ════════════════════════════════════════════════════════════
// 📁 src/jobs/precompute.job.ts
// Precompute User Metrics Job
// ════════════════════════════════════════════════════════════
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'
import User from '../models/user'
import { cacheService } from '../services/cache.service'

class PrecomputeJob {
  /*
  // ❌ DESATIVADO: Job migrado para wizard CRON

  */

  async precomputeUserMetrics() {
    try {
      const startTime = Date.now()
      console.log('📊 Pre-computing user metrics...')

      // Processar em batches
      const batchSize = 1000
      let processed = 0
      let hasMore = true
      let lastId = null

      while (hasMore) {
        const query: any = {}
        if (lastId) {
          query._id = { $gt: lastId }
        }

        const users = await User.find(query)
          .limit(batchSize)
          .sort({ _id: 1 })
          .lean()

        if (users.length === 0) {
          hasMore = false
          break
        }

        // Calcular métricas para cada user
        const updates = users.map(user => {
          const engagementScore = this.calculateEngagementScore(user)
          const activityLevel = this.getActivityLevel(engagementScore)
          
          return {
            updateOne: {
              filter: { _id: user._id },
              update: {
                $set: {
                  'preComputed.engagementScore': engagementScore,
                  'preComputed.activityLevel': activityLevel,
                  'preComputed.lastCalculated': new Date()
                }
              }
            }
          }
        })

        // Bulk update
        if (updates.length > 0) {
          await User.bulkWrite(updates)
        }

        processed += users.length
        lastId = users[users.length - 1]._id

        console.log(`  Processed ${processed} users...`)

        if (users.length < batchSize) {
          hasMore = false
        }
      }

      // Invalidar caches relacionados
      await cacheService.invalidatePattern('users:*')
      await cacheService.invalidatePattern('engagement:*')

      const duration = Date.now() - startTime
      console.log(`✅ Precompute completed: ${processed} users in ${duration}ms`)

    } catch (error) {
      console.error('❌ Precompute job error:', error)
    }
  }

  calculateEngagementScore(user: any): number {
    let score = 0
    
    // Baseado no accessCount
    if (user.accessCount > 100) score += 30
    else if (user.accessCount > 50) score += 20
    else if (user.accessCount > 10) score += 10

    // Baseado no progresso
    const progress = user.progress?.completedPercentage || 0
    score += Math.min(progress * 0.5, 50)

    // Baseado na última atividade
    if (user.lastAccessDate) {
      const daysSinceAccess = Math.floor(
        (Date.now() - new Date(user.lastAccessDate).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSinceAccess < 7) score += 20
      else if (daysSinceAccess < 30) score += 10
    }

    return Math.min(Math.round(score), 100)
  }

  getActivityLevel(score: number): string {
    if (score >= 80) return 'very_high'
    if (score >= 60) return 'high'
    if (score >= 40) return 'medium'
    if (score >= 20) return 'low'
    return 'very_low'
  }
}

export const precomputeJob = new PrecomputeJob()

console.log('⚠️ PrecomputeJob: DESATIVADO (migrado para wizard CRON)')

export default {
  run: () => precomputeJob.precomputeUserMetrics()
}