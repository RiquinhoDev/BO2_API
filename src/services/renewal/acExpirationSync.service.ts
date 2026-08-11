// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acExpirationSync.service.ts
// Escreve a "Data de expiração" (AC field 332) — o ÚNICO campo que
// este sistema escreve na AC. As automações da AC correm no fim de
// cada mês, disparadas pelo valor que aqui deixamos, não por cada
// escrita nossa — por isso não há urgência de "só escrever se mudou"
// por causa de retrigger, mas fazemo-lo na mesma para poupar chamadas.
//
// Regra da expiração: data de compra (Hotmart) + 365 dias, arredondado
// ao 1º dia do mês seguinte (equivalente a "válido até ao fim do mês").
//   compra 11/08/2026 → +365d = 11/08/2027 → expira 01/09/2027
//
// Fonte da "compra nova": compara HotmartSaleHistory.latestApprovedDate
// (o que a Hotmart diz agora — já sincronizado por outro cron/botão)
// com ACRenewalData.purchaseDate (o que a AC tinha na última leitura).
// Só escreve quando os dois não batem certo — não lê nem escreve nada
// a mais na AC do que os alunos que realmente mudaram.
//
// NUNCA escreve para quem está reembolsado (nem data de compra, nem
// tags, nem mais nada — só a expiração, e só quando faz sentido).
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import ACRenewalData from '../../models/ACRenewalData'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import { activeCampaignService } from '../activeCampaign/activeCampaignService'
import { AC_EXPIRATION_DATE_FIELD_ID } from './acRenewalDataSync.service'

// mesmos 2 estados usados em hotmartRefunds.service.ts — uma compra
// nestes estados nunca deve gerar escrita de expiração.
const REFUND_TRANSACTION_STATUSES = new Set(['REFUNDED', 'CHARGEBACK'])

export interface AcExpirationSyncReport {
  candidatesChecked: number
  alreadyInSync: number
  needsWrite: number
  written: number
  skippedRefunded: number
  skippedNoContact: number
  skippedNoHotmartData: number
  errors: Array<{ email: string; error: string }>
}

type MongooseReadModel = { find: (...args: any[]) => any }
const ACRenewalDataReadModel = ACRenewalData as unknown as MongooseReadModel
const HotmartSaleHistoryReadModel = HotmartSaleHistory as unknown as MongooseReadModel

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

function formatDateYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * compra + 365 dias, arredondado ao 1º dia do mês seguinte.
 */
export function computeExpirationFromPurchaseDate(purchaseDate: Date): Date {
  const raw = new Date(purchaseDate)
  raw.setUTCDate(raw.getUTCDate() + 365)
  return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth() + 1, 1))
}

/**
 * Percorre os alunos já sincronizados (ACRenewalData + HotmartSaleHistory,
 * ambos populados por outros processos) e escreve a expiração só para
 * quem tem uma compra na Hotmart mais recente do que a AC ainda reflecte.
 * SÓ escreve o campo de expiração — nunca mais nada.
 */
export async function syncAcExpirationDates(): Promise<AcExpirationSyncReport> {
  const report: AcExpirationSyncReport = {
    candidatesChecked: 0,
    alreadyInSync: 0,
    needsWrite: 0,
    written: 0,
    skippedRefunded: 0,
    skippedNoContact: 0,
    skippedNoHotmartData: 0,
    errors: []
  }

  const acEntries = await ACRenewalDataReadModel.find({})
    .select('userId email contactId purchaseDate refundDate purchaseStatus')
    .lean()
    .exec() as Array<{
      userId: mongoose.Types.ObjectId
      email: string
      contactId: string | null
      purchaseDate: Date | null
      refundDate: Date | null
      purchaseStatus: string | null
    }>

  const userIds = acEntries.map((e) => e.userId)
  const hotmartDocs = await HotmartSaleHistoryReadModel.find({ userId: { $in: userIds } })
    .select('userId latestApprovedDate latestTransactionStatus')
    .lean()
    .exec() as Array<{
      userId: mongoose.Types.ObjectId
      latestApprovedDate: Date | null
      latestTransactionStatus: string | null
    }>
  const hotmartByUserId = new Map(hotmartDocs.map((h) => [String(h.userId), h]))

  for (const ac of acEntries) {
    if (!ac.contactId) {
      report.skippedNoContact += 1
      continue
    }

    report.candidatesChecked += 1

    if (ac.refundDate || ac.purchaseStatus === 'Reembolsada') {
      report.skippedRefunded += 1
      continue
    }

    const hm = hotmartByUserId.get(String(ac.userId))
    if (!hm?.latestApprovedDate) {
      report.skippedNoHotmartData += 1
      continue
    }

    if (hm.latestTransactionStatus && REFUND_TRANSACTION_STATUSES.has(hm.latestTransactionStatus)) {
      report.skippedRefunded += 1
      continue
    }

    if (ac.purchaseDate && sameDay(ac.purchaseDate, hm.latestApprovedDate)) {
      report.alreadyInSync += 1
      continue
    }

    report.needsWrite += 1
    const expiration = computeExpirationFromPurchaseDate(hm.latestApprovedDate)

    try {
      const ok = await activeCampaignService.updateContactField(
        ac.email,
        AC_EXPIRATION_DATE_FIELD_ID,
        formatDateYYYYMMDD(expiration)
      )
      if (ok) report.written += 1
      else report.errors.push({ email: ac.email, error: 'updateContactField devolveu false' })
    } catch (error: any) {
      report.errors.push({ email: ac.email, error: error?.message || 'Erro desconhecido ao escrever na AC' })
    }
  }

  return report
}

export default syncAcExpirationDates
