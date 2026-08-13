import logger from '../../../utils/logger'
import mongoose from 'mongoose'
import RenewalAcChange, { IRenewalAcChange } from '../../../models/RenewalAcChange'
import UserProduct from '../../../models/UserProduct'
import activeCampaignService from '../../activeCampaign/activeCampaignService'
import { detectHotmartRefunds, RefundDetectionReport } from '../hotmartRefunds.service'
import {
  APPROVED_TTL_HOURS,
  expireStaleChanges,
  expiryFieldId,
  generatePlan,
  getOgiUserProduct,
  isAutoExecuteEnabled,
  isMasterEnabled,
  isProcessRefundsEnabled,
  isWriteDatesEnabled,
  isWriteTagsEnabled,
  maxChangesPerRun,
  PlanReport,
  PLANNED_TTL_HOURS,
  resolveOgiProductObjectId,
  TURMA_TAG_REGEX
} from './planning'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function approveChanges(ids: string[], approvedBy: string): Promise<number> {
  const res = await RenewalAcChange.updateMany(
    { _id: { $in: ids }, status: 'PLANNED' },
    { $set: { status: 'APPROVED', approvedAt: new Date(), approvedBy } }
  )
  return res.modifiedCount || 0
}

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
  includePlanned?: boolean
  batchId?: string
  executedBy: string
}

interface RenewalChangeQuery {
  status: { $in: string[] }
  planBatchId?: string
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

  if (!isMasterEnabled()) {
    logger.info('⛔ [RenewalAcSync] RENEWAL_AC_SYNC_ENABLED != true — execução recusada, nada escrito na AC')
    return report
  }

  await expireStaleChanges()

  const statuses = options.includePlanned ? ['APPROVED', 'PLANNED'] : ['APPROVED']
  const query: RenewalChangeQuery = { status: { $in: statuses } }
  if (options.batchId) query.planBatchId = options.batchId

  const cap = maxChangesPerRun()
  const candidates = await RenewalAcChange.find(query)
    .sort({ status: 1, plannedAt: 1 })
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
    } catch (error: unknown) {
      const message = errorText(error)
      report.failed += 1
      await RenewalAcChange.updateOne(
        { _id: change._id },
        { $set: { status: 'FAILED', error: message }, $inc: { attempts: 1 } }
      )
      logger.error(`❌ [RenewalAcSync] ${change.action} ${change.email}: ${message}`)
    }
  }

  logger.info(`✅ [RenewalAcSync] Execução: ${report.applied} aplicadas, ${report.alreadyInSync} já em sync, ${report.blockedBySwitch} travadas por switch, ${report.failed} falhas, ${report.leftForNextRun} ficam para o próximo run`)
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

  if (change.action === 'UPDATE_EXPIRY') {
    if (!isWriteDatesEnabled()) return 'switch'

    if (change.userId && ogiId) {
      const up = await getOgiUserProduct(change.userId, ogiId)
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

    if (current.value === change.payload.after) {
      await markApplied(current.value, 'Valor já estava correcto na AC — nada escrito')
      return 'already'
    }

    const ok = await activeCampaignService.updateContactField(change.email, fieldId, change.payload.after || '')
    if (!ok) throw new Error('updateContactField devolveu false')
    await markApplied(current.value)
    return 'applied'
  }

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

async function recordAppliedTurmaTag(change: IRenewalAcChange, ogiId: mongoose.Types.ObjectId | null, tagName: string) {
  if (!change.userId || !ogiId) return
  await UserProduct.updateOne(
    { userId: change.userId, productId: ogiId, platform: 'hotmart' },
    { $set: { 'platformData.renewalAc': { appliedTurmaTag: tagName, appliedAt: new Date(), changeId: String(change._id) } } }
  )
}

async function clearAppliedTurmaTagIfMatches(change: IRenewalAcChange, ogiId: mongoose.Types.ObjectId | null, tagName: string) {
  if (!change.userId || !ogiId) return
  await UserProduct.updateOne(
    { userId: change.userId, productId: ogiId, platform: 'hotmart', 'platformData.renewalAc.appliedTurmaTag': tagName },
    { $unset: { 'platformData.renewalAc': '' } }
  )
}

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

export interface RenewalAcCronReport {
  expired: number
  refundDetection: RefundDetectionReport | null
  plan: PlanReport
  execution: ExecuteReport | null
}

export async function runRenewalAcSyncJob(): Promise<RenewalAcCronReport> {
  const expired = await expireStaleChanges()

  let refundDetection: RefundDetectionReport | null = null
  if (isProcessRefundsEnabled()) {
    try {
      refundDetection = await detectHotmartRefunds(30)
    } catch (error: unknown) {
      logger.error('⚠️ [RenewalAcSync] Detecção de reembolsos falhou (segue sem ela):', errorText(error))
    }
  }

  const plan = await generatePlan(26)

  let execution: ExecuteReport | null = null
  if (plan.anomalyAborted) {
    logger.error('🚨 [RenewalAcSync] Plano abortado por anomalia — nada executado')
  } else if (isMasterEnabled() && isAutoExecuteEnabled()) {
    execution = await executePlan({ includePlanned: true, executedBy: 'cron:RenewalAcSync' })
  } else {
    logger.info('📋 [RenewalAcSync] Modo dry-run: plano gerado, execução aguarda switches/aprovação')
  }

  return { expired, refundDetection, plan, execution }
}
