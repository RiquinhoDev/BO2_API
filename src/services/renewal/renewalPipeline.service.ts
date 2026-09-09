// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalPipeline.service.ts
// Orquestrador sequencial de renovações: Sync Hotmart (vendas) →
// Sync AC (leitura) → AC Expiração/Tags/Reembolsos → Discord Roles. Cada
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
// Cada fase que escreve na AC tem o SEU PRÓPRIO interruptor
// (AcExpirationSync, AcTurmaTagSync e AcRefundHandler), independente do
// interruptor geral deste pipeline. Mantém a regra "não escrever na AC"
// isolada e explícita, mesmo dentro da cadeia.
// ════════════════════════════════════════════════════════════

import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import RenewalEvent from '../../models/renewal/RenewalEvent'
import { syncActiveStudentSalesHistory, SalesHistorySyncReport } from './hotmartSalesHistory.service'
import { syncActiveStudentAcRenewalData, AcRenewalDataSyncReport } from './acRenewalDataSync.service'
import { syncAcStudentTags, AcStudentTagsSyncReport } from './acStudentTagsSync.service'
import { syncAcExpirationDates, AcExpirationSyncReport } from './acExpirationSync.service'
import { syncTurmaTags, TurmaTagSyncReport } from './acTurmaTagSync.service'
import { handleRefunds, RefundHandlerReport } from './refundHandler.service'
import { gerarTimelinesEmLote, TimelineSyncReport } from './renewalTimeline.service'
import { runDiscordRolesSyncJob, DiscordCronReport } from './discordRolesSync.service'

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

/**
 * O que o espelho detectou e ainda ninguém tratou.
 *
 * É lido UMA vez, aqui, e distribuído pelas peças. Se cada uma fosse à
 * fila por sua conta, podiam discordar sobre o que é novo — e é a
 * discordância entre regras que temos vindo a apagar do sistema.
 */
interface FilaDeEventos {
  compras: Array<{ _id: unknown; userId: unknown }>
  reembolsos: Array<{ _id: unknown; transacao: string | null }>
}

const FILA_VAZIA: FilaDeEventos = { compras: [], reembolsos: [] }

async function lerFila(): Promise<FilaDeEventos> {
  const [compras, reembolsos] = await Promise.all([
    (RenewalEvent as any).find({ tipo: 'compra', 'tratado.tagTurma': null })
      .select('_id userId').lean().exec(),
    (RenewalEvent as any).find({ tipo: 'reembolso', 'tratado.reembolso': null })
      .select('_id transacao').lean().exec()
  ])
  return { compras: compras ?? [], reembolsos: reembolsos ?? [] }
}

/**
 * Marca a parte tratada. Só depois de o passo ter corrido bem: um passo
 * que rebentou a meio deixa a fila como estava e volta a ser tentado na
 * noite seguinte.
 */
async function marcarTratado(ids: unknown[], campo: 'tagTurma' | 'reembolso'): Promise<void> {
  if (!ids.length) return
  await (RenewalEvent as any).updateMany(
    { _id: { $in: ids } },
    { $set: { [`tratado.${campo}`]: new Date() } }
  )
}

export interface RenewalPipelineReport {
  hotmartSales: RenewalPipelineStepResult<SalesHistorySyncReport>
  acRenewalData: RenewalPipelineStepResult<AcRenewalDataSyncReport>
  acStudentTags: RenewalPipelineStepResult<AcStudentTagsSyncReport>
  acExpiration: RenewalPipelineStepResult<AcExpirationSyncReport>
  acTurmaTags: RenewalPipelineStepResult<TurmaTagSyncReport>
  acRefunds: RenewalPipelineStepResult<RefundHandlerReport>
  timelines: RenewalPipelineStepResult<TimelineSyncReport>
  /** Quantos acontecimentos o espelho trouxe para esta corrida. */
  fila: { compras: number; reembolsos: number }
  discordRoles: RenewalPipelineStepResult<DiscordCronReport>
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
  lerFila: typeof lerFila
  marcarTratado: typeof marcarTratado
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
  // Depois dos espelhos, porque é o sync das vendas que enche a fila.
  const fila = await dependencias.lerFila().catch(() => FILA_VAZIA)

  const acExpiration = await runGatedStep(
    'AC Expiração (escrita)',
    AC_EXPIRATION_SYNC_JOB_NAME,
    () => dependencias.syncAcExpirationDates({ dryRun: false }),
    dependencias.isJobSwitchEnabled
  )
  const acTurmaTags = await runGatedStep(
    'AC Tags de turma',
    AC_TURMA_TAG_SYNC_JOB_NAME,
    () => dependencias.syncTurmaTags({
      dryRun: false,
      userIds: fila.compras.map((evento) => String(evento.userId))
    }),
    dependencias.isJobSwitchEnabled
  )
  const acRefunds = await runGatedStep(
    'Reembolsos',
    AC_REFUND_HANDLER_JOB_NAME,
    () => dependencias.handleRefunds({
      dryRun: false,
      transacoes: fila.reembolsos.map((evento) => String(evento.transacao ?? ''))
    }),
    dependencias.isJobSwitchEnabled
  )
  // Quem está na genérica ainda vai receber tag quando for movido para a
  // turma verdadeira, semanas depois da compra. Fechar-lhe o acontecimento
  // agora deixava-o sem tag para sempre: a mudança de turma não gera venda
  // nova, logo não gera acontecimento nenhum.
  const aEsperar = new Set((acTurmaTags.report?.aindaAEsperar ?? []).map(String))
  const comprasAFechar = fila.compras.filter((evento) => !aEsperar.has(String(evento.userId)))
  if (acTurmaTags.success && !acTurmaTags.skipped && comprasAFechar.length) {
    await dependencias.marcarTratado(comprasAFechar.map((e) => e._id), 'tagTurma').catch(() => undefined)
  }
  if (acRefunds.success && !acRefunds.skipped && fila.reembolsos.length) {
    await dependencias.marcarTratado(fila.reembolsos.map((e) => e._id), 'reembolso').catch(() => undefined)
  }

  const discordRoles = await runStep('Discord Roles', () => dependencias.runDiscordRolesSyncJob())
  // Só faz sentido depois de os três espelhos estarem frescos.
  const timelines = await runStep('Timelines de renovação', () => dependencias.gerarTimelinesEmLote())

  return {
    hotmartSales,
    acRenewalData,
    acStudentTags,
    acExpiration,
    acTurmaTags,
    acRefunds,
    timelines,
    discordRoles,
    fila: { compras: fila.compras.length, reembolsos: fila.reembolsos.length },
    success:
      hotmartSales.success &&
      acRenewalData.success &&
      acStudentTags.success &&
      acExpiration.success &&
      acTurmaTags.success &&
      acRefunds.success &&
      timelines.success &&
      discordRoles.success
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
    lerFila,
    marcarTratado
  })
}

export default runRenewalPipeline
