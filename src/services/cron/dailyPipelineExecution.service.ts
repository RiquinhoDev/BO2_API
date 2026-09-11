// ════════════════════════════════════════════════════════════
// 📁 src/services/cron/dailyPipelineExecution.service.ts
// O "1º" — sincronizar as plataformas e recalcular o engagement.
//
// ⚠️ NÃO CONFUNDIR COM O SISTEMA DE RENOVAÇÕES.
//
// São dois sistemas separados, e é importante que continuem a sê-lo:
//
//   ESTE       lê a Hotmart e a CursEduca para a nossa BD, e recalcula
//              métricas. Não aplica nem remove tags a ninguém.
//
//   RENOVAÇÕES `renewalPipeline.service.ts`. Trata só de compras,
//              renovações e reembolsos do OGI, e só a quem tem um
//              acontecimento por tratar. Tem os seus interruptores.
//
// Em Janeiro de 2026 foi parado um terceiro sistema, o motor de regras
// que aplicava tags a todos os alunos. Os passos 5 (Tag Rules) e 6
// (Testimonial Tags) eram ele, e foram retirados daqui a 11/09/2026 —
// estavam desligados mas voltavam a correr se alguém ligasse o "1º".
// Não regressa, e não se confunde com as renovações.
// ════════════════════════════════════════════════════════════

import { Product, UserProduct, PipelineExecution } from '../../models'
import logger from '../../utils/logger'
import { DailyPipelineResult } from '../../types/cron.types'
import { hasPipelineReferences, type PipelineUserProduct } from './dailyPipelineSupport'
import { executeSyncAndPreparationSteps } from './dailyPipelineSyncSteps'

export async function executeDailyPipeline(): Promise<DailyPipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []

  const startTimestamp = new Date().toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
  logger.info('â”'.repeat(60))
  logger.info(`ðŸš€ PIPELINE DIÃRIO - InÃ­cio: ${startTimestamp}`)
  logger.info('â”'.repeat(60))

  const result: DailyPipelineResult = {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      preCreateTags: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} },
      syncTestimonialTags: { success: false, duration: 0, stats: {} }
    },
    errors: [],
    summary: {
      totalUsers: 0,
      totalUserProducts: 0,
      engagementUpdated: 0,
      tagsApplied: 0
    }
  }

  try {
    await executeSyncAndPreparationSteps(result, errors)

    // Os passos 5 (Tag Rules) e 6 (Testimonial Tags) foram retirados a
    // 11/09/2026. Eram o motor de regras de tags de Janeiro: o 5 percorria
    // TODOS os UserProducts a aplicar e a REMOVER tags, o 6 fazia o mesmo
    // para os testemunhos. O sistema foi desactivado e nao volta.
    //
    // Os snapshots PRE/POST sairam com eles: so existiam para medir o que o
    // passo 5 tinha mexido.
    //
    // Quem trata de tags agora e o RenewalPipeline, la em baixo, e so a quem
    // tem um acontecimento por tratar — ver renewalPipeline.service.ts.

    // FINALIZAR
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = errors

    const durationMin = Math.floor(result.duration / 60)
    const durationSec = result.duration % 60
    const endTimestamp = new Date().toLocaleString('pt-PT', {
      dateStyle: 'short',
      timeStyle: 'short'
    })

    logger.info('â”'.repeat(60))

    if (result.success) {
      logger.info('ðŸŽ‰ PIPELINE COMPLETO COM SUCESSO')
    } else {
      logger.warn('âš ï¸  PIPELINE COMPLETO COM ERROS')
    }

    logger.info(`Fim: ${endTimestamp} | DuraÃ§Ã£o: ${durationMin}min ${durationSec}s`)
    logger.info('')
    logger.info('ðŸ“Š RESUMO:')
    logger.info(`   STEP 1 - Hotmart:           ${result.steps.syncHotmart.duration}s | ${result.steps.syncHotmart.stats?.total || 0} users`)
    logger.info(`   STEP 2 - CursEduca:         ${result.steps.syncCursEduca.duration}s | ${result.steps.syncCursEduca.stats?.total || 0} users`)
    logger.info(`   STEP 3 - Pre-create:        ${result.steps.preCreateTags.duration}s | ${result.steps.preCreateTags.stats?.totalTags || 0} tags`)
    logger.info(`   STEP 4 - Engagement:        ${result.steps.recalcEngagement.duration}s | ${result.steps.recalcEngagement.stats?.updated || 0} atualizados`)
    logger.info('')
    logger.info(`ðŸ“ˆ Total: ${result.summary.totalUsers} users | ${result.summary.totalUserProducts} UserProducts | ${result.summary.tagsApplied} tags aplicadas`)

    if (errors.length > 0) {
      logger.info('')
      logger.error(`âŒ ERROS (${errors.length}):`)
      errors.forEach((err, i) => logger.error(`   ${i + 1}. ${err}`))
    }

    logger.info('â”'.repeat(60))

    // Salvar histÃ³rico de execuÃ§Ã£o
    try {
      await PipelineExecution.create({
        executionType: 'automatic',
        status: result.success ? 'success' : (errors.length > 0 ? 'partial' : 'failed'),
        startTime: new Date(startTime),
        endTime: result.completedAt,
        duration: result.duration,
        steps: result.steps,
        summary: result.summary,
        errorMessages: result.errors,
        triggeredBy: 'CRON'
      })
      logger.info('ðŸ’¾ HistÃ³rico salvo')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`âŒ Erro ao salvar histÃ³rico: ${message}`)
    }

    // O RenewalPipeline tinha aqui um gancho: o "1º" lia-lhe o interruptor
    // e corria-o no fim. Saiu a 11/09/2026, porque tornava um sistema
    // passageiro do outro — as renovações só andavam se o "1º" andasse.
    //
    // Agora tem cron próprio, registado pelo agendador como qualquer outro
    // job. Ver renewalPipeline.service.ts.

    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = [...errors, `Pipeline fatal: ${message}`]

    logger.error('â”'.repeat(60))
    logger.error('âŒ PIPELINE FALHOU COMPLETAMENTE')
    logger.error(`Erro: ${message}`)
    logger.error('â”'.repeat(60))

    return result
  }
}
