// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/discordRolesSync.service.ts
// Reconciliação nocturna dos cargos de renovação no Discord (R. {Mês})
// + envio de mensagens do bot. Ver RENOVACAO_DISCORD_CARGOS_PLAN.md.
//
// Regra de ouro (D3): o cargo espelha SEMPRE a turma actual na Hotmart.
//   desejado  = mês do fim de acesso (parseTurmaName → accessEndOgi)
//   aplicado  = DiscordRoleState (registado pelo próprio executor)
//   diff      → DiscordRoleChange PLANNED (zero chamadas ao Discord)
//   execução  → POST ao bot (repo API), fila lenta, gated por switches
//
// Kill switches (todos default FALSE — nasce desligado):
//   DISCORD_ROLES_SYNC_ENABLED   master dos cargos: sem isto nada executa
//   DISCORD_ROLES_AUTO_EXECUTE   cron executa sem aprovação manual
//   DISCORD_MESSAGES_ENABLED     master das mensagens do bot
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import mongoose from 'mongoose'
import {
  DiscordMessageLog,
  DiscordMessageTemplate,
  DiscordRoleChange,
  DiscordRoleState,
  IDiscordRoleChange
} from '../../models/discordRenewal'
import User from '../../models/user'
import { parseTurmaName } from './turmaParser'

// ─────────────────────────────────────────────────────────────
// SWITCHES E CONFIG (runtime)
// ─────────────────────────────────────────────────────────────

export const isRolesSyncEnabled = () => process.env.DISCORD_ROLES_SYNC_ENABLED === 'true'
export const isRolesAutoExecuteEnabled = () => process.env.DISCORD_ROLES_AUTO_EXECUTE === 'true'
export const isMessagesEnabled = () => process.env.DISCORD_MESSAGES_ENABLED === 'true'

const botUrl = () => (process.env.DISCORD_BOT_URL || 'https://api.serriquinho.com').replace(/\/$/, '')
const maxOpsPerRun = () => Number(process.env.DISCORD_ROLES_MAX_OPS_PER_RUN || 100)
const botHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.BOT_SHARED_SECRET) headers['X-Bot-Auth'] = process.env.BOT_SHARED_SECRET
  return headers
}

const PLANNED_TTL_HOURS = 24
const APPROVED_TTL_HOURS = 48
const NOT_IN_GUILD_RETRY_DAYS = 7 // não re-planear todas as noites quem saiu do servidor

// Cargos R.{Mês} — IDs verificados por leitura à API Discord (2026-07-10).
export const RENEWAL_ROLES: Record<number, { roleId: string; roleName: string }> = {
  1: { roleId: '1525119563182772385', roleName: 'R. Janeiro' },
  2: { roleId: '1525119750030495745', roleName: 'R. Fevereiro' },
  3: { roleId: '1525119843806875868', roleName: 'R. Março' },
  4: { roleId: '1525119885867352105', roleName: 'R. Abril' },
  5: { roleId: '1525119933300740156', roleName: 'R. Maio' },
  6: { roleId: '1525119979500998818', roleName: 'R. Junho' },
  7: { roleId: '1525120024681910424', roleName: 'R. Julho' },
  8: { roleId: '1525120114918166638', roleName: 'R. Agosto' },
  9: { roleId: '1525120320225149108', roleName: 'R. Setembro' },
  10: { roleId: '1525120518695682199', roleName: 'R. Outubro' },
  11: { roleId: '1525120372071202827', roleName: 'R. Novembro' },
  12: { roleId: '1525120419768696872', roleName: 'R. Dezembro' }
}

export const ALL_RENEWAL_ROLE_IDS = Object.values(RENEWAL_ROLES).map((r) => r.roleId)
const ROLE_NAME_BY_ID = new Map(Object.values(RENEWAL_ROLES).map((r) => [r.roleId, r.roleName]))

export const DEFAULT_MESSAGE_CHANNEL_ID = process.env.DISCORD_MESSAGE_CHANNEL_ID || '1182457352012697671'

// ─────────────────────────────────────────────────────────────
// EXPIRAÇÃO DE PLANOS VELHOS
// ─────────────────────────────────────────────────────────────

export async function expireStaleRoleChanges(): Promise<number> {
  const now = Date.now()
  const res = await DiscordRoleChange.updateMany(
    {
      $or: [
        { status: 'PLANNED', plannedAt: { $lt: new Date(now - PLANNED_TTL_HOURS * 3600e3) } },
        { status: 'APPROVED', plannedAt: { $lt: new Date(now - APPROVED_TTL_HOURS * 3600e3) } }
      ]
    },
    { $set: { status: 'EXPIRED' } }
  )
  return res.modifiedCount || 0
}

// ─────────────────────────────────────────────────────────────
// GERAR PLANO (reconciliação — zero chamadas ao Discord)
// ─────────────────────────────────────────────────────────────

export interface DiscordPlanReport {
  batchId: string
  isBackfill: boolean
  studentsWithClass: number
  studentsLinked: number
  accountsDesired: number
  invalidTurma: number
  planned: number
  removals: number
  skippedDuplicates: number
  anomalyAborted: boolean
  anomalyDetail?: string
  overCap: boolean
}

export async function generateDiscordRolesPlan(): Promise<DiscordPlanReport> {
  const batchId = `discord-${new Date().toISOString().replace(/[:.]/g, '-')}`

  const report: DiscordPlanReport = {
    batchId,
    isBackfill: false,
    studentsWithClass: 0,
    studentsLinked: 0,
    accountsDesired: 0,
    invalidTurma: 0,
    planned: 0,
    removals: 0,
    skippedDuplicates: 0,
    anomalyAborted: false,
    overCap: false
  }

  // 1. Estado desejado: alunos com turma activa + discord ligado
  const students = await (User as any).find({
    'hotmart.enrolledClasses.0': { $exists: true }
  })
    .select('email discord.discordIds hotmart.enrolledClasses')
    .lean()
    .exec() as Array<{
      _id: mongoose.Types.ObjectId
      email?: string
      discord?: { discordIds?: string[] }
      hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
    }>

  report.studentsWithClass = students.length

  interface Desired {
    userId: mongoose.Types.ObjectId
    email: string
    className: string
    month: number
    roleId: string
    roleName: string
  }
  const desiredByAccount = new Map<string, Desired>()

  for (const s of students) {
    const discordIds = (s.discord?.discordIds || []).map(String).filter(Boolean)
    if (discordIds.length === 0) continue
    report.studentsLinked += 1

    const classes = s.hotmart?.enrolledClasses || []
    const active = classes.find((c) => c.className && c.isActive !== false) || classes.find((c) => c.className)
    const className = active?.className || ''
    const parsed = parseTurmaName(className)

    if (!parsed.valid || !parsed.accessEndOgi) {
      report.invalidTurma += 1
      continue
    }

    const month = parsed.accessEndOgi.getUTCMonth() + 1
    const role = RENEWAL_ROLES[month]
    if (!role) continue

    // D2: aplicar a TODOS os discordIds do aluno
    for (const discordUserId of discordIds) {
      desiredByAccount.set(discordUserId, {
        userId: s._id,
        email: (s.email || '').toLowerCase(),
        className,
        month,
        roleId: role.roleId,
        roleName: role.roleName
      })
    }
  }

  report.accountsDesired = desiredByAccount.size

  // 2. Estado aplicado (registado por nós)
  const states = await DiscordRoleState.find({}).lean().exec() as Array<{
    discordUserId: string
    roleId: string
  }>
  const stateByAccount = new Map(states.map((s) => [String(s.discordUserId), s.roleId]))
  report.isBackfill = states.length === 0

  // 3. Diff → changes
  interface PendingChange {
    discordUserId: string
    desired: Desired | null // null = remover qualquer cargo R.*
  }
  const pending: PendingChange[] = []

  for (const [discordUserId, desired] of desiredByAccount) {
    if (stateByAccount.get(discordUserId) === desired.roleId) continue
    pending.push({ discordUserId, desired })
  }
  // contas com estado aplicado mas que já não estão no desejado → remover (D4)
  for (const s of states) {
    if (!desiredByAccount.has(String(s.discordUserId))) {
      pending.push({ discordUserId: String(s.discordUserId), desired: null })
    }
  }

  // 4. Circuit breaker (não se aplica ao backfill inicial, que é esperado ser grande)
  if (!report.isBackfill) {
    const threshold = Math.max(30, Math.ceil(desiredByAccount.size * 0.05))
    if (pending.length > threshold) {
      report.anomalyAborted = true
      report.anomalyDetail = `${pending.length} mudanças de cargo (> limiar ${threshold}) — provável anomalia nos dados, plano NÃO gerado`
      console.error(`🚨 [DiscordRoles] ${report.anomalyDetail}`)
      return report
    }
  }

  // 5. Persistir changes (dedupe por conta: 1 change viva por discordUserId)
  const notInGuildCutoff = new Date(Date.now() - NOT_IN_GUILD_RETRY_DAYS * 24 * 3600e3)

  for (const p of pending) {
    const addRoleId = p.desired?.roleId || null
    const living = await DiscordRoleChange.findOne({
      sourceRef: p.discordUserId,
      $or: [
        { status: { $in: ['PLANNED', 'APPROVED'] } },
        // quem saiu do servidor: não re-planear todas as noites (janela de 7 dias)
        { status: 'BLOCKED', notInGuild: true, 'payload.addRoleId': addRoleId, plannedAt: { $gte: notInGuildCutoff } }
      ]
    }).select('_id').lean().exec()

    if (living) {
      report.skippedDuplicates += 1
      continue
    }

    // remover TODOS os outros R.* (o bot só retira os que o membro tiver) —
    // auto-corrige drift de cargos postos/tirados à mão no Discord
    const removeRoleIds = ALL_RENEWAL_ROLE_IDS.filter((id) => id !== addRoleId)

    await DiscordRoleChange.create({
      email: p.desired?.email || (await emailForState(p.discordUserId)),
      userId: p.desired?.userId,
      discordUserId: p.discordUserId,
      action: 'SET_ROLE',
      status: 'PLANNED',
      payload: {
        addRoleId,
        addRoleName: addRoleId ? ROLE_NAME_BY_ID.get(addRoleId) : null,
        removeRoleIds,
        removeRoleNames: removeRoleIds.map((id) => ROLE_NAME_BY_ID.get(id) || id)
      },
      context: {
        className: p.desired?.className,
        accessEndMonth: p.desired?.month,
        note: p.desired ? undefined : 'Aluno já não elegível (sem turma activa/ligação) — remover cargo de renovação (D4)'
      },
      planBatchId: batchId,
      sourceRef: p.discordUserId,
      plannedAt: new Date()
    })

    report.planned += 1
    if (!p.desired) report.removals += 1
  }

  report.overCap = report.planned > maxOpsPerRun()
  console.log(`📋 [DiscordRoles] Plano ${batchId}: ${report.planned} changes (${report.removals} remoções), ${report.skippedDuplicates} duplicadas, backfill=${report.isBackfill}${report.overCap ? ` — ACIMA DO CAP ${maxOpsPerRun()}` : ''}`)
  return report
}

async function emailForState(discordUserId: string): Promise<string> {
  const st = await DiscordRoleState.findOne({ discordUserId }).select('email').lean().exec() as { email?: string } | null
  return st?.email || 'desconhecido'
}

// ─────────────────────────────────────────────────────────────
// APROVAÇÃO
// ─────────────────────────────────────────────────────────────

export async function approveRoleChanges(ids: string[], approvedBy: string): Promise<number> {
  const res = await DiscordRoleChange.updateMany(
    { _id: { $in: ids }, status: 'PLANNED' },
    { $set: { status: 'APPROVED', approvedAt: new Date(), approvedBy } }
  )
  return res.modifiedCount || 0
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR (única zona que fala com o bot → Discord)
// ─────────────────────────────────────────────────────────────

export interface DiscordExecuteReport {
  attempted: number
  applied: number
  notInGuild: number
  failed: number
  leftForNextRun: number
  masterEnabled: boolean
}

const BOT_BATCH_SIZE = 20 // ≤25 (limite do endpoint do bot); ~22s por lote a 1.1s/op

export async function executeDiscordRolesPlan(options: {
  includePlanned?: boolean
  batchId?: string
  executedBy: string
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
    console.log('⛔ [DiscordRoles] DISCORD_ROLES_SYNC_ENABLED != true — execução recusada')
    return report
  }

  await expireStaleRoleChanges()

  const statuses = options.includePlanned ? ['APPROVED', 'PLANNED'] : ['APPROVED']
  const query: any = { status: { $in: statuses } }
  if (options.batchId) query.planBatchId = options.batchId

  const cap = maxOpsPerRun()
  const candidates = await DiscordRoleChange.find(query)
    .sort({ status: 1, plannedAt: 1 })
    .limit(cap + 1)
    .exec()

  const toRun = candidates.slice(0, cap)
  report.leftForNextRun = Math.max(0, candidates.length - toRun.length)

  for (let i = 0; i < toRun.length; i += BOT_BATCH_SIZE) {
    const batch = toRun.slice(i, i + BOT_BATCH_SIZE)
    report.attempted += batch.length

    let results: Array<{ discordUserId: string; ok: boolean; error?: string; notInGuild?: boolean }> = []
    try {
      const resp = await axios.post(
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
      results = resp.data?.results || []
    } catch (error: any) {
      // lote inteiro falhou (bot em baixo?) — marcar FAILED re-tentável e parar
      const msg = `Chamada ao bot falhou: ${error.response?.status || ''} ${error.message}`
      console.error(`❌ [DiscordRoles] ${msg}`)
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
        await DiscordRoleChange.updateOne(
          { _id: change._id },
          { $set: { status: 'APPLIED', appliedAt: new Date() }, $inc: { attempts: 1 } }
        )
        // actualizar o estado aplicado (fonte da reconciliação)
        if (change.payload.addRoleId) {
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
          await DiscordRoleState.deleteOne({ discordUserId: change.discordUserId })
        }
        report.applied += 1
      } else if (r?.notInGuild) {
        await DiscordRoleChange.updateOne(
          { _id: change._id },
          { $set: { status: 'BLOCKED', notInGuild: true, blockedReason: 'Membro não está no servidor Discord' }, $inc: { attempts: 1 } }
        )
        report.notInGuild += 1
      } else {
        await DiscordRoleChange.updateOne(
          { _id: change._id },
          { $set: { status: 'FAILED', error: r?.error || 'sem resultado do bot' }, $inc: { attempts: 1 } }
        )
        report.failed += 1
      }
    }
  }

  console.log(`✅ [DiscordRoles] Execução: ${report.applied} aplicadas, ${report.notInGuild} fora do servidor, ${report.failed} falhas, ${report.leftForNextRun} para o próximo run`)
  return report
}

// ─────────────────────────────────────────────────────────────
// MENSAGENS DO BOT
// ─────────────────────────────────────────────────────────────

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

/** Substitui placeholders: {cargos} → menções <@&id>; {dataFim} → texto. */
export function renderMessage(content: string, mentionRoleIds: string[], dataFim?: string): string {
  const mentions = mentionRoleIds.map((id) => `<@&${id}>`).join(' ')
  return content
    .replace(/\{cargos\}/g, mentions || '')
    .replace(/\{dataFim\}/g, dataFim || '{dataFim}')
}

export async function sendDiscordMessage(params: {
  content: string
  mentionRoleIds: string[]
  dataFim?: string
  channelId?: string
  templateKey?: string
  sentBy: string
}): Promise<{ success: boolean; message: string; messageIds?: string[] }> {
  if (!isMessagesEnabled()) {
    return { success: false, message: 'DISCORD_MESSAGES_ENABLED != true — envio recusado (nada publicado)' }
  }

  const roleIds = params.mentionRoleIds.filter((id) => ALL_RENEWAL_ROLE_IDS.includes(id))
  if (roleIds.length !== params.mentionRoleIds.length) {
    return { success: false, message: 'mentionRoleIds contém cargos fora da allowlist R.*' }
  }

  const channelId = params.channelId || DEFAULT_MESSAGE_CHANNEL_ID
  const finalContent = renderMessage(params.content, roleIds, params.dataFim)
  if (!finalContent.trim()) return { success: false, message: 'Mensagem vazia' }

  try {
    const resp = await axios.post(
      `${botUrl()}/renewal/messages/send`,
      { channelId, content: finalContent, mentionRoleIds: roleIds },
      { headers: botHeaders(), timeout: 60000 }
    )

    await DiscordMessageLog.create({
      channelId,
      content: finalContent,
      mentionRoleIds: roleIds,
      mentionRoleNames: roleIds.map((id) => ROLE_NAME_BY_ID.get(id) || id),
      templateKey: params.templateKey,
      sentBy: params.sentBy,
      messageIds: resp.data?.messageIds || [],
      parts: resp.data?.parts || 1,
      sentAt: new Date()
    })

    return { success: true, message: `Publicada (${resp.data?.parts || 1} parte(s))`, messageIds: resp.data?.messageIds }
  } catch (error: any) {
    return { success: false, message: `Bot recusou/falhou: ${error.response?.data?.message || error.message}` }
  }
}

// ─────────────────────────────────────────────────────────────
// ESTADO (UI) + ENTRADA DO CRON
// ─────────────────────────────────────────────────────────────

export async function getDiscordRenewalStatus() {
  const byStatus = await DiscordRoleChange.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
  const counts: Record<string, number> = {}
  for (const row of byStatus) counts[row._id] = row.n

  const statesCount = await DiscordRoleState.countDocuments({})
  const lastPlanned = await DiscordRoleChange.findOne({}).sort({ plannedAt: -1 }).select('planBatchId plannedAt').lean().exec() as { planBatchId?: string; plannedAt?: Date } | null

  let botHealth: any = null
  try {
    const resp = await axios.get(`${botUrl()}/renewal/health`, { headers: botHeaders(), timeout: 8000 })
    botHealth = resp.data
  } catch (error: any) {
    botHealth = { ok: false, error: error.response?.status || error.message }
  }

  return {
    switches: {
      rolesSyncEnabled: isRolesSyncEnabled(),
      rolesAutoExecute: isRolesAutoExecuteEnabled(),
      messagesEnabled: isMessagesEnabled()
    },
    config: {
      botUrl: botUrl(),
      maxOpsPerRun: maxOpsPerRun(),
      defaultChannelId: DEFAULT_MESSAGE_CHANNEL_ID,
      roles: RENEWAL_ROLES
    },
    counts,
    appliedStates: statesCount,
    lastPlanBatchId: lastPlanned?.planBatchId || null,
    lastPlannedAt: lastPlanned?.plannedAt || null,
    botHealth
  }
}

export interface DiscordCronReport {
  expired: number
  plan: DiscordPlanReport
  execution: DiscordExecuteReport | null
}

export async function runDiscordRolesSyncJob(): Promise<DiscordCronReport> {
  const expired = await expireStaleRoleChanges()
  const plan = await generateDiscordRolesPlan()

  let execution: DiscordExecuteReport | null = null
  if (plan.anomalyAborted) {
    console.error('🚨 [DiscordRoles] Plano abortado por anomalia — nada executado')
  } else if (isRolesSyncEnabled() && isRolesAutoExecuteEnabled()) {
    execution = await executeDiscordRolesPlan({ includePlanned: true, executedBy: 'cron:DiscordRolesSync' })
  } else {
    console.log('📋 [DiscordRoles] Modo dry-run: plano gerado, execução aguarda switches/aprovação')
  }

  return { expired, plan, execution }
}

export default {
  generateDiscordRolesPlan,
  approveRoleChanges,
  executeDiscordRolesPlan,
  expireStaleRoleChanges,
  getDiscordRenewalStatus,
  ensureDefaultTemplates,
  renderMessage,
  sendDiscordMessage,
  runDiscordRolesSyncJob,
  RENEWAL_ROLES
}
