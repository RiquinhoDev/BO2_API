// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/hotmartRefunds.service.ts
// Detecção de reembolsos/chargebacks Hotmart do produto OGI (Gap A).
//
// Consulta a sales/history da Hotmart com transaction_status
// REFUNDED/CHARGEBACK numa janela recente e marca o UserProduct
// correspondente com metadata.refunded/refundedAt.
//
// ⚠️ Escreve APENAS na nossa BD — nunca toca na ActiveCampaign.
// É invocado pelo RenewalAcSync (cron desligado por defeito) ou
// manualmente via endpoint. Ver RENOVACAO_OGI_BO_PLAN.md (Gap A).
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import mongoose from 'mongoose'
import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'

const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const REFUND_STATUSES = ['REFUNDED', 'CHARGEBACK'] as const

export interface DetectedRefund {
  email: string
  transaction: string | null
  transactionStatus: string
  refundDate: Date
}

export interface RefundDetectionReport {
  windowDays: number
  salesChecked: number
  refundsFound: number
  newlyMarked: number
  alreadyMarked: number
  usersNotFound: number
  refunds: DetectedRefund[]
}

type MongooseReadModel = {
  findOne: (...args: any[]) => any
  find?: (...args: any[]) => any
}

const ProductReadModel = Product as unknown as MongooseReadModel
const UserReadModel = User as unknown as MongooseReadModel

function getValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

function firstString(obj: any, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractSalesItems(responseData: any): any[] {
  const candidates = [
    responseData?.items,
    responseData?.data,
    responseData?.sales,
    responseData?.transactions,
    responseData?.results
  ]
  const items = candidates.find(Array.isArray)
  return items || []
}

function extractNextPageToken(responseData: any): string | null {
  return responseData?.page_info?.next_page_token
    || responseData?.pageInfo?.nextPageToken
    || responseData?.pagination?.next_page_token
    || responseData?.pagination?.nextPageToken
    || responseData?.next_page_token
    || null
}

function extractProductIdFromSale(item: any): string | null {
  const value = firstString(item, [
    'purchase.product.id',
    'product.id',
    'productId',
    'product_id'
  ])
  if (value) return value
  const numeric = getValue(item, 'purchase.product.id') ?? getValue(item, 'product.id')
  return typeof numeric === 'number' ? String(numeric) : null
}

function extractRefundDate(item: any): Date {
  // A Hotmart não expõe a data do reembolso em todos os payloads;
  // usamos a data mais recente disponível na transacção como aproximação.
  const candidates = [
    getValue(item, 'purchase.approved_date'),
    getValue(item, 'purchase.order_date'),
    getValue(item, 'approved_date'),
    getValue(item, 'order_date')
  ]
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) return new Date(c)
  }
  return new Date()
}

async function resolveOgiProduct(): Promise<{ hotmartProductId: string; objectId: mongoose.Types.ObjectId }> {
  const ogiProduct = await ProductReadModel.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [
      { code: /^OGI/i },
      { courseCode: /^OGI/i },
      { name: /Grande Investimento/i }
    ]
  })
    .select('_id hotmartProductId')
    .lean()
    .exec() as { _id: mongoose.Types.ObjectId; hotmartProductId?: string } | null

  const envProductId = process.env.HOTMART_OGI_PRODUCT_ID?.trim()
  const hotmartProductId = envProductId || ogiProduct?.hotmartProductId

  if (!ogiProduct?._id || !hotmartProductId) {
    throw new Error('Produto OGI não resolvido (HOTMART_OGI_PRODUCT_ID / BD)')
  }

  return { hotmartProductId, objectId: ogiProduct._id }
}

async function fetchRefundedSales(
  accessToken: string,
  hotmartProductId: string,
  windowDays: number
): Promise<{ salesChecked: number; refunds: DetectedRefund[] }> {
  const startDate = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const refundsByTransaction = new Map<string, DetectedRefund>()
  let salesChecked = 0

  for (const status of REFUND_STATUSES) {
    let pageToken: string | null = null

    do {
      const response = await axios.get(HOTMART_SALES_HISTORY_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          transaction_status: status,
          start_date: startDate,
          max_results: 100,
          ...(pageToken ? { page_token: pageToken } : {})
        },
        timeout: 30000
      })

      for (const item of extractSalesItems(response.data)) {
        salesChecked += 1

        const productId = extractProductIdFromSale(item)
        if (!productId || productId !== hotmartProductId) continue

        const email = firstString(item, ['buyer.email', 'purchase.buyer.email'])
        if (!email) continue

        const transaction = firstString(item, ['purchase.transaction', 'transaction'])
        const key = transaction || `${email}-${status}`

        refundsByTransaction.set(key, {
          email: email.toLowerCase(),
          transaction,
          transactionStatus: status,
          refundDate: extractRefundDate(item)
        })
      }

      pageToken = extractNextPageToken(response.data)
    } while (pageToken)
  }

  return { salesChecked, refunds: [...refundsByTransaction.values()] }
}

/**
 * Detecta reembolsos Hotmart recentes do OGI e marca os UserProducts.
 * Escreve apenas metadata.refunded/refundedAt na nossa BD.
 */
export async function detectHotmartRefunds(windowDays: number = 30): Promise<RefundDetectionReport> {
  const accessToken = await getHotmartAccessToken()
  const { hotmartProductId, objectId: ogiObjectId } = await resolveOgiProduct()

  const { salesChecked, refunds } = await fetchRefundedSales(accessToken, hotmartProductId, windowDays)

  const report: RefundDetectionReport = {
    windowDays,
    salesChecked,
    refundsFound: refunds.length,
    newlyMarked: 0,
    alreadyMarked: 0,
    usersNotFound: 0,
    refunds
  }

  for (const refund of refunds) {
    const user = await UserReadModel.findOne({ email: refund.email })
      .select('_id email')
      .lean()
      .exec() as { _id: mongoose.Types.ObjectId } | null

    if (!user) {
      report.usersNotFound += 1
      continue
    }

    const result = await (UserProduct as any).updateOne(
      {
        userId: user._id,
        productId: ogiObjectId,
        platform: 'hotmart',
        'metadata.refunded': { $ne: true }
      },
      {
        $set: {
          'metadata.refunded': true,
          'metadata.refundedAt': refund.refundDate
        }
      }
    )

    if (result.modifiedCount && result.modifiedCount > 0) {
      report.newlyMarked += 1
      console.log(`💸 [HotmartRefunds] Reembolso marcado: ${refund.email} (${refund.transactionStatus}, ${refund.refundDate.toISOString().slice(0, 10)})`)
    } else {
      report.alreadyMarked += 1
    }
  }

  console.log(`💸 [HotmartRefunds] Janela ${windowDays}d: ${report.refundsFound} reembolsos OGI, ${report.newlyMarked} novos, ${report.alreadyMarked} já marcados, ${report.usersNotFound} sem user`)

  return report
}

export default detectHotmartRefunds
