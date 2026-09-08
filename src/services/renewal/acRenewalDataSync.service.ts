// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acRenewalDataSync.service.ts
// Sync dos 3 campos de renovação da ActiveCampaign (Data da compra,
// Data da 1ª compra, Data de expiração) para os alunos OGI ativos.
//
// SÓ LEITURA na AC — nunca escreve nada lá. Objetivo: cruzar com o
// Sync Hotmart na tab Renovações, pra ver lado a lado o que vem da
// Hotmart (vendas reais) e o que está registado na AC.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import ACRenewalData from '../../models/ACRenewalData'
import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { activeCampaignService } from '../activeCampaign/activeCampaignService'
import { AC_RENEWAL_FIELD_IDS, getRenewalParitySettings } from '../../config/renewalEnvironment'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import type { RenewalParityConfig } from '../../config/renewalParityConfig'
import { assertMainParityOwnership, mainParityLocalMutationStarted } from './mainParityExecution'

// IDs dos custom fields na AC (confirmados via GET /api/3/fields em 11/08/2026).
// 332 já era usado (RENEWAL_AC_EXPIRY_FIELD_ID) — mantemos o mesmo default.
export const AC_PURCHASE_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.purchaseDate
export const AC_FIRST_PURCHASE_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.firstPurchaseDate
export const AC_EXPIRATION_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.expirationDate
// Explica muitos dos "sem data de expiração": reembolsados nunca tiveram
// expiração escrita (não há renovação a marcar). Ler estes 2 também.
export const AC_PURCHASE_STATUS_FIELD_ID = AC_RENEWAL_FIELD_IDS.purchaseStatus
export const AC_REFUND_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.refundDate

export function resolveAcRenewalFieldIds(
  settings: Pick<RenewalParityConfig,
    'acPurchaseDateFieldId' | 'acFirstPurchaseDateFieldId' | 'acPurchaseStatusFieldId' | 'acRefundDateFieldId'>,
  expirationDate: number,
) {
  return {
    purchaseDate: settings.acPurchaseDateFieldId ?? AC_PURCHASE_DATE_FIELD_ID,
    firstPurchaseDate: settings.acFirstPurchaseDateFieldId,
    expirationDate,
    purchaseStatus: settings.acPurchaseStatusFieldId,
    refundDate: settings.acRefundDateFieldId,
  }
}

export interface AcRenewalDataSyncReport {
  totalActiveStudents: number
  processed: number
  updated: number
  withAcContact: number
  withoutAcContact: number
  errors: Array<{ email: string; error: string }>
}

async function readActiveEnrollmentUserIds(productId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId[]> {
  const ids: mongoose.Types.ObjectId[] = []
  let cursor: mongoose.Types.ObjectId | undefined
  while (true) {
    const rows = await UserProduct.find({
      platform: 'hotmart', productId, status: 'ACTIVE',
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    }).sort({ _id: 1 }).limit(200).select('_id userId').lean().exec() as Array<{
      _id: mongoose.Types.ObjectId
      userId: mongoose.Types.ObjectId
    }>
    ids.push(...rows.map((row) => row.userId))
    if (ids.length > 20_000) throw new Error('AC_RENEWAL_DATA_READ_CAP_EXCEEDED')
    if (rows.length < 200) return ids
    cursor = rows[rows.length - 1]._id
    if (ids.length === 20_000) {
      const more = await UserProduct.exists({
        platform: 'hotmart', productId, status: 'ACTIVE', _id: { $gt: cursor },
      })
      if (more) throw new Error('AC_RENEWAL_DATA_READ_CAP_EXCEEDED')
      return ids
    }
  }
}

/** AC devolve datas como "YYYY-MM-DD" (ou "" se vazio). */
function parseAcDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

async function resolveOgiProductObjectId(): Promise<mongoose.Types.ObjectId> {
  const ogiProduct = await Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [
      { code: /^OGI/i },
      { courseCode: /^OGI/i },
      { name: /Grande Investimento/i }
    ]
  })
    .select('_id')
    .lean()
    .exec() as { _id: mongoose.Types.ObjectId } | null

  if (!ogiProduct?._id) {
    throw new Error('Produto OGI não resolvido')
  }
  return ogiProduct._id
}

/**
 * Sincroniza (só leitura) os 3 campos de renovação da AC para os alunos
 * OGI ativos. `emails` (opcional) restringe a sync a uma lista.
 */
export async function syncActiveStudentAcRenewalData(emails?: string[]): Promise<AcRenewalDataSyncReport> {
  const fieldIds = resolveAcRenewalFieldIds(
    getRenewalParitySettings(),
    getRuntimeConfig().renewal.expiryFieldId,
  )
  const requestedFieldIds = Object.values(fieldIds)
  const ogiObjectId = await resolveOgiProductObjectId()

  const enrollmentUserIds = await readActiveEnrollmentUserIds(ogiObjectId)
  const users: Array<{ _id: mongoose.Types.ObjectId; email: string }> = []
  for (let offset = 0; offset < enrollmentUserIds.length; offset += 200) {
    const userQuery: Record<string, unknown> = { _id: { $in: enrollmentUserIds.slice(offset, offset + 200) } }
    if (emails?.length) userQuery.email = { $in: emails.map((email) => email.toLowerCase().trim()) }
    users.push(...await User.find(userQuery).sort({ _id: 1 }).select('_id email').lean().exec() as Array<{
      _id: mongoose.Types.ObjectId
      email: string
    }>)
  }

  const report: AcRenewalDataSyncReport = {
    totalActiveStudents: users.length,
    processed: 0,
    updated: 0,
    withAcContact: 0,
    withoutAcContact: 0,
    errors: []
  }

  // sequencial — o cliente AC já tem rate limiting próprio (5 req/s)
  for (const user of users) {
    assertMainParityOwnership()
    report.processed += 1
    try {
      const result = await activeCampaignService.getContactFieldValues(
        user.email,
        String(user._id),
        requestedFieldIds
      )

      if (!result) {
        report.withoutAcContact += 1
        mainParityLocalMutationStarted()
        await ACRenewalData.updateOne(
          { userId: user._id },
          { $set: { email: user.email, contactId: null, lastSyncedAt: new Date(), syncError: null } },
          { upsert: true }
        )
        continue
      }

      report.withAcContact += 1
      mainParityLocalMutationStarted()
      await ACRenewalData.updateOne(
        { userId: user._id },
        {
          $set: {
            email: user.email,
            contactId: result.contactId,
            purchaseDate: parseAcDate(result.values[fieldIds.purchaseDate]),
            firstPurchaseDate: parseAcDate(result.values[fieldIds.firstPurchaseDate]),
            expirationDate: parseAcDate(result.values[fieldIds.expirationDate]),
            purchaseStatus: result.values[fieldIds.purchaseStatus]?.trim() || null,
            refundDate: parseAcDate(result.values[fieldIds.refundDate]),
            lastSyncedAt: new Date(),
            syncError: null
          }
        },
        { upsert: true }
      )
      report.updated += 1
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao ler dados da AC'
      report.errors.push({ email: user.email, error: message })
      mainParityLocalMutationStarted()
      await ACRenewalData.updateOne(
        { userId: user._id },
        { $set: { email: user.email, syncError: message, lastSyncedAt: new Date() } },
        { upsert: true }
      )
    }
  }

  return report
}

export default syncActiveStudentAcRenewalData
