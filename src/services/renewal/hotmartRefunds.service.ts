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
// manualmente via endpoint. Ver docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md (Gap A).
// ════════════════════════════════════════════════════════════

import logger from '../../utils/logger'
import axios from 'axios'
import mongoose from 'mongoose'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import { HttpError } from '../../security/errorHandling'
import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { MAX_PROVIDER_READ_ITEMS } from '../../security/providerReadBatchPolicy'
import type { CronExecutionPhaseHooks } from '../cron/scheduler/executionPhases'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'

const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const REFUND_STATUSES = ['REFUNDED', 'CHARGEBACK'] as const
export const MAX_RENEWAL_REFUND_SALES = MAX_PROVIDER_READ_ITEMS

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

export interface PreparedRefundUserProduct {
  _id?: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  metadata?: { refunded?: boolean; refundedAt?: Date }
  platformData?: { renewalAc?: { appliedTurmaTag?: string } }
}

export interface PreparedRefundDetection {
  report: RefundDetectionReport
  ogiObjectId: mongoose.Types.ObjectId
  refundedUps: PreparedRefundUserProduct[]
  pendingMarks: Array<{ userId: mongoose.Types.ObjectId; refundDate: Date }>
}

function getValue(obj: unknown, path: string): unknown {
  let current = obj
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || !(key in current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function firstString(obj: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractSalesItems(responseData: unknown): unknown[] {
  const candidates = ['items', 'data', 'sales', 'transactions', 'results'].map(key => getValue(responseData, key))
  const items = candidates.find(Array.isArray)
  return items || []
}

function extractNextPageToken(responseData: unknown): string | null {
  return firstString(responseData, [
    'page_info.next_page_token',
    'pageInfo.nextPageToken',
    'pagination.next_page_token',
    'pagination.nextPageToken',
    'next_page_token',
  ])
}

function extractProductIdFromSale(item: unknown): string | null {
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

function extractRefundDate(item: unknown): Date {
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
  const ogiProduct = await Product.findOne({
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

  const envProductId = getRuntimeConfig().renewal.hotmartOgiProductId
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
        if (salesChecked > MAX_RENEWAL_REFUND_SALES) {
          throw new HttpError({
            status: 413,
            code: 'RENEWAL_AC_REFUND_SCAN_CAP_EXCEEDED',
            publicMessage: 'Leitura de reembolsos Renewal AC excede o limite permitido',
          })
        }

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

export async function prepareHotmartRefunds(windowDays: number = 30): Promise<PreparedRefundDetection> {
  const accessToken = await getHotmartAccessToken()
  const { hotmartProductId, objectId: ogiObjectId } = await resolveOgiProduct()

  const { salesChecked, refunds: unsortedRefunds } = await fetchRefundedSales(accessToken, hotmartProductId, windowDays)
  const refunds = unsortedRefunds.sort((left, right) =>
    left.refundDate.getTime() - right.refundDate.getTime()
    || left.email.localeCompare(right.email)
    || (left.transaction || '').localeCompare(right.transaction || '')
    || left.transactionStatus.localeCompare(right.transactionStatus))

  const report: RefundDetectionReport = {
    windowDays,
    salesChecked,
    refundsFound: refunds.length,
    newlyMarked: 0,
    alreadyMarked: 0,
    usersNotFound: 0,
    refunds
  }

  const emails = [...new Set(refunds.map((refund) => refund.email))]
  const users = emails.length
    ? await User.find({ email: { $in: emails } })
      .sort({ email: 1, _id: 1 })
      .limit(MAX_RENEWAL_REFUND_SALES + 1)
      .select('_id email')
      .lean()
      .exec() as Array<{ _id: mongoose.Types.ObjectId; email: string }>
    : []
  if (users.length > MAX_RENEWAL_REFUND_SALES) {
    throw new HttpError({
      status: 413,
      code: 'RENEWAL_AC_REFUND_SCAN_CAP_EXCEEDED',
      publicMessage: 'Leitura de reembolsos Renewal AC excede o limite permitido',
    })
  }

  const userIds = users.map((user) => user._id)
  const userProducts = userIds.length
    ? await UserProduct.find({
      userId: { $in: userIds },
      productId: ogiObjectId,
      platform: 'hotmart',
    })
      .sort({ 'metadata.refundedAt': 1, _id: 1 })
      .limit(MAX_RENEWAL_REFUND_SALES + 1)
      .select('_id userId metadata platformData')
      .lean()
      .exec() as PreparedRefundUserProduct[]
    : []
  if (userProducts.length > MAX_RENEWAL_REFUND_SALES) {
    throw new HttpError({
      status: 413,
      code: 'RENEWAL_AC_REFUND_SCAN_CAP_EXCEEDED',
      publicMessage: 'Leitura de reembolsos Renewal AC excede o limite permitido',
    })
  }

  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))
  const productsByUser = new Map<string, PreparedRefundUserProduct>()
  for (const userProduct of userProducts) {
    const key = String(userProduct.userId)
    if (!productsByUser.has(key)) productsByUser.set(key, userProduct)
  }

  const pendingMarks: PreparedRefundDetection['pendingMarks'] = []
  const refundedUps: PreparedRefundUserProduct[] = []
  const pendingByUser = new Set<string>()
  for (const refund of refunds) {
    const user = usersByEmail.get(refund.email)
    if (!user) {
      report.usersNotFound += 1
      continue
    }
    const userProduct = productsByUser.get(String(user._id))
    if (!userProduct || userProduct.metadata?.refunded === true) {
      report.alreadyMarked += 1
      continue
    }
    if (pendingByUser.has(String(user._id))) continue
    pendingByUser.add(String(user._id))
    pendingMarks.push({ userId: user._id, refundDate: refund.refundDate })
    refundedUps.push({
      ...userProduct,
      metadata: { ...userProduct.metadata, refunded: true, refundedAt: refund.refundDate },
    })
  }

  report.newlyMarked = pendingMarks.length
  return { report, ogiObjectId, refundedUps, pendingMarks }
}

export async function applyHotmartRefunds(
  prepared: PreparedRefundDetection,
  options: { phaseHooks?: CronExecutionPhaseHooks } = {},
): Promise<RefundDetectionReport> {
  for (const mark of prepared.pendingMarks) {
    options.phaseHooks?.localMutationStarted()
    options.phaseHooks?.assertOwnership?.()
    const result = await UserProduct.updateOne(
      {
        userId: mark.userId,
        productId: prepared.ogiObjectId,
        platform: 'hotmart',
        'metadata.refunded': { $ne: true }
      },
      { $set: { 'metadata.refunded': true, 'metadata.refundedAt': mark.refundDate } }
    )
    if (result.modifiedCount && result.modifiedCount > 0) {
      logger.info(`💸 [HotmartRefunds] Reembolso marcado: ${String(mark.userId)} (${mark.refundDate.toISOString().slice(0, 10)})`)
    } else {
      prepared.report.newlyMarked = Math.max(0, prepared.report.newlyMarked - 1)
      prepared.report.alreadyMarked += 1
    }
  }
  logger.info(`💸 [HotmartRefunds] Janela ${prepared.report.windowDays}d: ${prepared.report.refundsFound} reembolsos OGI, ${prepared.report.newlyMarked} novos, ${prepared.report.alreadyMarked} já marcados, ${prepared.report.usersNotFound} sem user`)

  return prepared.report
}

/** Detecta reembolsos Hotmart recentes do OGI e marca os UserProducts. */
export async function detectHotmartRefunds(
  windowDays: number = 30,
  options: { phaseHooks?: CronExecutionPhaseHooks } = {},
): Promise<RefundDetectionReport> {
  const prepared = await prepareHotmartRefunds(windowDays)
  return applyHotmartRefunds(prepared, options)
}

export default detectHotmartRefunds
