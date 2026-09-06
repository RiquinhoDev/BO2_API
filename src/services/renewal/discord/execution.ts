import logger from '../../../utils/logger'
import axios from 'axios'
import mongoose from 'mongoose'
import { HttpError } from '../../../security/errorHandling'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import CronJobConfig from '../../../models/SyncModels/CronJobConfig'
import {
  compositeExecutionFingerprint,
  runCompositeExecutionWithReceipt,
} from '../../cron/compositeExecution.service'
import {
  cronManualFingerprintPayload,
  getCronManualCapability,
  type CronManualCapabilityJob,
} from '../../cron/scheduler/manualCapabilities'
import {
  DiscordMessageTemplate,
  DiscordRoleChange,
  DiscordRoleState,
  IDiscordRoleChange
} from '../../../models/discordRenewal'
import {
  APPROVED_TTL_HOURS,
  botHeaders,
  botUrl,
  configuredBotUrl,
  getDefaultMessageChannelId,
  getMessageChannels,
  isMessagesEnabled,
  isRolesManualExecutionEnabled,
  isRolesAutoExecuteEnabled,
  isRolesSyncEnabled,
  maxOpsPerRun,
  PLANNED_TTL_HOURS,
  RENEWAL_ROLES,
  ROLE_NAME_BY_ID,
  expireStaleRoleChanges,
} from './planning'
import {
  executeDiscordMessageReceipt,
  type DiscordMessageExecutionContext,
} from './discordMessageExecution.service'
import type { DiscordMessageExecutionOperation } from '../../../models/DiscordMessageExecutionReceipt'
import {
  discordMessageIdentity,
  performDiscordMessage,
  prepareDiscordMessage,
  type DiscordMessageSendParams,
  type DiscordMessageSendResult,
} from './discordMessageTransport.service'

interface DiscordRoleApplyResult {
  discordUserId: string
  ok: boolean
  error?: string
  notInGuild?: boolean
}

interface DiscordRoleApplyResponse {
  results?: DiscordRoleApplyResult[]
}

interface DiscordBotHealth {
  ok?: boolean
  error?: string | number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

function responseMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const data: unknown = error.response?.data
  if (typeof data !== 'object' || data === null || !('message' in data)) return undefined
  return typeof data.message === 'string' ? data.message : undefined
}

function beforeLocalMutation(phaseHooks?: CronExecutionPhaseHooks): void {
  phaseHooks?.assertOwnership?.()
  phaseHooks?.localMutationStarted()
}

function beforeProviderWrite(phaseHooks?: CronExecutionPhaseHooks): void {
  phaseHooks?.assertOwnership?.()
  phaseHooks?.providerStarted()
}

function afterProviderWrite(phaseHooks?: CronExecutionPhaseHooks): void {
  phaseHooks?.assertOwnership?.()
  phaseHooks?.providerSucceeded()
}

export async function preflightRoleExecutionCapacity(projectedPlanned: number): Promise<void> {
  const cap = maxOpsPerRun()
  const candidates = await DiscordRoleChange.find({ status: { $in: ['APPROVED', 'PLANNED'] } })
    .sort({ status: 1, plannedAt: 1, _id: 1 })
    .limit(cap + 1)
    .select('_id')
    .lean()
    .exec()
  if (candidates.length + Math.max(0, projectedPlanned) > cap) {
    throw new HttpError({
      status: 413,
      code: 'DISCORD_ROLES_EXECUTION_CAP_EXCEEDED',
      publicMessage: 'Execução Discord excede o limite por operação',
    })
  }
}

export async function approveRoleChanges(ids: string[], approvedBy: string): Promise<number> {
  const res = await DiscordRoleChange.updateMany(
    { _id: { $in: ids }, status: 'PLANNED' },
    { $set: { status: 'APPROVED', approvedAt: new Date(), approvedBy } }
  )
  return res.modifiedCount || 0
}

export interface DiscordExecuteReport {
  attempted: number
  applied: number
  notInGuild: number
  failed: number
  leftForNextRun: number
  masterEnabled: boolean
}

const BOT_BATCH_SIZE = 20

export async function executeDiscordRolesPlan(options: {
  includePlanned?: boolean
  batchId?: string
  limit?: number
  executedBy: string
  strictCap?: boolean
  phaseHooks?: CronExecutionPhaseHooks
  requestId?: string
  actorId?: string
}): Promise<DiscordExecuteReport> {
  if (options.requestId) {
    const job = await CronJobConfig.findOne({ name: 'DiscordRolesSync' }) as unknown as CronManualCapabilityJob | null
    if (!job) {
      throw new HttpError({ status: 404, code: 'CRON_JOB_NOT_FOUND', publicMessage: 'Job DiscordRolesSync não encontrado' })
    }
    const capability = getCronManualCapability(job)
    if (capability.status === 'blocked') {
      throw new HttpError({ status: 503, code: 'CRON_JOB_CAPABILITY_BLOCKED', publicMessage: capability.blockedReason || 'Capability manual bloqueada' })
    }
    if (!isRolesManualExecutionEnabled()) {
      throw new HttpError({ status: 503, code: 'DISCORD_ROLES_MANUAL_EXECUTION_DISABLED', publicMessage: 'Execução manual dos cargos Discord desativada' })
    }
    const actorId = options.actorId || options.executedBy
    const fingerprint = compositeExecutionFingerprint(actorId, {
      ...cronManualFingerprintPayload(job),
      entryPoint: 'discord-renewal-execute',
      includePlanned: options.includePlanned === true,
      batchId: options.batchId || null,
      limit: options.limit || null,
    })
    return runCompositeExecutionWithReceipt({
      operation: capability.operation,
      identity: capability.identity(job),
      actorId,
      fingerprint,
      requestId: options.requestId,
      run: phaseHooks => executeDiscordRolesPlan({ ...options, requestId: undefined, strictCap: true, phaseHooks }),
    })
  }

  return executeDiscordRolesPlanInternal(options)
}

async function executeDiscordRolesPlanInternal(options: {
  includePlanned?: boolean
  batchId?: string
  limit?: number
  executedBy: string
  strictCap?: boolean
  phaseHooks?: CronExecutionPhaseHooks
}): Promise<DiscordExecuteReport> {
  const report: DiscordExecuteReport = {
    attempted: 0,
    applied: 0,
    notInGuild: 0,
    failed: 0,
    leftForNextRun: 0,
    masterEnabled: isRolesSyncEnabled()
  }

  if (!isRolesSyncEnabled()) {
    logger.info('⛔ [DiscordRoles] DISCORD_ROLES_SYNC_ENABLED != true — execução recusada')
    return report
  }

  if (options.strictCap) await preflightRoleExecutionCapacity(0)
  await expireStaleRoleChanges(options.phaseHooks)

  const statuses: Array<IDiscordRoleChange['status']> = options.includePlanned
    ? ['APPROVED', 'PLANNED']
    : ['APPROVED']
  const query: mongoose.FilterQuery<IDiscordRoleChange> = { status: { $in: statuses } }
  if (options.batchId) query.planBatchId = options.batchId

  const requested = Number(options.limit)
  const cap = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), maxOpsPerRun())
    : maxOpsPerRun()
  const candidates = await DiscordRoleChange.find(query)
    .sort({ status: 1, plannedAt: 1, _id: 1 })
    .limit(cap + 1)
    .exec()

  const toRun = candidates.slice(0, cap)
  report.leftForNextRun = Math.max(0, candidates.length - toRun.length)

  for (let i = 0; i < toRun.length; i += BOT_BATCH_SIZE) {
    const batch = toRun.slice(i, i + BOT_BATCH_SIZE)
    report.attempted += batch.length

    let results: DiscordRoleApplyResult[] = []
    try {
      beforeProviderWrite(options.phaseHooks)
      const resp = await axios.post<DiscordRoleApplyResponse>(
        `${botUrl()}/renewal/roles/apply`,
        {
          operations: batch.map((c) => ({
            discordUserId: c.discordUserId,
            addRoleIds: c.payload.addRoleId ? [c.payload.addRoleId] : [],
            removeRoleIds: c.payload.removeRoleIds || []
          }))
        },
        { headers: botHeaders(), timeout: 120000 }
      )
      results = Array.isArray(resp.data.results) ? resp.data.results : []
      const resultByAccount = new Map(results.map((r) => [String(r.discordUserId), r]))
      if (results.length !== batch.length || resultByAccount.size !== batch.length
        || batch.some((change) => !resultByAccount.has(String(change.discordUserId)))) {
        throw new Error('resultado completo do bot indisponível')
      }
      afterProviderWrite(options.phaseHooks)
    } catch (error: unknown) {
      const msg = `Chamada ao bot falhou: ${errorStatus(error) || ''} ${errorMessage(error)}`
      logger.error(`❌ [DiscordRoles] ${msg}`)
      if (options.phaseHooks) throw error
      beforeLocalMutation(options.phaseHooks)
      await DiscordRoleChange.updateMany(
        { _id: { $in: batch.map((c) => c._id) } },
        { $set: { status: 'FAILED', error: msg }, $inc: { attempts: 1 } }
      )
      report.failed += batch.length
      break
    }

    const resultByAccount = new Map(results.map((r) => [String(r.discordUserId), r]))
    for (const change of batch) {
      const r = resultByAccount.get(String(change.discordUserId))
      if (r?.ok) {
        beforeLocalMutation(options.phaseHooks)
        await DiscordRoleChange.updateOne(
          { _id: change._id },
          { $set: { status: 'APPLIED', appliedAt: new Date() }, $inc: { attempts: 1 } }
        )
        if (change.payload.addRoleId) {
          beforeLocalMutation(options.phaseHooks)
          await DiscordRoleState.updateOne(
            { discordUserId: change.discordUserId },
            {
              $set: {
                userId: change.userId,
                email: change.email,
                roleId: change.payload.addRoleId,
                roleName: change.payload.addRoleName || ROLE_NAME_BY_ID.get(change.payload.addRoleId) || '',
                appliedAt: new Date(),
                lastChangeId: String(change._id)
              }
            },
            { upsert: true }
          )
        } else {
          beforeLocalMutation(options.phaseHooks)
          await DiscordRoleState.deleteOne({ discordUserId: change.discordUserId })
        }
        report.applied += 1
      } else if (r?.notInGuild) {
        beforeLocalMutation(options.phaseHooks)
        await DiscordRoleChange.updateOne(
          { _id: change._id },
          { $set: { status: 'BLOCKED', notInGuild: true, blockedReason: 'Membro não está no servidor Discord' }, $inc: { attempts: 1 } }
        )
        report.notInGuild += 1
      } else {
        beforeLocalMutation(options.phaseHooks)
        await DiscordRoleChange.updateOne(
          { _id: change._id },
          { $set: { status: 'FAILED', error: r?.error || 'sem resultado do bot' }, $inc: { attempts: 1 } }
        )
        report.failed += 1
      }
    }
  }

  logger.info(`✅ [DiscordRoles] Execução: ${report.applied} aplicadas, ${report.notInGuild} fora do servidor, ${report.failed} falhas, ${report.leftForNextRun} para o próximo run`)
  return report
}

const DEFAULT_TEMPLATES: Array<{ key: string; name: string; content: string }> = [
  {
    key: 'aviso-importante',
    name: 'Aviso importante (início do período de tolerância)',
    content: `Aviso importante — {cargos}

Olá aos alunos das turmas mencionadas 👋

Queria falar diretamente com vocês cujo acesso a'O Grande Investimento terminou no dia {dataFim}.

Sabemos que às vezes estas coisas ficam para segundo plano, a vida é corrida, há sempre muita coisa a acontecer. Por isso, em vez de remover tudo de uma vez, decidimos dar-vos mais alguns dias com acesso à comunidade Os Riquinhos. Porque acreditamos que quem chegou até aqui merece ter tempo para decidir com calma.

Esta comunidade não é só um grupo online. É o sítio onde partilham dúvidas, acompanham o mercado em tempo real, aprendem com os outros e se mantêm focados numa jornada que, cá fora, quase ninguém valoriza. Perder isso de um dia para o outro é perder uma das ferramentas mais importantes que têm.

Após este período, o acesso será removido e só ficarão disponíveis alguns canais abertos:

🤡#memes
🍺#conversas-de-amigos
🎉#convívios
🌱#riquinho-solidário
💌#testemunhos
📢#eventos-economicos
📰#discussão-de-notícias
📊#infográficos

Se quiserem continuar com o curso completo, as aulas, as lives, podes fazê-lo através do e-mail com o link de renovação que recebeste, ou então fala connosco e vamos te ajudar como sempre.

Qualquer dúvida, estamos por aqui. 🙏💛`
  },
  {
    key: 'ultimo-dia',
    name: 'Último dia (despedida / última chamada)',
    content: `⏳ Hoje é o último dia — {cargos}

Não queria deixar o dia passar sem vos dizer isto.

Hoje é o último dia de acesso à comunidade Os Riquinhos para quem ainda não renovou. À meia-noite, o acesso é removido.

Acompanhei muitos de vocês ao longo deste tempo. Vi perguntas que começaram tímidas e se tornaram análises sólidas. Vi pessoas que chegaram sem saber nada sobre investimentos e que hoje tomam decisões com confiança. Isso não se apaga e é algo de que se devem orgulhar.

Mas há uma diferença enorme entre continuar a crescer com apoio, com curso, aulas, lives e uma comunidade ativa e tentar fazê-lo sozinhos lá fora. E é por isso que não quero que saiam sem perceberem o que estão realmente a deixar para trás.

Se quiserem ficar, ainda estão a tempo podes fazê-lo através do e-mail com o link de renovação que recebeste, ou então fala connosco e vamos te ajudar como sempre.

Seja qual for a vossa decisão, foi um privilégio ter-vos aqui.💛`
  }
]

export async function ensureDefaultTemplates(): Promise<void> {
  for (const t of DEFAULT_TEMPLATES) {
    await DiscordMessageTemplate.updateOne(
      { key: t.key },
      { $setOnInsert: { key: t.key, name: t.name, content: t.content } },
      { upsert: true }
    )
  }
}

export { renderMessage } from './discordMessageTransport.service'

export interface DiscordMessageSendOptions {
  operation?: DiscordMessageExecutionOperation
  identity?: string
  heartbeatMs?: number
  now?: () => Date
  afterProviderSuccess?: (context: DiscordMessageExecutionContext) => Promise<void>
  beforeProviderAttempt?: () => void
}

export async function sendDiscordMessage(
  params: DiscordMessageSendParams,
  requestId?: string,
  options: DiscordMessageSendOptions = {},
): Promise<DiscordMessageSendResult> {
  if (!requestId) {
    const prepared = prepareDiscordMessage(params)
    if (!prepared.success) return prepared
    return performDiscordMessage(
      prepared.message,
      undefined,
      options.afterProviderSuccess,
      options.beforeProviderAttempt,
    )
  }

  const execution = await executeDiscordMessageReceipt({
    operation: options.operation ?? 'manual-send',
    identity: options.identity ?? discordMessageIdentity(params),
    requestId,
    heartbeatMs: options.heartbeatMs,
    now: options.now,
    run: async (context) => {
      const prepared = prepareDiscordMessage(params)
      if (!prepared.success) {
        context.provider.notAttempted()
        context.provider.retryableFailure()
        return prepared
      }
      return performDiscordMessage(
        prepared.message,
        context,
        options.afterProviderSuccess,
        options.beforeProviderAttempt,
      )
    },
  })
  if (execution.kind === 'completed' || execution.kind === 'replay' || execution.kind === 'failed') {
    return execution.result
  }
  if (execution.kind === 'in-progress') {
    return { success: false, kind: 'in-progress', message: 'Mensagem Discord já está em processamento' }
  }
  if (execution.kind === 'request-id-reused') {
    return { success: false, kind: 'request-id-reused', message: 'X-Request-ID já foi usado noutro payload' }
  }
  return {
    success: false,
    kind: 'indeterminate',
    message: 'Resultado da mensagem Discord ficou indeterminado; requer reconciliação',
  }
}

export async function getDiscordRenewalStatus() {
  const byStatus = await DiscordRoleChange.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
  const counts: Record<string, number> = {}
  for (const row of byStatus) counts[row._id] = row.n

  const statesCount = await DiscordRoleState.countDocuments({})
  const lastPlanned = await DiscordRoleChange.findOne({}).sort({ plannedAt: -1 }).select('planBatchId plannedAt').lean().exec() as { planBatchId?: string; plannedAt?: Date } | null

  const configuredUrl = configuredBotUrl()
  let botHealth: DiscordBotHealth = { ok: false, error: 'DISCORD_NOT_CONFIGURED' }
  if (configuredUrl) {
    try {
      const resp = await axios.get<DiscordBotHealth>(`${configuredUrl}/renewal/health`, { headers: botHeaders(), timeout: 8000 })
      botHealth = resp.data
    } catch (error: unknown) {
      botHealth = { ok: false, error: errorStatus(error) || errorMessage(error) }
    }
  }

  return {
    switches: {
      rolesSyncEnabled: isRolesSyncEnabled(),
      rolesAutoExecute: isRolesAutoExecuteEnabled(),
      messagesEnabled: isMessagesEnabled()
    },
    config: {
      botUrl: configuredUrl,
      maxOpsPerRun: maxOpsPerRun(),
      defaultChannelId: getDefaultMessageChannelId() || null,
      channels: getMessageChannels(),
      roles: RENEWAL_ROLES
    },
    counts,
    appliedStates: statesCount,
    lastPlanBatchId: lastPlanned?.planBatchId || null,
    lastPlannedAt: lastPlanned?.plannedAt || null,
    botHealth
  }
}
