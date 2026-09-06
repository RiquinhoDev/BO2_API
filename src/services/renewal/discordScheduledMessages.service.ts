// src/services/renewal/discordScheduledMessages.service.ts
// Mensagens agendadas de renovação — plano na secção 12 do docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md.
//
// Cadência (confirmada pelo João 2026-07-11): a turma cujo acesso terminou no fim do mês M
// tem o cargo R.{M}; a janela de renovação são os 15 dias de M+1. Cada dia tem a SUA mensagem:
//   dia 8 de M+1  → lembrete       → menciona @R.{M}   (template 'aviso-importante')
//   dia 15 de M+1 → último aviso   → menciona @R.{M}   (template 'ultimo-dia')
// Na noite de dia 15 a inativação dos não-renovados continua a ser o processo EXISTENTE
// do BO (manual) — este automatismo só trata das mensagens.
//
// Salvaguardas:
// - Master switch DISCORD_SCHEDULED_MESSAGES_ENABLED (runtime, default false) + enabled por regra.
// - Idempotência: receipt durável por regra/mês coordena re-runs e concorrência; lastSentMonth
//   é a projeção operacional, não a fence atómica.
// - GUARD DE MÊS VAZIO (pedida pelo João): há meses sem nenhuma turma a renovar (verificado
//   2026-07-11: Agosto e Outubro = 0 alunos). Se o cargo alvo não tem NINGUÉM com ele
//   aplicado (DiscordRoleState), a mensagem NÃO sai — evita anunciar renovações a um cargo
//   vazio no canal público.
// - Envio passa pelo sendDiscordMessage existente: allowlist dos 12 cargos R.*, allowlist de
//   canais, switch DISCORD_MESSAGES_ENABLED, e registo em DiscordMessageLog.

import logger from '../../utils/logger'
import { HttpError } from '../../security/errorHandling'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import {
  DiscordMessageTemplate,
  DiscordScheduledRule,
  DiscordRoleState,
  IDiscordScheduledRule
} from '../../models/discordRenewal'
import {
  RENEWAL_ROLES,
  renderMessage,
  sendDiscordMessage
} from './discordRolesSync.service'
import {
  executeDiscordMessageReceipt,
} from './discord/discordMessageExecution.service'
import {
  normalizeDiscordActor,
  performDiscordMessage,
  prepareDiscordMessage,
} from './discord/discordMessageTransport.service'

export const isScheduledMessagesEnabled = () =>
  getRuntimeConfig().renewal.discordScheduledMessagesEnabled

export const MAX_SCHEDULED_MESSAGE_RULES = 50

export class DiscordScheduledMessagesLimitError extends HttpError {
  constructor() {
    super({
      status: 413,
      code: 'DISCORD_SCHEDULED_MESSAGES_LIMIT_EXCEEDED',
      publicMessage: `Mensagens Discord agendadas limitadas a ${MAX_SCHEDULED_MESSAGE_RULES} regras`,
    })
  }
}

const LISBON_TZ = 'Europe/Lisbon'

// ─────────────────────────────────────────────────────────────
// DATAS (tudo em Europe/Lisbon — o servidor pode estar em UTC)
// ─────────────────────────────────────────────────────────────

/** { year, month (1-12), day } da data dada, no fuso de Lisboa */
export function lisbonParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Mês alvo = mês ANTERIOR à data de envio (turma R.{M} recebe as mensagens em M+1) */
export function getTargetMonth(now: Date = new Date()): {
  month: number
  year: number
  roleId: string
  roleName: string
  dataFim: string // último dia do mês alvo, dd/mm/yyyy — para o placeholder {dataFim}
  monthKey: string // 'YYYY-MM' do mês CORRENTE (chave de idempotência do envio)
} {
  const { year, month } = lisbonParts(now)
  const targetMonth = month === 1 ? 12 : month - 1
  const targetYear = month === 1 ? year - 1 : year
  const role = RENEWAL_ROLES[targetMonth]
  const lastDay = new Date(targetYear, targetMonth, 0).getDate() // dia 0 do mês seguinte ao alvo
  const dataFim = `${String(lastDay).padStart(2, '0')}/${String(targetMonth).padStart(2, '0')}/${targetYear}`
  return {
    month: targetMonth,
    year: targetYear,
    roleId: role.roleId,
    roleName: role.roleName,
    dataFim,
    monthKey: `${year}-${String(month).padStart(2, '0')}`
  }
}

// ─────────────────────────────────────────────────────────────
// SEEDS (create-only — nunca reactiva regras desligadas)
// ─────────────────────────────────────────────────────────────

const DEFAULT_RULES = [
  {
    key: 'lembrete-dia-8',
    label: 'Lembrete de renovação (dia 8 — ~1 semana após o fim do acesso)',
    dayOfMonth: 8,
    templateKey: 'aviso-importante'
  },
  {
    key: 'ultimo-aviso-dia-15',
    label: 'Último aviso (dia 15 — nessa noite os não-renovados são inativados)',
    dayOfMonth: 15,
    templateKey: 'ultimo-dia'
  }
]

export async function ensureDefaultScheduledRules(): Promise<void> {
  for (const r of DEFAULT_RULES) {
    await DiscordScheduledRule.updateOne(
      { key: r.key },
      { $setOnInsert: { ...r, enabled: false, createdBy: 'seed' } },
      { upsert: true }
    )
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUÇÃO (chamada pelo cron diário DiscordScheduledMessages às 10:00)
// ─────────────────────────────────────────────────────────────

export interface ScheduledMessagesReport {
  masterEnabled: boolean
  today: number
  targetRole: string
  checked: number
  sent: number
  skipped: Array<{ rule: string; reason: string }>
  dryRun?: boolean
  planned?: number
}

export type ScheduledMessagesExecutionResult =
  | ScheduledMessagesReport
  | { kind: 'in-progress' | 'indeterminate' | 'request-id-reused' }

export interface ScheduledMessagesRunOptions {
  dryRun?: boolean
  now?: () => Date
}

async function readScheduledRulesWithinCap(): Promise<IDiscordScheduledRule[]> {
  const rules = await DiscordScheduledRule.find({})
    .limit(MAX_SCHEDULED_MESSAGE_RULES + 1)
    .exec()
  if (rules.length > MAX_SCHEDULED_MESSAGE_RULES) throw new DiscordScheduledMessagesLimitError()
  return rules
}

function missingDefaultRules(rules: readonly IDiscordScheduledRule[]): number {
  const keys = new Set(rules.map((rule) => rule.key))
  return DEFAULT_RULES.filter((rule) => !keys.has(rule.key)).length
}

function dateKey(now: Date): string {
  const { year, month, day } = lisbonParts(now)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function runScheduledMessagesCore(
  now: Date,
  options: ScheduledMessagesRunOptions,
  requestId?: string,
): Promise<ScheduledMessagesReport> {
  const dryRun = options.dryRun === true
  let rules = await readScheduledRulesWithinCap()
  if (!dryRun) {
    if (rules.length + missingDefaultRules(rules) > MAX_SCHEDULED_MESSAGE_RULES) {
      throw new DiscordScheduledMessagesLimitError()
    }
    await ensureDefaultScheduledRules()
    rules = await readScheduledRulesWithinCap()
  }

  const { day } = lisbonParts(now)
  const target = getTargetMonth(now)

  const report: ScheduledMessagesReport = {
    masterEnabled: isScheduledMessagesEnabled(),
    today: day,
    targetRole: target.roleName,
    checked: 0,
    sent: 0,
    skipped: [],
    ...(dryRun ? { dryRun: true, planned: 0 } : {}),
  }

  for (const rule of rules) {
    if (rule.dayOfMonth !== day) continue // hoje não é o dia desta regra
    report.checked++

    const skip = async (reason: string) => {
      report.skipped.push({ rule: rule.key, reason })
      if (dryRun) return
      rule.lastRunAt = now
      rule.lastResult = reason
      await rule.save()
    }

    if (!rule.enabled) {
      await skip('regra desligada')
      continue
    }
    if (!report.masterEnabled) {
      await skip('DISCORD_SCHEDULED_MESSAGES_ENABLED != true — envio recusado')
      continue
    }
    if (rule.lastSentMonth === target.monthKey) {
      await skip(`já enviada este mês (${target.monthKey})`)
      continue
    }

    // GUARD: mês sem turma a renovar → cargo sem membros → não anunciar nada
    const members = await DiscordRoleState.countDocuments({ roleId: target.roleId })
    if (members === 0) {
      await skip(`cargo ${target.roleName} sem membros — mês sem renovações, nada enviado`)
      continue
    }

    const template = await DiscordMessageTemplate.findOne({ key: rule.templateKey }).lean().exec()
    if (!template) {
      await skip(`template '${rule.templateKey}' não encontrado`)
      continue
    }

    if (dryRun) {
      report.planned = (report.planned ?? 0) + 1
      await skip('dry-run — envio e persistência recusados')
      continue
    }

    const result = await sendDiscordMessage({
      content: template.content,
      mentionRoleIds: [target.roleId],
      dataFim: target.dataFim,
      channelId: rule.channelId || undefined,
      templateKey: rule.templateKey,
      sentBy: 'cron:DiscordScheduledMessages'
    },
    requestId
      ? `${requestId}:rule:${rule.key}:${target.monthKey}`
      : `cron:DiscordScheduledMessages:${rule.key}:${target.monthKey}`,
    {
      operation: 'scheduled-rule',
      identity: `rule:${rule.key}:${target.monthKey}`,
      now: options.now,
      afterProviderSuccess: async (context) => {
        context.lease.assertOwnership()
        rule.lastRunAt = now
        rule.lastSentMonth = target.monthKey
        rule.lastResult = `enviada a ${target.roleName} (${members} membros)`
        await rule.save()
      },
    })

    if (result.success) {
      report.sent++
      logger.info(`📨 [ScheduledMessages] ${rule.key} → ${target.roleName} (${members} membros): OK`)
    } else if (result.kind === 'in-progress') {
      report.skipped.push({ rule: rule.key, reason: result.message })
    } else if (result.kind === 'indeterminate' || result.kind === 'request-id-reused') {
      report.skipped.push({ rule: rule.key, reason: result.message })
    } else {
      rule.lastRunAt = now
      rule.lastResult = `FALHOU: ${result.message}`
      report.skipped.push({ rule: rule.key, reason: result.message })
      await rule.save()
      logger.error(`❌ [ScheduledMessages] ${rule.key}: ${result.message}`)
    }
  }

  logger.info(
    `📅 [ScheduledMessages] dia ${day} — ${report.checked} regra(s) para hoje, ${report.sent} enviada(s), ${report.skipped.length} skip(s)`
  )
  return report
}

export function runScheduledMessagesJob(): Promise<ScheduledMessagesReport>
export function runScheduledMessagesJob(
  requestId: string,
  options?: ScheduledMessagesRunOptions,
): Promise<ScheduledMessagesExecutionResult>
export function runScheduledMessagesJob(
  requestId: undefined,
  options?: ScheduledMessagesRunOptions,
): Promise<ScheduledMessagesReport>
export async function runScheduledMessagesJob(
  requestId?: string,
  options: ScheduledMessagesRunOptions = {},
): Promise<ScheduledMessagesExecutionResult> {
  const now = options.now?.() ?? new Date()
  // Preview é estritamente read-only: não cria receipt de execução, seed, save nem chama provider.
  if (options.dryRun === true) return runScheduledMessagesCore(now, options, requestId)
  if (!requestId) return runScheduledMessagesCore(now, options)

  const execution = await executeDiscordMessageReceipt({
    operation: 'scheduled-run',
    identity: `run:${dateKey(now)}:live`,
    requestId,
    now: options.now,
    run: () => runScheduledMessagesCore(now, options, requestId),
  })
  if (execution.kind === 'completed' || execution.kind === 'replay' || execution.kind === 'failed') {
    return execution.result
  }
  return execution
}

// ─────────────────────────────────────────────────────────────
// UI: estado, preview e teste sem menções
// ─────────────────────────────────────────────────────────────

export async function getScheduledStatus() {
  await ensureDefaultScheduledRules()
  const rules = await DiscordScheduledRule.find({}).sort({ dayOfMonth: 1 }).lean().exec()
  const target = getTargetMonth()
  const members = await DiscordRoleState.countDocuments({ roleId: target.roleId })
  return {
    masterEnabled: isScheduledMessagesEnabled(),
    // Alvo se uma mensagem saísse hoje — a UI mostra "próximo alvo" e o nº de membros
    currentTarget: { ...target, members },
    rules
  }
}

/** Texto renderizado como sairia hoje (sem enviar nada) */
export async function previewScheduledRule(key: string): Promise<{
  success: boolean
  message?: string
  preview?: string
  target?: { roleName: string; members: number; dataFim: string }
}> {
  const rule = await DiscordScheduledRule.findOne({ key }).lean().exec()
  if (!rule) return { success: false, message: `Regra '${key}' não encontrada` }
  const template = await DiscordMessageTemplate.findOne({ key: rule.templateKey }).lean().exec()
  if (!template) return { success: false, message: `Template '${rule.templateKey}' não encontrado` }

  const target = getTargetMonth()
  const members = await DiscordRoleState.countDocuments({ roleId: target.roleId })
  const preview = renderMessage(template.content, [target.roleId], target.dataFim)
  return {
    success: true,
    preview,
    target: { roleName: target.roleName, members, dataFim: target.dataFim }
  }
}

/** Envio de teste SEM menções (ninguém é notificado) — modo seguro para validar texto/canal */
export async function testScheduledRule(key: string, sentBy: string, requestId?: string) {
  const target = getTargetMonth()
  const loadMessage = async () => {
    const rule = await DiscordScheduledRule.findOne({ key }).lean().exec()
    if (!rule) return { success: false as const, message: `Regra '${key}' não encontrada` }
    const template = await DiscordMessageTemplate.findOne({ key: rule.templateKey }).lean().exec()
    if (!template) return { success: false as const, message: `Template '${rule.templateKey}' não encontrado` }
    return {
      success: true as const,
      params: {
        content: `🧪 [TESTE — mensagem agendada '${rule.key}', sem menções]\n\n${template.content}`,
        mentionRoleIds: [], // sem menções = não notifica ninguém
        dataFim: target.dataFim,
        channelId: rule.channelId || undefined,
        templateKey: rule.templateKey,
        sentBy,
      },
    }
  }

  if (!requestId) {
    const loaded = await loadMessage()
    if (!loaded.success) return loaded
    return sendDiscordMessage(loaded.params)
  }

  const execution = await executeDiscordMessageReceipt({
    operation: 'scheduled-test',
    identity: `rule:${key}:actor:${normalizeDiscordActor(sentBy)}`,
    requestId,
    run: async (context) => {
      const loaded = await loadMessage()
      if (!loaded.success) {
        context.provider.notAttempted()
        context.provider.retryableFailure()
        return loaded
      }
      const prepared = prepareDiscordMessage(loaded.params)
      if (!prepared.success) {
        context.provider.notAttempted()
        context.provider.retryableFailure()
        return prepared
      }
      return performDiscordMessage(prepared.message, context)
    },
  })
  if (execution.kind === 'completed' || execution.kind === 'replay' || execution.kind === 'failed') {
    return execution.result
  }
  if (execution.kind === 'in-progress') {
    return { success: false, kind: 'in-progress' as const, message: 'Teste de mensagem Discord já está em processamento' }
  }
  if (execution.kind === 'request-id-reused') {
    return { success: false, kind: 'request-id-reused' as const, message: 'X-Request-ID já foi usado noutra regra' }
  }
  return {
    success: false,
    kind: 'indeterminate' as const,
    message: 'Resultado do teste Discord ficou indeterminado; requer reconciliação',
  }
}

export async function setScheduledRuleEnabled(key: string, enabled: boolean): Promise<IDiscordScheduledRule | null> {
  return DiscordScheduledRule.findOneAndUpdate({ key }, { $set: { enabled } }, { new: true }).exec()
}

export default {
  isScheduledMessagesEnabled,
  ensureDefaultScheduledRules,
  runScheduledMessagesJob,
  getScheduledStatus,
  previewScheduledRule,
  testScheduledRule,
  setScheduledRuleEnabled,
  getTargetMonth
}
