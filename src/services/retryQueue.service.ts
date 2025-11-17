// =====================================================
// 📁 src/services/retryQueue.service.ts
// SERVICE: Sistema de Retry com Bull Queue
// =====================================================

import Queue from 'bull'
import { activecampaignService } from './activecampaign.service'

/**
 * Configuração da fila
 * 
 * Suporta Redis (produção) ou in-memory (desenvolvimento)
 */
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379')
const USE_REDIS = process.env.USE_REDIS === 'true'

/**
 * Criar fila de operações de tags do Active Campaign
 */
const tagQueue = new Queue('ac-tag-operations', {
  redis: USE_REDIS ? {
    host: REDIS_HOST,
    port: REDIS_PORT,
  } : undefined, // Se não tiver Redis, usa in-memory
  
  // Configurações gerais
  defaultJobOptions: {
    attempts: 3, // 3 tentativas
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: 100, // Manter apenas últimos 100 jobs completos
    removeOnFail: 500, // Manter últimos 500 jobs falhados
  }
})

/**
 * Processar jobs da fila
 */
tagQueue.process(async (job) => {
  const { operation, userId, tagId, tagName, acContactId } = job.data

  console.log(`\n🔄 [QUEUE] Processando ${operation}`)
  console.log(`   User: ${userId}`)
  console.log(`   Tag: ${tagName} (${tagId})`)
  console.log(`   Tentativa: ${job.attemptsMade + 1}/3`)

  try {
    // Executar operação no Active Campaign
    if (operation === 'add') {
      await activecampaignService.addTag(acContactId || userId, tagId)
      console.log(`   ✅ Tag "${tagName}" aplicada com sucesso`)
      
    } else if (operation === 'remove') {
      await activecampaignService.removeTag(acContactId || userId, tagId)
      console.log(`   ✅ Tag "${tagName}" removida com sucesso`)
    }

    return { success: true, operation, userId, tagName }

  } catch (error: any) {
    console.error(`   ❌ Erro ao ${operation} tag:`, error.message)
    
    // Se é a última tentativa, logar erro crítico
    if (job.attemptsMade >= 2) { // 0, 1, 2 = 3 tentativas
      console.error(`\n🚨 ALERTA: ${operation} falhou após 3 tentativas`)
      console.error(`   User: ${userId}`)
      console.error(`   Tag: ${tagName}`)
      console.error(`   Erro: ${error.message}`)
      
      // TODO: Enviar alerta para admins (email/Slack)
      // await sendAlert({
      //   type: 'queue-failure',
      //   operation,
      //   userId,
      //   tagName,
      //   error: error.message
      // })
    }

    // Re-throw para Bull retentar
    throw error
  }
})

/**
 * Event listeners da fila
 */
tagQueue.on('completed', (job, result) => {
  console.log(`✅ [QUEUE] Job ${job.id} completo:`, result)
})

tagQueue.on('failed', (job, err) => {
  console.error(`❌ [QUEUE] Job ${job?.id} falhou:`, err.message)
})

tagQueue.on('stalled', (job) => {
  console.warn(`⚠️  [QUEUE] Job ${job.id} travou (stalled)`)
})

/**
 * Retry Queue Service
 * 
 * API pública para adicionar jobs à fila
 */
export const retryQueueService = {
  
  /**
   * Adicionar tag com retry automático
   */
  async addTagWithRetry(
    userId: string, 
    tagId: string, 
    tagName: string,
    acContactId?: string
  ) {
    console.log(`📥 [QUEUE] Adicionando job: ADD tag "${tagName}" para ${userId}`)
    
    return tagQueue.add(
      { 
        operation: 'add', 
        userId, 
        tagId, 
        tagName,
        acContactId
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        timeout: 30000, // 30s timeout por tentativa
      }
    )
  },

  /**
   * Remover tag com retry automático
   */
  async removeTagWithRetry(
    userId: string, 
    tagId: string, 
    tagName: string,
    acContactId?: string
  ) {
    console.log(`📥 [QUEUE] Adicionando job: REMOVE tag "${tagName}" para ${userId}`)
    
    return tagQueue.add(
      { 
        operation: 'remove', 
        userId, 
        tagId, 
        tagName,
        acContactId
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        timeout: 30000,
      }
    )
  },

  /**
   * Obter estatísticas da fila
   */
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        tagQueue.getWaitingCount(),
        tagQueue.getActiveCount(),
        tagQueue.getCompletedCount(),
        tagQueue.getFailedCount(),
        tagQueue.getDelayedCount(),
      ])

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      }
    } catch (error: any) {
      console.error('❌ Erro ao obter stats da fila:', error)
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
        error: error.message,
      }
    }
  },

  /**
   * Obter jobs falhados recentes
   */
  async getFailedJobs(limit = 10) {
    try {
      const failed = await tagQueue.getFailed(0, limit - 1)
      return failed.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      }))
    } catch (error: any) {
      console.error('❌ Erro ao obter jobs falhados:', error)
      return []
    }
  },

  /**
   * Limpar jobs completos antigos
   */
  async cleanOldJobs(olderThanDays = 7) {
    try {
      const grace = olderThanDays * 24 * 60 * 60 * 1000 // dias para ms
      await tagQueue.clean(grace, 'completed')
      await tagQueue.clean(grace, 'failed')
      console.log(`🧹 Jobs antigos limpos (> ${olderThanDays} dias)`)
    } catch (error: any) {
      console.error('❌ Erro ao limpar jobs:', error)
    }
  },

  /**
   * Pausar fila (emergência)
   */
  async pauseQueue() {
    await tagQueue.pause()
    console.log('⏸️  Fila pausada')
  },

  /**
   * Retomar fila
   */
  async resumeQueue() {
    await tagQueue.resume()
    console.log('▶️  Fila retomada')
  },

  /**
   * Obter job específico por ID
   */
  async getJob(jobId: string) {
    return tagQueue.getJob(jobId)
  },

  /**
   * Retentar job falhado manualmente
   */
  async retryFailedJob(jobId: string) {
    const job = await tagQueue.getJob(jobId)
    if (job) {
      await job.retry()
      console.log(`🔄 Job ${jobId} re-adicionado à fila`)
      return { success: true, jobId }
    }
    return { success: false, error: 'Job not found' }
  },
}

// Log de inicialização
if (USE_REDIS) {
  console.log(`✅ Retry Queue inicializado com Redis (${REDIS_HOST}:${REDIS_PORT})`)
} else {
  console.log(`✅ Retry Queue inicializado em memória (desenvolvimento)`)
  console.warn(`⚠️  Para produção, configure REDIS e USE_REDIS=true`)
}

export default retryQueueService



