// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalAcSync.service.ts
// Fase B da Renovação OGI: BackOffice → ActiveCampaign.
// Ver docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md (secções 11 e 13) — este ficheiro
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
import logger from '../../../utils/logger'
import { getRuntimeConfig } from '../../../config/runtimeConfig'

import mongoose from 'mongoose'
import RenewalAcChange from '../../../models/RenewalAcChange'
import StudentClassHistory from '../../../models/StudentClassHistory'
import User from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import Product from '../../../models/product/Product'
import { parseTurmaName, resolveAccessEnd } from '../turmaParser'

// ─────────────────────────────────────────────────────────────
// SWITCHES E CONFIG (validados no boot; consultados em runtime)
// ─────────────────────────────────────────────────────────────

const renewalConfig = () => getRuntimeConfig().renewal

export const isMasterEnabled = () => renewalConfig().acSyncEnabled
export const isWriteDatesEnabled = () => renewalConfig().writeDatesEnabled
export const isWriteTagsEnabled = () => renewalConfig().writeTagsEnabled
export const isProcessRefundsEnabled = () => renewalConfig().processRefundsEnabled
export const isAutoExecuteEnabled = () => renewalConfig().autoExecute

export const expiryFieldId = () => renewalConfig().expiryFieldId
export const maxChangesPerRun = () => renewalConfig().maxChangesPerRun

// Frescura: PLANNED expira em 24h; APPROVED (revisto por humano) em 48h.
export const PLANNED_TTL_HOURS = 24
export const APPROVED_TTL_HOURS = 48

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


export async function resolveOgiProductObjectId(): Promise<mongoose.Types.ObjectId | null> {
  const p = await Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
  }).select('_id').lean().exec() as { _id: mongoose.Types.ObjectId } | null
  return p?._id || null
}

export async function getOgiUserProduct(userId: mongoose.Types.ObjectId, ogiId: mongoose.Types.ObjectId | null) {
  if (!ogiId) return null
  return UserProduct.findOne({ userId, productId: ogiId, platform: 'hotmart' })
    .select('metadata platformData')
    .lean()
    .exec() as Promise<{ metadata?: { refunded?: boolean; refundedAt?: Date; purchaseDate?: Date }; platformData?: unknown } | null>
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
  const changes = await StudentClassHistory.find({
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
  const usersWithClasses = await User.countDocuments({
    'hotmart.enrolledClasses.0': { $exists: true }
  })
  const anomalyThreshold = Math.max(20, Math.ceil(usersWithClasses * 0.05))
  if (changes.length > anomalyThreshold) {
    report.anomalyAborted = true
    report.anomalyDetail = `${changes.length} mudanças de turma em ${windowHours}h (> limiar ${anomalyThreshold}) — provável falha da API Hotmart, plano NÃO gerado`
    logger.error(`🚨 [RenewalAcSync] ${report.anomalyDetail}`)
    return report
  }

  // 3. Uma change por acção, por mudança de turma
  for (const ch of changes) {
    const user = await User.findOne({ _id: ch.studentId }).select('email').lean().exec() as { email?: string } | null
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
    const refundedUps = await UserProduct.find({
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

      const user = await User.findOne({ _id: up.userId }).select('email').lean().exec() as { email?: string } | null
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
  logger.info(`📋 [RenewalAcSync] Plano ${batchId}: ${report.planned} planeadas, ${report.blocked} bloqueadas, ${report.skippedDuplicates} duplicadas, ${report.refundReverts} reversões de reembolso${report.overCap ? ` — ACIMA DO CAP ${maxChangesPerRun()}, execução exigirá aprovação/lotes` : ''}`)

  return report
}
