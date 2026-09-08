// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalPipeline.service.ts
// Orquestrador sequencial de renovações: Sync Hotmart (vendas) →
// Sync AC (leitura) → AC Expiração/Tags/Reembolsos → Discord Roles. Cada
// passo só arranca depois do anterior terminar — evita a fragilidade
// de horas fixas onde um passo demorado ("corre mais") parte a
// cadência dos seguintes. Falha num espelho bloqueia as fases que
// dependem desses dados; Discord continua independente. Cada passo tem
// try/catch próprio para produzir um relatório honesto.
//
// Chamado a partir de dailyPipeline.service.ts (o "1º"), logo a
// seguir a este terminar de facto — não a uma hora fixa que assume
// quanto tempo o "1º" costuma demorar (o "1º" pode variar de
// duração de dia para dia). SEM TRIGGER PRÓPRIO no scheduler (ver
// scheduleJob() em scheduler.ts) — o registo "RenewalPipeline" em
// CronJobConfig serve só de interruptor + histórico de execuções
// manuais. NASCE DESLIGADO — ligar é acção manual na UI, só depois
// de validar localmente.
//
// Cada fase que escreve na AC tem o SEU PRÓPRIO interruptor
// (AcExpirationSync, AcTurmaTagSync e AcRefundHandler), independente do
// interruptor geral deste pipeline. Mantém a regra "não escrever na AC"
// isolada e explícita, mesmo dentro da cadeia.
// ════════════════════════════════════════════════════════════

import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import { syncActiveStudentSalesHistory, SalesHistorySyncReport } from './hotmartSalesHistory.service'
import { syncActiveStudentAcRenewalData, AcRenewalDataSyncReport } from './acRenewalDataSync.service'
import { syncAcStudentTags, AcStudentTagsSyncReport } from './acStudentTagsSync.service'
import { syncAcExpirationDates, AcExpirationSyncReport } from './acExpirationSync.service'
import { reconcilePurchaseDates, ReconcileReport } from './acPurchaseDateReconcile.service'
import { syncTurmaTags, TurmaTagSyncReport } from './acTurmaTagSync.service'
import { handleRefunds, RefundHandlerReport } from './refundHandler.service'
import { gerarTimelinesEmLote, TimelineSyncReport } from './renewalTimeline.service'
import { runDiscordRolesSyncJob, DiscordCronReport } from './discordRolesSync.service'
import logger from '../../utils/logger'

const AC_EXPIRATION_SYNC_JOB_NAME = 'AcExpirationSync'
const AC_TURMA_TAG_SYNC_JOB_NAME = 'AcTurmaTagSync'
const AC_REFUND_HANDLER_JOB_NAME = 'AcRefundHandler'

export interface RenewalPipelineStepResult<T> {
  success: boolean
  skipped?: boolean
  durationMs: number
  report?: T
  error?: string
}

export interface RenewalPipelineReport {
  hotmartSales: RenewalPipelineStepResult<SalesHistorySyncReport>
  acRenewalData: RenewalPipelineStepResult<AcRenewalDataSyncReport>
  acStudentTags: RenewalPipelineStepResult<AcStudentTagsSyncReport>
  acExpiration: RenewalPipelineStepResult<AcExpirationSyncReport>
  acTurmaTags: RenewalPipelineStepResult<TurmaTagSyncReport>
  acRefunds: RenewalPipelineStepResult<RefundHandlerReport>
  timelines: RenewalPipelineStepResult<TimelineSyncReport>
  discordRoles: RenewalPipelineStepResult<DiscordCronReport>
  acPurchaseDate: RenewalPipelineStepResult<ReconcileReport>
  success: boolean
}

export interface RenewalPipelineDependencies {
  isJobSwitchEnabled: (jobName: string) => Promise<boolean>
  syncActiveStudentSalesHistory: typeof syncActiveStudentSalesHistory
  syncActiveStudentAcRenewalData: typeof syncActiveStudentAcRenewalData
  syncAcStudentTags: typeof syncAcStudentTags
  syncAcExpirationDates: typeof syncAcExpirationDates
  syncTurmaTags: typeof syncTurmaTags
  handleRefunds: typeof handleRefunds
  runDiscordRolesSyncJob: typeof runDiscordRolesSyncJob
  gerarTimelinesEmLote: typeof gerarTimelinesEmLote
  reconcilePurchaseDates: typeof reconcilePurchaseDates
}

async function isJobSwitchEnabled(jobName: string): Promise<boolean> {
  const doc = await CronJobConfig.findOne({ name: jobName })
    .select('schedule.enabled')
    .lean()
    .exec() as { schedule?: { enabled?: boolean } } | null
  return !!doc?.schedule?.enabled
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<RenewalPipelineStepResult<T>> {
  const start = Date.now()
  try {
    logger.info(`[RenewalPipeline] ▶ ${label}`)
    const report = await fn()
    const durationMs = Date.now() - start
    const record = report as Record<string, unknown> | null
    const failed = !!record && (
      record.success === false
      || (Array.isArray(record.errors) && record.errors.length > 0)
      || (Array.isArray(record.erros) && record.erros.length > 0)
      || (typeof record.erros === 'number' && record.erros > 0)
    )
    if (failed) return { success: false, durationMs, report, error: `${label} devolveu falhas` }
    logger.info(`[RenewalPipeline] ✅ ${label} (${Math.round(durationMs / 1000)}s)`)
    return { success: true, durationMs, report }
  } catch (error: unknown) {
    const durationMs = Date.now() - start
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    logger.error(`[RenewalPipeline] ❌ ${label} falhou:`, error)
    return { success: false, durationMs, error: message }
  }
}

function blockedStep<T>(dependency: string): RenewalPipelineStepResult<T> {
  return { success: false, skipped: true, durationMs: 0, error: `Dependência incompleta: ${dependency}` }
}

/**
 * Como runStep, mas só corre `fn` se o interruptor `jobName` estiver
 * ligado na BD — usado para o passo de escrita (AC Expiração), que
 * precisa do seu próprio "sim" independente do interruptor geral.
 */
async function runGatedStep<T>(
  label: string,
  jobName: string,
  fn: () => Promise<T>,
  jobSwitchEnabled: (name: string) => Promise<boolean> = isJobSwitchEnabled
): Promise<RenewalPipelineStepResult<T>> {
  const enabled = await jobSwitchEnabled(jobName)
  if (!enabled) {
    logger.info(`[RenewalPipeline] ⏭ ${label} — interruptor "${jobName}" desligado, a saltar`)
    return { success: true, skipped: true, durationMs: 0 }
  }
  return runStep(label, fn)
}

/**
 * Corre os passos em sequência, cada um só depois do anterior terminar.
 * Um passo que falhe não impede os seguintes de correr (o próximo passo
 * simplesmente trabalha com os dados que já existem em BD).
 */
export async function runRenewalPipelineComDependencias(
  dependencias: RenewalPipelineDependencies
): Promise<RenewalPipelineReport> {
  const hotmartSales = await runStep('Sync Hotmart (vendas)', () => dependencias.syncActiveStudentSalesHistory())
  const acRenewalData = await runStep('Sync AC (leitura)', () => dependencias.syncActiveStudentAcRenewalData())
  const acStudentTags = await runStep('Sync AC (tags)', () => dependencias.syncAcStudentTags())
  const mirrorsReady = hotmartSales.success && acRenewalData.success && acStudentTags.success
  const acExpiration = mirrorsReady ? await runGatedStep(
    'AC Expiração (escrita)',
    AC_EXPIRATION_SYNC_JOB_NAME,
    () => dependencias.syncAcExpirationDates({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  ) : blockedStep<AcExpirationSyncReport>('espelhos Hotmart/AC')
  const acTurmaTags = mirrorsReady ? await runGatedStep(
    'AC Tags de turma',
    AC_TURMA_TAG_SYNC_JOB_NAME,
    () => dependencias.syncTurmaTags({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  ) : blockedStep<TurmaTagSyncReport>('espelhos Hotmart/AC')
  const acRefunds = mirrorsReady ? await runGatedStep(
    'Reembolsos',
    AC_REFUND_HANDLER_JOB_NAME,
    () => dependencias.handleRefunds({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  ) : blockedStep<RefundHandlerReport>('espelhos Hotmart/AC')
  const discordRoles = await runStep('Discord Roles', () => dependencias.runDiscordRolesSyncJob())
  // Só faz sentido depois de os três espelhos estarem frescos.
  const timelines = mirrorsReady
    ? await runStep('Timelines de renovação', () => dependencias.gerarTimelinesEmLote())
    : blockedStep<TimelineSyncReport>('espelhos Hotmart/AC')
  // Compensação final: corrige o 334 depois de todas as leituras/timelines.
  const acPurchaseDate = mirrorsReady && timelines.success ? await runGatedStep(
    'AC Data de compra (reconciliação)',
    AC_EXPIRATION_SYNC_JOB_NAME,
    () => dependencias.reconcilePurchaseDates({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  ) : blockedStep<ReconcileReport>('espelhos/timeline')

  return {
    hotmartSales,
    acRenewalData,
    acStudentTags,
    acExpiration,
    acTurmaTags,
    acRefunds,
    timelines,
    discordRoles,
    acPurchaseDate,
    success:
      hotmartSales.success &&
      acRenewalData.success &&
      acStudentTags.success &&
      acExpiration.success &&
      acTurmaTags.success &&
      acRefunds.success &&
      timelines.success &&
      discordRoles.success &&
      acPurchaseDate.success
  }
}

export async function runRenewalPipeline(): Promise<RenewalPipelineReport> {
  return runRenewalPipelineComDependencias({
    isJobSwitchEnabled,
    syncActiveStudentSalesHistory,
    syncActiveStudentAcRenewalData,
    syncAcStudentTags,
    syncAcExpirationDates,
    syncTurmaTags,
    handleRefunds,
    runDiscordRolesSyncJob,
    gerarTimelinesEmLote,
    reconcilePurchaseDates
  })
}

export default runRenewalPipeline
