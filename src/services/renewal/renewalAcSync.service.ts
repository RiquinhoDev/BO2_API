// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalAcSync.service.ts
// Fase B da Renovação OGI: BackOffice → ActiveCampaign.
// Ver RENOVACAO_OGI_BO_PLAN.md (secções 11 e 13) — este ficheiro
// implementa a safety net descrita lá (guards F1–F17).
//
// Fluxo em 2 passos SEPARADOS:
//   generatePlan()  → lê mudanças de turma (StudentClassHistory,
//                     escritas pelo sync "1º") + reembolsos marcados,
//                     e cria RenewalAcChange PLANNED.
//                     ⚠️ ZERO chamadas à ActiveCampaign neste passo.
//   executePlan()   → executa changes contra a AC, com kill switches
//                     lidos EM RUNTIME, caps, diff antes de escrever
//                     e captura do valor "before" para reversão.
//
// Kill switches (todos default FALSE — a feature nasce desligada):
//   RENEWAL_AC_SYNC_ENABLED      master: sem isto NADA escreve na AC
//   RENEWAL_AC_WRITE_DATES       permite UPDATE_EXPIRY
//   RENEWAL_AC_WRITE_TAGS        permite APPLY_TAG / REMOVE_TAG
//   RENEWAL_AC_PROCESS_REFUNDS   permite detecção de reembolsos (só BD)
//   RENEWAL_AC_AUTO_EXECUTE      cron executa sem aprovação manual
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import RenewalAcChange, { IRenewalAcChange } from '../../models/RenewalAcChange'
import StudentClassHistory from '../../models/StudentClassHistory'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'
import activeCampaignService from '../activeCampaign/activeCampaignService'
import { detectHotmartRefunds, RefundDetectionReport } from './hotmartRefunds.service'
import { parseTurmaName, resolveAccessEnd } from './turmaParser'

// ─────────────────────────────────────────────────────────────
// SWITCHES E CONFIG (lidos em runtime, nunca cacheados no boot)
// ─────────────────────────────────────────────────────────────

export const isMasterEnabled = () => process.env.RENEWAL_AC_SYNC_ENABLED === 'true'
export const isWriteDatesEnabled = () => process.env.RENEWAL_AC_WRITE_DATES === 'true'
export const isWriteTagsEnabled = () => process.env.RENEWAL_AC_WRITE_TAGS === 'true'
export const isProcessRefundsEnabled = () => process.env.RENEWAL_AC_PROCESS_REFUNDS === 'true'
export const isAutoExecuteEnabled = () => process.env.RENEWAL_AC_AUTO_EXECUTE === 'true'

const expiryFieldId = () => Number(process.env.RENEWAL_AC_EXPIRY_FIELD_ID || 332)
const maxChangesPerRun = () => Number(process.env.RENEWAL_AC_MAX_CHANGES_PER_RUN || 50)

// Frescura: PLANNED expira em 24h; APPROVED (revisto por humano) em 48h.
const PLANNED_TTL_HOURS = 24
const APPROVED_TTL_HOURS = 48

// Allowlist de remoção (excepção controlada à nativeTagProtection):
// SÓ tags de turma OGI no formato da equipa podem ser removidas por este
// serviço — e apenas quando planeadas com origem registada.
export const TURMA_TAG_REGEX = /^Aluno OGI( L)?\d{4} - (Renovação )?Turma .+$/i

// ─────────────────────────────────────────────────────────────
// NOME DA TAG DE TURMA (convenção real da equipa — auditoria 12.2)
// ─────────────────────────────────────────────────────────────

/**
 * Deriva o nome da tag AC a partir do nome da turma Hotmart.
 *   "Turma 10 [renov] + REITs | 2505"  → "Aluno OGI 2505 - Renovação Turma 10"
 *   "Turma 14 + REITs | 2505"          → "Aluno OGI L2505 - Turma 14"
 *   accessYears=2                       → sufixo " [2anos]"
 * Devolve null quando o nome não faz parse válido (ex: turma genérica).
 */
export function buildTurmaTagName(className: string | null | undefined): string | null {
  const parsed = parseTurmaName(className || '')
  if (!parsed.valid || !parsed.periodYYMM) return null

  const nums = parsed.turmaNumbers
  let label: string
  if (nums.length === 1) {
    label = String(nums[0])
  } else {
    const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
    if (isConsecutive && nums.length > 2) {
      label = `${nums[0]} a ${nums[nums.length - 1]}`
    } else {
      label = `${nums.slice(0, -1).join(' ')} e ${nums[nums.length - 1]}`
    }
  }

  const prefix = parsed.isRenov ? '' : 'L'
  const renov = parsed.isRenov ? 'Renovação ' : ''
  const anos = parsed.accessYears === 2 ? ' [2anos]' : ''

  return `Aluno OGI ${prefix}${parsed.periodYYMM} - ${renov}Turma ${label}${anos}`
}

function formatDateYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Janela de sanidade para datas de expiração (guard F2/F4). */
function isSaneExpiryDate(d: Date): boolean {
  const now = Date.now()
  const min = now - 2 * 365 * 24 * 60 * 60 * 1000
  const max = now + 3 * 365 * 24 * 60 * 60 * 1000
  return d.getTime() >= min && d.getTime() <= max
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE DADOS
// ─────────────────────────────────────────────────────────────

type ReadModel = { findOne: (...args: any[]) => any; find?: (...args: any[]) => any; countDocuments?: (...args: any[]) => any }
const UserRead = User as unknown as ReadModel
const ProductRead = Product as unknown as ReadModel
const HistoryRead = StudentClassHistory as unknown as ReadModel

async function resolveOgiProductObjectId(): Promise<mongoose.Types.ObjectId | null> {
  const p = await ProductRead.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
  }).select('_id').lean().exec() as { _id: mongoose.Types.ObjectId } | null
  return p?._id || null
}

async function getOgiUserProduct(userId: mongoose.Types.ObjectId, ogiId: mongoose.Types.ObjectId | null) {
  if (!ogiId) return null
  return (UserProduct as any).findOne({ userId, productId: ogiId, platform: 'hotmart' })
    .select('metadata platformData')
    .lean()
    .exec() as Promise<{ metadata?: { refunded?: boolean; refundedAt?: Date; purchaseDate?: Date }; platformData?: any } | null>
}

async function hasLivingChange(sourceRef: string, action: string): Promise<boolean> {
  const existing = await RenewalAcChange.findOne({
    sourceRef,
    action,
    status: { $in: ['PLANNED', 'APPROVED', 'APPLIED'] }
  }).select('_id').lean().exec()
  return Boolean(existing)
}

// ─────────────────────────────────────────────────────────────
// EXPIRAÇÃO DE PLANOS VELHOS (freshness — 13.5)
// ─────────────────────────────────────────────────────────────

export async function expireStaleChanges(): Promise<number> {
  const now = Date.now()
  const plannedCutoff = new Date(now - PLANNED_TTL_HOURS * 60 * 60 * 1000)
  const approvedCutoff = new Date(now - APPROVED_TTL_HOURS * 60 * 60 * 1000)

  const res = await RenewalAcChange.updateMany(
    {
      $or: [
        { status: 'PLANNED', plannedAt: { $lt: plannedCutoff } },
        { status: 'APPROVED', plannedAt: { $lt: approvedCutoff } }
      ]
    },
    { $set: { status: 'EXPIRED' } }
  )
  return res.modifiedCount || 0
}

// ─────────────────────────────────────────────────────────────
// GERAR PLANO (dry-run persistido — ZERO chamadas à AC)
// ─────────────────────────────────────────────────────────────

export interface PlanReport {
  batchId: string
  windowHours: number
  classChangesSeen: number
  anomalyAborted: boolean
  anomalyDetail?: string
  planned: number
  blocked: number
  skippedDuplicates: number
  refundReverts: number
  overCap: boolean
}

export async function generatePlan(windowHours: number = 26): Promise<PlanReport> {
  const batchId = `plan-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)
  const ogiId = await resolveOgiProductObjectId()

  const report: PlanReport = {
    batchId,
    windowHours,
    classChangesSeen: 0,
    anomalyAborted: false,
    planned: 0,
    blocked: 0,
    skippedDuplicates: 0,
    refundReverts: 0,
    overCap: false
  }

  // 1. Mudanças de turma recentes gravadas pelo sync "1º"
  const changes = await HistoryRead.find!({
    dateMoved: { $gte: since },
    movedBy: 'Sistema - Sync Automático',
    previousClassName: { $exists: true, $ne: null }
  }).lean().exec() as Array<{
    _id: mongoose.Types.ObjectId
    studentId: mongoose.Types.ObjectId
    className: string
    previousClassName?: string
    dateMoved: Date
  }>

  report.classChangesSeen = changes.length

  // 2. Circuit breaker anti-massa (F10): mudanças demais = falha da API
  const usersWithClasses = await (User as any).countDocuments({
    'hotmart.enrolledClasses.0': { $exists: true }
  })
  const anomalyThreshold = Math.max(20, Math.ceil(usersWithClasses * 0.05))
  if (changes.length > anomalyThreshold) {
    report.anomalyAborted = true
    report.anomalyDetail = `${changes.length} mudanças de turma em ${windowHours}h (> limiar ${anomalyThreshold}) — provável falha da API Hotmart, plano NÃO gerado`
    console.error(`🚨 [RenewalAcSync] ${report.anomalyDetail}`)
    return report
  }

  // 3. Uma change por acção, por mudança de turma
  for (const ch of changes) {
    const user = await UserRead.findOne({ _id: ch.studentId }).select('email').lean().exec() as { email?: string } | null
    if (!user?.email) continue

    const email = user.email.toLowerCase()
    const sourceRef = String(ch._id)
    const up = await getOgiUserProduct(ch.studentId, ogiId)
    const refunded = up?.metadata?.refunded === true

    const newParsed = parseTurmaName(ch.className || '')
    const newTag = buildTurmaTagName(ch.className)
    const oldTag = buildTurmaTagName(ch.previousClassName)

    const baseDoc = {
      email,
      userId: ch.studentId,
      source: 'CLASS_CHANGE' as const,
      planBatchId: batchId,
      sourceRef,
      plannedAt: new Date(),
      context: {
        previousClassName: ch.previousClassName,
        newClassName: ch.className
      }
    }

    // 3a. Turma nova sem parse válido (ex: turma genérica) → BLOCKED p/ visibilidade (F4, edge 1)
    if (!newParsed.valid || !newTag) {
      if (!(await hasLivingChange(sourceRef, 'APPLY_TAG'))) {
        await RenewalAcChange.create({
          ...baseDoc,
          action: 'APPLY_TAG',
          status: 'BLOCKED',
          payload: { tagName: null, after: null },
          blockedReason: `Turma nova "${ch.className}" sem parse válido (turma genérica/intermédia?) — nenhuma acção AC planeada`
        })
        report.blocked += 1
      }
      continue
    }

    // 3b. UPDATE_EXPIRY (guard F3: reembolsado nunca recebe data futura)
    if (await hasLivingChange(sourceRef, 'UPDATE_EXPIRY')) {
      report.skippedDuplicates += 1
    } else if (refunded) {
      await RenewalAcChange.create({
        ...baseDoc,
        action: 'UPDATE_EXPIRY',
        status: 'BLOCKED',
        payload: { fieldId: expiryFieldId(), after: null },
        blockedReason: 'UserProduct reembolsado — data de expiração não é escrita (guard F3)'
      })
      report.blocked += 1
    } else {
      const purchaseDate = up?.metadata?.purchaseDate ? new Date(up.metadata.purchaseDate) : null
      const accessEnd = resolveAccessEnd(purchaseDate, ch.className)
      if (accessEnd && isSaneExpiryDate(accessEnd)) {
        await RenewalAcChange.create({
          ...baseDoc,
          action: 'UPDATE_EXPIRY',
          status: 'PLANNED',
          payload: { fieldId: expiryFieldId(), after: formatDateYYYYMMDD(accessEnd) }
        })
        report.planned += 1
      } else {
        await RenewalAcChange.create({
          ...baseDoc,
          action: 'UPDATE_EXPIRY',
          status: 'BLOCKED',
          payload: { fieldId: expiryFieldId(), after: accessEnd ? formatDateYYYYMMDD(accessEnd) : null },
          blockedReason: accessEnd
            ? `Data calculada ${formatDateYYYYMMDD(accessEnd)} fora da janela de sanidade (guard F2/F4)`
            : 'Não foi possível calcular a data de fim de acesso'
        })
        report.blocked += 1
      }
    }

    // 3c. APPLY_TAG (turma nova)
    if (await hasLivingChange(sourceRef, 'APPLY_TAG')) {
      report.skippedDuplicates += 1
    } else {
      await RenewalAcChange.create({
        ...baseDoc,
        action: 'APPLY_TAG',
        status: 'PLANNED',
        payload: { tagName: newTag, after: newTag }
      })
      report.planned += 1
    }

    // 3d. REMOVE_TAG (turma anterior) — só se derivável e diferente da nova
    if (oldTag && oldTag !== newTag) {
      if (await hasLivingChange(sourceRef, 'REMOVE_TAG')) {
        report.skippedDuplicates += 1
      } else {
        await RenewalAcChange.create({
          ...baseDoc,
          action: 'REMOVE_TAG',
          status: 'PLANNED',
          payload: { tagName: oldTag, before: oldTag }
        })
        report.planned += 1
      }
    }
  }

  // 4. Reversões por reembolso (Fase 3): tag aplicada pelo BO + reembolso novo
  if (ogiId) {
    const refundedUps = await (UserProduct as any).find({
      productId: ogiId,
      platform: 'hotmart',
      'metadata.refunded': true,
      'platformData.renewalAc.appliedTurmaTag': { $exists: true, $ne: null }
    }).select('userId metadata platformData').lean().exec() as Array<{
      userId: mongoose.Types.ObjectId
      metadata?: { refundedAt?: Date }
      platformData?: { renewalAc?: { appliedTurmaTag?: string } }
    }>

    for (const up of refundedUps) {
      const appliedTag = up.platformData?.renewalAc?.appliedTurmaTag
      if (!appliedTag) continue

      const user = await UserRead.findOne({ _id: up.userId }).select('email').lean().exec() as { email?: string } | null
      if (!user?.email) continue

      const sourceRef = `refund-${up.userId}-${appliedTag}`
      if (await hasLivingChange(sourceRef, 'REMOVE_TAG')) {
        report.skippedDuplicates += 1
        continue
      }

      await RenewalAcChange.create({
        email: user.email.toLowerCase(),
        userId: up.userId,
        action: 'REMOVE_TAG',
        source: 'REFUND',
        status: 'PLANNED',
        payload: { tagName: appliedTag, before: appliedTag },
        context: {
          refundedAt: up.metadata?.refundedAt,
          note: 'Reversão por reembolso: remover tag de turma aplicada pelo BO. A data de expiração NÃO é tocada (guard F3/Gap D).'
        },
        planBatchId: batchId,
        sourceRef,
        plannedAt: new Date()
      })
      report.refundReverts += 1
      report.planned += 1
    }
  }

  report.overCap = report.planned > maxChangesPerRun()
  console.log(`📋 [RenewalAcSync] Plano ${batchId}: ${report.planned} planeadas, ${report.blocked} bloqueadas, ${report.skippedDuplicates} duplicadas, ${report.refundReverts} reversões de reembolso${report.overCap ? ` — ACIMA DO CAP ${maxChangesPerRun()}, execução exigirá aprovação/lotes` : ''}`)

  return report
}

// ─────────────────────────────────────────────────────────────
// APROVAÇÃO
// ─────────────────────────────────────────────────────────────

export async function approveChanges(ids: string[], approvedBy: string): Promise<number> {
  const res = await RenewalAcChange.updateMany(
    { _id: { $in: ids }, status: 'PLANNED' },
    { $set: { status: 'APPROVED', approvedAt: new Date(), approvedBy } }
  )
  return res.modifiedCount || 0
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR PLANO (única zona do código que escreve na AC)
// ─────────────────────────────────────────────────────────────

export interface ExecuteReport {
  attempted: number
  applied: number
  alreadyInSync: number
  failed: number
  blockedBySwitch: number
  leftForNextRun: number
  masterEnabled: boolean
}

interface ExecuteOptions {
  /** true (cron auto): executa PLANNED+APPROVED. false (manual): só APPROVED. */
  includePlanned?: boolean
  batchId?: string
  executedBy: string
}

export async function executePlan(options: ExecuteOptions): Promise<ExecuteReport> {
  const report: ExecuteReport = {
    attempted: 0,
    applied: 0,
    alreadyInSync: 0,
    failed: 0,
    blockedBySwitch: 0,
    leftForNextRun: 0,
    masterEnabled: isMasterEnabled()
  }

  // MASTER KILL SWITCH — sem isto, nada sai daqui (nível 2 da secção 13.2)
  if (!isMasterEnabled()) {
    console.log('⛔ [RenewalAcSync] RENEWAL_AC_SYNC_ENABLED != true — execução recusada, nada escrito na AC')
    return report
  }

  await expireStaleChanges()

  const statuses = options.includePlanned ? ['APPROVED', 'PLANNED'] : ['APPROVED']
  const query: any = { status: { $in: statuses } }
  if (options.batchId) query.planBatchId = options.batchId

  const cap = maxChangesPerRun()
  const candidates = await RenewalAcChange.find(query)
    .sort({ status: 1, plannedAt: 1 }) // APPROVED primeiro (ordem alfabética favorece), depois antigos
    .limit(cap + 1)
    .exec() as IRenewalAcChange[]

  const toRun = candidates.slice(0, cap)
  report.leftForNextRun = Math.max(0, candidates.length - toRun.length)

  const ogiId = await resolveOgiProductObjectId()

  for (const change of toRun) {
    report.attempted += 1
    try {
      const outcome = await executeSingleChange(change, ogiId, options.executedBy)
      if (outcome === 'applied') report.applied += 1
      else if (outcome === 'already') report.alreadyInSync += 1
      else if (outcome === 'switch') report.blockedBySwitch += 1
      else report.failed += 1
    } catch (error: any) {
      report.failed += 1
      await RenewalAcChange.updateOne(
        { _id: change._id },
        { $set: { status: 'FAILED', error: error.message }, $inc: { attempts: 1 } }
      )
      console.error(`❌ [RenewalAcSync] ${change.action} ${change.email}: ${error.message}`)
    }
  }

  console.log(`✅ [RenewalAcSync] Execução: ${report.applied} aplicadas, ${report.alreadyInSync} já em sync, ${report.blockedBySwitch} travadas por switch, ${report.failed} falhas, ${report.leftForNextRun} ficam para o próximo run`)
  return report
}

type SingleOutcome = 'applied' | 'already' | 'switch' | 'failed'

async function executeSingleChange(
  change: IRenewalAcChange,
  ogiId: mongoose.Types.ObjectId | null,
  executedBy: string
): Promise<SingleOutcome> {
  const markApplied = async (before: string | null, note?: string) => {
    await RenewalAcChange.updateOne(
      { _id: change._id },
      {
        $set: {
          status: 'APPLIED',
          appliedAt: new Date(),
          'payload.before': before,
          ...(note ? { 'context.note': note } : {})
        },
        $inc: { attempts: 1 }
      }
    )
  }

  // ── UPDATE_EXPIRY ──────────────────────────────────────────
  if (change.action === 'UPDATE_EXPIRY') {
    if (!isWriteDatesEnabled()) return 'switch'

    // Guard F3 re-verificado no momento da execução
    if (change.userId && ogiId) {
      const up = await getOgiUserProduct(change.userId as any, ogiId)
      if (up?.metadata?.refunded === true) {
        await RenewalAcChange.updateOne(
          { _id: change._id },
          { $set: { status: 'BLOCKED', blockedReason: 'Reembolsado entre o plano e a execução (guard F3)' } }
        )
        return 'failed'
      }
    }

    const fieldId = change.payload.fieldId || expiryFieldId()
    const current = await activeCampaignService.getContactFieldValue(change.email, fieldId)
    if (!current) {
      await RenewalAcChange.updateOne(
        { _id: change._id },
        { $set: { status: 'BLOCKED', blockedReason: 'Contacto não existe na AC — nunca criamos contactos (guard F7)' } }
      )
      return 'failed'
    }

    // Diff: só escrever se mudou (F5/F6)
    if (current.value === change.payload.after) {
      await markApplied(current.value, 'Valor já estava correcto na AC — nada escrito')
      return 'already'
    }

    const ok = await activeCampaignService.updateContactField(change.email, fieldId, change.payload.after || '')
    if (!ok) throw new Error('updateContactField devolveu false')
    await markApplied(current.value)
    return 'applied'
  }

  // ── APPLY_TAG / REMOVE_TAG ─────────────────────────────────
  if (!isWriteTagsEnabled()) return 'switch'

  const tagName = change.payload.tagName || ''
  if (!TURMA_TAG_REGEX.test(tagName)) {
    await RenewalAcChange.updateOne(
      { _id: change._id },
      { $set: { status: 'BLOCKED', blockedReason: `Tag "${tagName}" fora da allowlist de turmas OGI (11.4)` } }
    )
    return 'failed'
  }

  const contact = await activeCampaignService.getContactByEmail(change.email)
  if (!contact) {
    await RenewalAcChange.updateOne(
      { _id: change._id },
      { $set: { status: 'BLOCKED', blockedReason: 'Contacto não existe na AC — nunca criamos contactos (guard F7)' } }
    )
    return 'failed'
  }

  const currentTags = await activeCampaignService.getContactTagsByEmail(change.email)
  const hasTag = currentTags.includes(tagName)

  if (change.action === 'APPLY_TAG') {
    if (hasTag) {
      await markApplied('já tinha a tag', 'Tag já estava aplicada — nada escrito')
      await recordAppliedTurmaTag(change, ogiId, tagName)
      return 'already'
    }
    await activeCampaignService.addTag(change.email, tagName)
    await markApplied('não tinha a tag')
    await recordAppliedTurmaTag(change, ogiId, tagName)
    return 'applied'
  }

  // REMOVE_TAG
  if (!hasTag) {
    await markApplied('já não tinha a tag', 'Tag já não estava no contacto — nada escrito')
    await clearAppliedTurmaTagIfMatches(change, ogiId, tagName)
    return 'already'
  }
  const removed = await activeCampaignService.removeTag(change.email, tagName)
  if (!removed) throw new Error('removeTag devolveu false')
  await markApplied('tinha a tag')
  await clearAppliedTurmaTagIfMatches(change, ogiId, tagName)
  return 'applied'
}

/** Regista no UserProduct qual a tag de turma aplicada pelo BO (auditável; usado na reversão por reembolso). */
async function recordAppliedTurmaTag(change: IRenewalAcChange, ogiId: mongoose.Types.ObjectId | null, tagName: string) {
  if (!change.userId || !ogiId) return
  await (UserProduct as any).updateOne(
    { userId: change.userId, productId: ogiId, platform: 'hotmart' },
    { $set: { 'platformData.renewalAc': { appliedTurmaTag: tagName, appliedAt: new Date(), changeId: String(change._id) } } }
  )
}

async function clearAppliedTurmaTagIfMatches(change: IRenewalAcChange, ogiId: mongoose.Types.ObjectId | null, tagName: string) {
  if (!change.userId || !ogiId) return
  await (UserProduct as any).updateOne(
    { userId: change.userId, productId: ogiId, platform: 'hotmart', 'platformData.renewalAc.appliedTurmaTag': tagName },
    { $unset: { 'platformData.renewalAc': '' } }
  )
}

// ─────────────────────────────────────────────────────────────
// REVERTER (usa o "before" capturado na execução)
// ─────────────────────────────────────────────────────────────

export async function revertChange(changeId: string, revertedBy: string): Promise<{ success: boolean; message: string }> {
  if (!isMasterEnabled()) {
    return { success: false, message: 'RENEWAL_AC_SYNC_ENABLED != true — reversão recusada' }
  }

  const change = await RenewalAcChange.findById(changeId).exec() as IRenewalAcChange | null
  if (!change) return { success: false, message: 'Change não encontrada' }
  if (change.status !== 'APPLIED') return { success: false, message: `Só changes APPLIED podem ser revertidas (estado: ${change.status})` }

  if (change.action === 'UPDATE_EXPIRY') {
    if (!isWriteDatesEnabled()) return { success: false, message: 'RENEWAL_AC_WRITE_DATES desligado' }
    if (change.payload.before === null || change.payload.before === undefined) {
      return { success: false, message: 'Sem valor "before" registado — reverter manualmente na AC' }
    }
    const ok = await activeCampaignService.updateContactField(
      change.email,
      change.payload.fieldId || expiryFieldId(),
      change.payload.before
    )
    if (!ok) return { success: false, message: 'Contacto não existe na AC' }
  } else {
    if (!isWriteTagsEnabled()) return { success: false, message: 'RENEWAL_AC_WRITE_TAGS desligado' }
    const tagName = change.payload.tagName || ''
    if (!TURMA_TAG_REGEX.test(tagName)) return { success: false, message: 'Tag fora da allowlist — não reversível por aqui' }

    if (change.action === 'APPLY_TAG') {
      await activeCampaignService.removeTag(change.email, tagName)
    } else {
      await activeCampaignService.addTag(change.email, tagName)
    }
  }

  await RenewalAcChange.updateOne(
    { _id: change._id },
    { $set: { status: 'REVERTED', revertedAt: new Date(), 'context.note': `Revertida por ${revertedBy}` } }
  )
  return { success: true, message: 'Revertida' }
}

// ─────────────────────────────────────────────────────────────
// ESTADO (para a UI e para o relatório do cron)
// ─────────────────────────────────────────────────────────────

export async function getRenewalAcStatus() {
  const byStatus = await RenewalAcChange.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } }
  ])
  const counts: Record<string, number> = {}
  for (const row of byStatus) counts[row._id] = row.n

  const lastPlanned = await RenewalAcChange.findOne({})
    .sort({ plannedAt: -1 })
    .select('planBatchId plannedAt')
    .lean()
    .exec() as { planBatchId?: string; plannedAt?: Date } | null

  return {
    switches: {
      masterEnabled: isMasterEnabled(),
      writeDates: isWriteDatesEnabled(),
      writeTags: isWriteTagsEnabled(),
      processRefunds: isProcessRefundsEnabled(),
      autoExecute: isAutoExecuteEnabled()
    },
    config: {
      expiryFieldId: expiryFieldId(),
      maxChangesPerRun: maxChangesPerRun(),
      plannedTtlHours: PLANNED_TTL_HOURS,
      approvedTtlHours: APPROVED_TTL_HOURS
    },
    counts,
    lastPlanBatchId: lastPlanned?.planBatchId || null,
    lastPlannedAt: lastPlanned?.plannedAt || null
  }
}

// ─────────────────────────────────────────────────────────────
// ENTRADA DO CRON (Fase B — job nasce DESLIGADO)
// ─────────────────────────────────────────────────────────────

export interface RenewalAcCronReport {
  expired: number
  refundDetection: RefundDetectionReport | null
  plan: PlanReport
  execution: ExecuteReport | null
}

/**
 * Corpo do cron RenewalAcSync. Mesmo com o cron ligado:
 * - sem RENEWAL_AC_PROCESS_REFUNDS → não consulta reembolsos;
 * - gera plano (escreve SÓ na nossa BD);
 * - sem RENEWAL_AC_SYNC_ENABLED + RENEWAL_AC_AUTO_EXECUTE → NÃO executa
 *   (fica tudo PLANNED, à espera de revisão/aprovação na UI).
 */
export async function runRenewalAcSyncJob(): Promise<RenewalAcCronReport> {
  const expired = await expireStaleChanges()

  let refundDetection: RefundDetectionReport | null = null
  if (isProcessRefundsEnabled()) {
    try {
      refundDetection = await detectHotmartRefunds(30)
    } catch (error: any) {
      console.error('⚠️ [RenewalAcSync] Detecção de reembolsos falhou (segue sem ela):', error.message)
    }
  }

  const plan = await generatePlan(26)

  let execution: ExecuteReport | null = null
  if (plan.anomalyAborted) {
    console.error('🚨 [RenewalAcSync] Plano abortado por anomalia — nada executado')
  } else if (isMasterEnabled() && isAutoExecuteEnabled()) {
    execution = await executePlan({ includePlanned: true, executedBy: 'cron:RenewalAcSync' })
  } else {
    console.log('📋 [RenewalAcSync] Modo dry-run: plano gerado, execução aguarda switches/aprovação')
  }

  return { expired, refundDetection, plan, execution }
}

export default {
  buildTurmaTagName,
  generatePlan,
  approveChanges,
  executePlan,
  revertChange,
  expireStaleChanges,
  getRenewalAcStatus,
  runRenewalAcSyncJob
}
