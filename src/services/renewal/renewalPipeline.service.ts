// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalPipeline.service.ts
// Orquestrador sequencial de renovações: Sync Hotmart (vendas) →
// Sync AC (leitura) → AC Expiração (escrita) → Discord Roles. Cada
// passo só arranca depois do anterior terminar — evita a fragilidade
// de horas fixas onde um passo demorado ("corre mais") parte a
// cadência dos seguintes. Um erro num passo não trava os seguintes
// (Promise.allSettled não é usado propositadamente — a ordem tem de
// ser respeitada — mas cada passo tem try/catch próprio para o
// pipeline continuar).
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
// O passo de escrita (AC Expiração) tem o SEU PRÓPRIO interruptor
// ("AcExpirationSync" em CronJobConfig), independente do interruptor
// geral deste pipeline — ligar o RenewalPipeline corre só as partes
// só-leitura (Hotmart, AC, Discord); a escrita na AC só acontece se
// esse segundo interruptor também estiver ligado. Mantém a regra
// "não escrever na AC" isolada e explícita, mesmo dentro da cadeia.
// ════════════════════════════════════════════════════════════

import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import { syncActiveStudentSalesHistory, SalesHistorySyncReport } from './hotmartSalesHistory.service'
import { syncActiveStudentAcRenewalData, AcRenewalDataSyncReport } from './acRenewalDataSync.service'
import { syncAcStudentTags, AcStudentTagsSyncReport } from './acStudentTagsSync.service'
import { syncAcExpirationDates, AcExpirationSyncReport } from './acExpirationSync.service'
import { reconcilePurchaseDates, ReconcileReport } from './acPurchaseDateReconcile.service'
import { gerarTimelinesEmLote, TimelineSyncReport } from './renewalTimeline.service'
import { runDiscordRolesSyncJob, DiscordCronReport } from './discordRolesSync.service'

const AC_EXPIRATION_SYNC_JOB_NAME = 'AcExpirationSync'

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
  runDiscordRolesSyncJob: typeof runDiscordRolesSyncJob
  gerarTimelinesEmLote: typeof gerarTimelinesEmLote
  reconcilePurchaseDates: typeof reconcilePurchaseDates
}

type CronJobConfigReadModel = { findOne: (...args: any[]) => any }
const CronJobConfigModel = CronJobConfig as unknown as CronJobConfigReadModel

async function isJobSwitchEnabled(jobName: string): Promise<boolean> {
  const doc = await CronJobConfigModel.findOne({ name: jobName })
    .select('schedule.enabled')
    .lean()
    .exec() as { schedule?: { enabled?: boolean } } | null
  return !!doc?.schedule?.enabled
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<RenewalPipelineStepResult<T>> {
  const start = Date.now()
  try {
    console.log(`[RenewalPipeline] ▶ ${label}`)
    const report = await fn()
    const durationMs = Date.now() - start
    console.log(`[RenewalPipeline] ✅ ${label} (${Math.round(durationMs / 1000)}s)`)
    return { success: true, durationMs, report }
  } catch (error: any) {
    const durationMs = Date.now() - start
    console.error(`[RenewalPipeline] ❌ ${label} falhou:`, error?.message || error)
    return { success: false, durationMs, error: error?.message || 'Erro desconhecido' }
  }
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
    console.log(`[RenewalPipeline] ⏭ ${label} — interruptor "${jobName}" desligado, a saltar`)
    return { success: true, skipped: true, durationMs: 0 }
  }
  return runStep(label, fn)
}

/**
 * Corre os 4 passos em sequência, cada um só depois do anterior terminar.
 * Um passo que falhe não impede os seguintes de correr (o próximo passo
 * simplesmente trabalha com os dados que já existem em BD).
 */
export async function runRenewalPipelineComDependencias(
  dependencias: RenewalPipelineDependencies
): Promise<RenewalPipelineReport> {
  const hotmartSales = await runStep('Sync Hotmart (vendas)', () => dependencias.syncActiveStudentSalesHistory())
  const acRenewalData = await runStep('Sync AC (leitura)', () => dependencias.syncActiveStudentAcRenewalData())
  const acStudentTags = await runStep('Sync AC (tags)', () => dependencias.syncAcStudentTags())
  const acExpiration = await runGatedStep(
    'AC Expiração (escrita)',
    AC_EXPIRATION_SYNC_JOB_NAME,
    () => dependencias.syncAcExpirationDates({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  )
  const discordRoles = await runStep('Discord Roles', () => dependencias.runDiscordRolesSyncJob())
  // Só faz sentido depois de os três espelhos estarem frescos.
  const timelines = await runStep('Timelines de renovação', () => dependencias.gerarTimelinesEmLote())
  // Compensação final: corrige o 334 depois de todas as leituras/timelines.
  const acPurchaseDate = await runGatedStep(
    'AC Data de compra (reconciliação)',
    AC_EXPIRATION_SYNC_JOB_NAME,
    () => dependencias.reconcilePurchaseDates({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  )

  return {
    hotmartSales,
    acRenewalData,
    acStudentTags,
    acExpiration,
    timelines,
    discordRoles,
    acPurchaseDate,
    success:
      hotmartSales.success &&
      acRenewalData.success &&
      acStudentTags.success &&
      acExpiration.success &&
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
    runDiscordRolesSyncJob,
    gerarTimelinesEmLote,
    reconcilePurchaseDates
  })
}

export default runRenewalPipeline
