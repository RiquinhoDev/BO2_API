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
import { AC_RENEWAL_FIELD_IDS } from '../../config/renewalEnvironment'

// IDs dos custom fields na AC (confirmados via GET /api/3/fields em 11/08/2026).
// 332 já era usado (RENEWAL_AC_EXPIRY_FIELD_ID) — mantemos o mesmo default.
export const AC_PURCHASE_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.purchaseDate
export const AC_FIRST_PURCHASE_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.firstPurchaseDate
export const AC_EXPIRATION_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.expirationDate
// Explica muitos dos "sem data de expiração": reembolsados nunca tiveram
// expiração escrita (não há renovação a marcar). Ler estes 2 também.
export const AC_PURCHASE_STATUS_FIELD_ID = AC_RENEWAL_FIELD_IDS.purchaseStatus
export const AC_REFUND_DATE_FIELD_ID = AC_RENEWAL_FIELD_IDS.refundDate

const FIELD_IDS = [
  AC_PURCHASE_DATE_FIELD_ID,
  AC_FIRST_PURCHASE_DATE_FIELD_ID,
  AC_EXPIRATION_DATE_FIELD_ID,
  AC_PURCHASE_STATUS_FIELD_ID,
  AC_REFUND_DATE_FIELD_ID
]

export interface AcRenewalDataSyncReport {
  totalActiveStudents: number
  processed: number
  updated: number
  withAcContact: number
  withoutAcContact: number
  errors: Array<{ email: string; error: string }>
}

type MongooseReadModel = { findOne: (...args: any[]) => any; find?: (...args: any[]) => any }
const ProductReadModel = Product as unknown as MongooseReadModel
const UserReadModel = User as unknown as MongooseReadModel
const UserProductReadModel = UserProduct as unknown as MongooseReadModel

/** AC devolve datas como "YYYY-MM-DD" (ou "" se vazio). */
function parseAcDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

async function resolveOgiProductObjectId(): Promise<mongoose.Types.ObjectId> {
  const ogiProduct = await ProductReadModel.findOne({
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
  const ogiObjectId = await resolveOgiProductObjectId()

  const enrollments = await UserProductReadModel.find!({
    platform: 'hotmart',
    productId: ogiObjectId,
    status: 'ACTIVE'
  })
    .select('userId')
    .lean()
    .exec() as Array<{ userId: mongoose.Types.ObjectId }>

  const userQuery: any = { _id: { $in: enrollments.map((e) => e.userId) } }
  if (emails && emails.length > 0) {
    userQuery.email = { $in: emails.map((e) => e.toLowerCase().trim()) }
  }

  const users = await UserReadModel.find!(userQuery)
    .select('_id email')
    .lean()
    .exec() as Array<{ _id: mongoose.Types.ObjectId; email: string }>

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
    report.processed += 1
    try {
      const result = await activeCampaignService.getContactFieldValues(
        user.email,
        String(user._id),
        FIELD_IDS
      )

      if (!result) {
        report.withoutAcContact += 1
        await ACRenewalData.updateOne(
          { userId: user._id },
          { $set: { email: user.email, contactId: null, lastSyncedAt: new Date(), syncError: null } },
          { upsert: true }
        )
        continue
      }

      report.withAcContact += 1
      await ACRenewalData.updateOne(
        { userId: user._id },
        {
          $set: {
            email: user.email,
            contactId: result.contactId,
            purchaseDate: parseAcDate(result.values[AC_PURCHASE_DATE_FIELD_ID]),
            firstPurchaseDate: parseAcDate(result.values[AC_FIRST_PURCHASE_DATE_FIELD_ID]),
            expirationDate: parseAcDate(result.values[AC_EXPIRATION_DATE_FIELD_ID]),
            purchaseStatus: result.values[AC_PURCHASE_STATUS_FIELD_ID]?.trim() || null,
            refundDate: parseAcDate(result.values[AC_REFUND_DATE_FIELD_ID]),
            lastSyncedAt: new Date(),
            syncError: null
          }
        },
        { upsert: true }
      )
      report.updated += 1
    } catch (error: any) {
      const message = error?.message || 'Erro desconhecido ao ler dados da AC'
      report.errors.push({ email: user.email, error: message })
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
