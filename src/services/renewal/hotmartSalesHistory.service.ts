// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/hotmartSalesHistory.service.ts
// Sync Hotmart (Fase 1) — histórico de vendas por aluno OGI ativo.
//
// Uma única passagem paginada por TODO o sales/history (mesmo padrão
// já usado em produção por renewalSync.service.ts / hotmartRefunds.
// service.ts — sem buyer_email, filtra o produto no cliente), agrupada
// por email do comprador em memória. Depois cruza com os alunos OGI
// ACTIVE e grava só esses em HotmartSaleHistory. Muito mais barato do
// que 1 pedido por aluno — o nº de chamadas depende do volume total
// de vendas do produto, não do nº de alunos ativos.
//
// Objetivo: dar mais precisão às renovações e aos links enviados
// (datas de compra reais em vez de inferências). Escreve APENAS
// na nossa BD — nunca toca em nada externo.
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import mongoose from 'mongoose'
import HotmartSaleHistory, { IHotmartSale } from '../../models/HotmartSaleHistory'
import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { HOTMART_OGI_PRODUCT_ID, OGI_NEW_STUDENT_PRICE_THRESHOLD_EUR } from '../../config/renewalEnvironment'
import {
  HOTMART_SALES_HISTORY_MAX_LOOKBACK_DAYS,
  HOTMART_PER_EMAIL_STATUS_SWEEP,
  OGI_PRODUCT_FAMILY_IDS
} from './renewalConstants'

const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const PAGE_DELAY_MS = 500

// mesmo critério usado em acExpirationSync.service.ts / RenewalAcAlertsPanel —
// uma venda nestes estados nunca conta como venda "boa" para desempenho.
const REFUND_TRANSACTION_STATUSES = new Set(['REFUNDED', 'CHARGEBACK'])

// preço a partir do qual uma venda OGI é "aluno novo" (preço cheio) em vez
// de "renovação" (preço reduzido) — critério dado pelo negócio, editável
// por env var sem deploy. Só compara o valor numérico, independente da
// moeda (a esmagadora maioria das vendas é em EUR).
const OGI_NEW_STUDENT_PRICE_THRESHOLD = OGI_NEW_STUDENT_PRICE_THRESHOLD_EUR

export interface SalesHistorySyncReport {
  salesChecked: number
  pagesFetched: number
  totalResultsReportedByHotmart: number | null
  paginationComplete: boolean
  totalActiveStudents: number
  processed: number
  updated: number
  withSales: number
  withoutSales: number
  errors: Array<{ email: string; error: string }>
}

type MongooseReadModel = {
  findOne: (...args: any[]) => any
  find?: (...args: any[]) => any
}

const ProductReadModel = Product as unknown as MongooseReadModel
const UserReadModel = User as unknown as MongooseReadModel
const UserProductReadModel = UserProduct as unknown as MongooseReadModel

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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

function firstScalarString(obj: any, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value).trim()
    }
  }
  return null
}

function toDate(raw: any): Date | null {
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? new Date(n) : null
}

function extractOfferFromSale(item: any): { offerCode: string | null; offerName: string | null } {
  const offerCode = firstString(item, [
    'purchase.offer.code',
    'purchase.offer.offer_code',
    'purchase.offerCode',
    'purchase.offer_code',
    'offer.code',
    'offer.offer_code'
  ])
  const offerName = firstString(item, [
    'purchase.offer.name',
    'purchase.offer.offer_name',
    'purchase.offerName',
    'purchase.offer_name',
    'offer.name',
    'offer.offer_name'
  ])
  return { offerCode, offerName }
}

function extractProductIdFromSale(item: any): string | null {
  return firstScalarString(item, [
    'purchase.product.id',
    'purchase.product.product_id',
    'purchase.product.ucode',
    'purchase.productId',
    'purchase.product_id',
    'product.id',
    'product.product_id',
    'product.ucode',
    'productId',
    'product_id'
  ])
}

function extractPrice(item: any): { value: number | null; currency: string | null } {
  const value = getValue(item, 'purchase.price.value') ?? getValue(item, 'price.value')
  const currency = firstString(item, ['purchase.price.currency_code', 'price.currency_code'])
  return {
    value: typeof value === 'number' ? value : null,
    currency: currency || null
  }
}

function extractPaymentMode(item: any): string | null {
  return firstString(item, ['purchase.offer.payment_mode', 'offer.payment_mode', 'purchase.payment.type'])
}

function extractBuyerEmail(item: any): string | null {
  const email = firstString(item, ['buyer.email', 'purchase.buyer.email'])
  return email ? email.toLowerCase() : null
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

function parseSaleItem(item: any): IHotmartSale {
  const offer = extractOfferFromSale(item)
  const price = extractPrice(item)
  return {
    hotmartProductId: extractProductIdFromSale(item),
    productName: firstString(item, ['product.name', 'productName', 'product_name']),
    transaction: firstString(item, ['purchase.transaction', 'transaction']),
    offerCode: offer.offerCode,
    offerName: offer.offerName,
    transactionStatus: firstString(item, ['purchase.status', 'status']),
    approvedDate: toDate(getValue(item, 'purchase.approved_date') ?? getValue(item, 'approved_date')),
    orderDate: toDate(getValue(item, 'purchase.order_date') ?? getValue(item, 'order_date')),
    priceValue: price.value,
    currency: price.currency,
    paymentMode: extractPaymentMode(item)
  }
}

async function requestSalesPage(accessToken: string, params: Record<string, unknown>) {
  const maxRetries = 4
  let attempt = 0

  while (true) {
    try {
      return await axios.get(HOTMART_SALES_HISTORY_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params,
        timeout: 20000
      })
    } catch (error: any) {
      if (error?.response?.status !== 429 || attempt >= maxRetries) throw error
      const retryAfter = Number(error.response.headers?.['retry-after'])
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * Math.pow(2, attempt)
      await sleep(delay)
      attempt += 1
    }
  }
}

interface BulkSalesResult {
  salesByEmail: Map<string, IHotmartSale[]>
  salesChecked: number
  pagesFetched: number
  totalResultsReportedByHotmart: number | null
  paginationComplete: boolean
}

function extractTotalResults(responseData: any): number | null {
  const value = responseData?.page_info?.total_results
    ?? responseData?.pageInfo?.totalResults
    ?? responseData?.pagination?.total_results
    ?? responseData?.pagination?.totalResults
  return typeof value === 'number' ? value : null
}

/**
 * Varre TODO o sales/history uma vez (paginado, sem buyer_email — o
 * mesmo padrão já em produção) e agrupa por email do comprador, só
 * para o produto OGI. Uma passagem serve para todos os alunos.
 *
 * Autoverificação: a Hotmart devolve total_results logo na 1ª página —
 * comparamos com quantas vendas realmente processámos no fim do loop.
 * Se não bater certo, a paginação parou cedo (bug ou API mudou) —
 * fica registado no report em vez de passar despercebido.
 */
export async function fetchAllOgiSalesGroupedByEmail(
  accessToken: string,
  hotmartProductId: string,
  transactionStatusFilter?: string
): Promise<BulkSalesResult> {
  const salesByEmail = new Map<string, IHotmartSale[]>()
  let pageToken: string | null = null
  let salesChecked = 0
  let pagesFetched = 0
  let totalResultsReportedByHotmart: number | null = null

  const startDate = Date.now() - HOTMART_SALES_HISTORY_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000

  do {
    const response = await requestSalesPage(accessToken, {
      max_results: 100,
      start_date: startDate,
      ...(transactionStatusFilter ? { transaction_status: transactionStatusFilter } : {}),
      ...(pageToken ? { page_token: pageToken } : {})
    })
    pagesFetched += 1

    if (totalResultsReportedByHotmart === null) {
      totalResultsReportedByHotmart = extractTotalResults(response.data)
    }

    const items = extractSalesItems(response.data)
    console.log(`📄 [HotmartSalesSync${transactionStatusFilter ? `:${transactionStatusFilter}` : ''}] Página ${pagesFetched}: ${items.length} vendas (acumulado: ${salesChecked + items.length}${totalResultsReportedByHotmart !== null ? `/${totalResultsReportedByHotmart}` : ''})`)

    for (const item of items) {
      salesChecked += 1

      const productId = extractProductIdFromSale(item)
      if (!productId || productId !== hotmartProductId) continue

      const email = extractBuyerEmail(item)
      if (!email) continue

      const sale = parseSaleItem(item)
      // a Hotmart não garante que purchase.status reflita o filtro pedido
      // (mesmo cuidado já tomado em hotmartRefunds.service.ts) — quando
      // pedimos por transaction_status explícito, esse É o estado real.
      if (transactionStatusFilter) sale.transactionStatus = transactionStatusFilter
      const list = salesByEmail.get(email)
      if (list) list.push(sale)
      else salesByEmail.set(email, [sale])
    }

    pageToken = extractNextPageToken(response.data)
    if (pageToken) await sleep(PAGE_DELAY_MS)
  } while (pageToken)

  for (const sales of salesByEmail.values()) {
    sales.sort((a, b) => (b.approvedDate?.getTime() || 0) - (a.approvedDate?.getTime() || 0))
  }

  const paginationComplete = totalResultsReportedByHotmart === null || totalResultsReportedByHotmart === salesChecked
  if (!paginationComplete) {
    console.warn(`⚠️ [HotmartSalesSync] Hotmart reportou ${totalResultsReportedByHotmart} vendas mas só processámos ${salesChecked} em ${pagesFetched} páginas — paginação pode ter parado cedo!`)
  } else {
    console.log(`✅ [HotmartSalesSync] Paginação completa: ${pagesFetched} páginas, ${salesChecked} vendas confirmadas.`)
  }

  return { salesByEmail, salesChecked, pagesFetched, totalResultsReportedByHotmart, paginationComplete }
}

export interface MonthlySalesStat {
  month: string // 'YYYY-MM'
  year: number
  monthNum: number
  salesCount: number
  revenueByCurrency: Record<string, number>
  // novo (1ª compra / preço cheio) vs recorrente (renovação) — dá
  // previsibilidade (recorrente) vs crescimento (novo). newCount +
  // recurringCount pode ser < salesCount se alguma venda não deu para
  // classificar (ex: sem priceValue).
  newCount: number
  newRevenueByCurrency: Record<string, number>
  recurringCount: number
  recurringRevenueByCurrency: Record<string, number>
  refundedCount: number
  refundedByCurrency: Record<string, number>
}

function monthKeyFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function emptyMonthlyStat(month: string, year: number, monthNum: number): MonthlySalesStat {
  return {
    month, year, monthNum,
    salesCount: 0, revenueByCurrency: {},
    newCount: 0, newRevenueByCurrency: {},
    recurringCount: 0, recurringRevenueByCurrency: {},
    refundedCount: 0, refundedByCurrency: {}
  }
}

/**
 * Agrega TODAS as vendas já trazidas por fetchAllOgiSalesGroupedByEmail
 * (não só as de alunos ativos) por mês de aprovação — desempenho de
 * vendas, não matching de renovação. Zero chamadas extra à Hotmart:
 * reaproveita o mesmo pedido em bulk que o Sync Hotmart já faz.
 *
 * Novo vs recorrente na Hotmart: não há um campo explícito, por isso
 * usa-se o preço — venda ≥ OGI_NEW_STUDENT_PRICE_THRESHOLD (preço
 * cheio) = aluno novo; abaixo (preço de renovação) = recorrente.
 */
export function aggregateMonthlySalesStats(salesByEmail: Map<string, IHotmartSale[]>): MonthlySalesStat[] {
  const buckets = new Map<string, MonthlySalesStat>()

  for (const sales of salesByEmail.values()) {
    for (const sale of sales) {
      if (!sale.approvedDate) continue

      const month = monthKeyFromDate(sale.approvedDate)
      let bucket = buckets.get(month)
      if (!bucket) {
        const [y, m] = month.split('-').map(Number)
        bucket = emptyMonthlyStat(month, y, m)
        buckets.set(month, bucket)
      }

      const isRefund = !!sale.transactionStatus && REFUND_TRANSACTION_STATUSES.has(sale.transactionStatus)
      const currency = sale.currency || 'N/A'

      if (isRefund) {
        bucket.refundedCount += 1
        if (sale.priceValue != null) {
          bucket.refundedByCurrency[currency] = (bucket.refundedByCurrency[currency] || 0) + sale.priceValue
        }
        continue
      }

      bucket.salesCount += 1
      if (sale.priceValue != null) {
        bucket.revenueByCurrency[currency] = (bucket.revenueByCurrency[currency] || 0) + sale.priceValue

        if (sale.priceValue >= OGI_NEW_STUDENT_PRICE_THRESHOLD) {
          bucket.newCount += 1
          bucket.newRevenueByCurrency[currency] = (bucket.newRevenueByCurrency[currency] || 0) + sale.priceValue
        } else {
          bucket.recurringCount += 1
          bucket.recurringRevenueByCurrency[currency] = (bucket.recurringRevenueByCurrency[currency] || 0) + sale.priceValue
        }
      }
    }
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Vendas de UM email, sem limite de data.
 *
 * A varredura em massa (fetchAllOgiSalesGroupedByEmail) tem de mandar
 * start_date, e a Hotmart não aceita mais do que 730 dias de recuo — o que
 * significa que o histórico de cada aluno ia sendo cortado pela frente à
 * medida que o tempo passa. Uma compra de 2024-05 já caiu fora da janela em
 * Agosto de 2026.
 *
 * Com buyer_email o comportamento é outro: confirmado contra a API real que
 * devolve o histórico completo sem start_date nenhum (foi assim que
 * apareceram as três transacções de simaopedroliveira@gmail.com, incluindo a
 * de 2024-05-27, que a varredura em massa não trazia).
 *
 * Sem transaction_status a Hotmart devolve só COMPLETE e APPROVED, por isso
 * varremos também os estados de HOTMART_PER_EMAIL_STATUS_SWEEP — sem eles um
 * reembolso ou um incumprimento não apareciam em lado nenhum.
 */
export async function fetchSalesForEmail(
  accessToken: string,
  email: string,
  productIds: string[] = OGI_PRODUCT_FAMILY_IDS
): Promise<{ sales: IHotmartSale[]; requests: number }> {
  const porTransacao = new Map<string, IHotmartSale>()
  let requests = 0

  for (const status of HOTMART_PER_EMAIL_STATUS_SWEEP) {
    let pageToken: string | null = null
    let paginas = 0

    do {
      const response = await requestSalesPage(accessToken, {
        buyer_email: email,
        max_results: 100,
        ...(status ? { transaction_status: status } : {}),
        ...(pageToken ? { page_token: pageToken } : {})
      })
      requests += 1
      paginas += 1

      for (const item of extractSalesItems(response.data)) {
        const productId = extractProductIdFromSale(item)
        if (!productId || !productIds.includes(productId)) continue
        const venda = parseSaleItem(item)
        // a mesma transacção pode vir em mais do que uma passagem; a chave
        // evita duplicá-la, e o fallback cobre respostas sem transaction
        const chave = venda.transaction ?? `${productId}|${venda.orderDate?.toISOString() ?? ''}|${venda.priceValue ?? ''}`
        if (!porTransacao.has(chave)) porTransacao.set(chave, venda)
      }

      pageToken = extractNextPageToken(response.data)
      if (pageToken) await sleep(PAGE_DELAY_MS)
    } while (pageToken && paginas < 20)
  }
  // Sem pausa entre estados: são 4 chamadas curtas para o mesmo email e o
  // requestSalesPage já recua sozinho perante um 429. Com a pausa, uma corrida
  // completa levava perto de uma hora; sem ela fica em cerca de metade.

  // mais recente primeiro, para latestApprovedDate sair de sales[0]
  const sales = [...porTransacao.values()].sort((a, b) => {
    const da = a.approvedDate?.getTime() ?? a.orderDate?.getTime() ?? 0
    const db = b.approvedDate?.getTime() ?? b.orderDate?.getTime() ?? 0
    return db - da
  })

  return { sales, requests }
}

export async function resolveOgiProduct(): Promise<{ hotmartProductId: string; objectId: mongoose.Types.ObjectId }> {
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

  const envProductId = HOTMART_OGI_PRODUCT_ID
  const hotmartProductId = envProductId || ogiProduct?.hotmartProductId

  if (!ogiProduct?._id || !hotmartProductId) {
    throw new Error('Produto OGI não resolvido (HOTMART_OGI_PRODUCT_ID / BD)')
  }

  return { hotmartProductId, objectId: ogiProduct._id }
}

/**
 * Sincroniza o histórico de vendas Hotmart dos alunos OGI ativos.
 * `emails` (opcional) restringe a sync a uma lista (ex: para testar
 * ou re-sincronizar alguém específico sem correr tudo).
 */
export async function syncActiveStudentSalesHistory(emails?: string[]): Promise<SalesHistorySyncReport> {
  const accessToken = await getHotmartAccessToken()
  const { hotmartProductId, objectId: ogiObjectId } = await resolveOgiProduct()

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

  // Uma consulta por aluno, com buyer_email. Custa mais chamadas do que a
  // varredura em massa, mas é a única forma de ter o histórico completo:
  // a varredura obriga a start_date (máximo 730 dias na Hotmart) e ia
  // cortando as compras antigas à medida que o tempo passa. Ver
  // fetchSalesForEmail. A varredura continua a existir e a ser usada pelos
  // agregados mensais, onde a janela não faz mal.
  let pedidos = 0
  let vendasVistas = 0

  const report: SalesHistorySyncReport = {
    salesChecked: 0,
    pagesFetched: 0,
    totalResultsReportedByHotmart: null,
    paginationComplete: true,
    totalActiveStudents: users.length,
    processed: 0,
    updated: 0,
    withSales: 0,
    withoutSales: 0,
    errors: []
  }

  for (const user of users) {
    report.processed += 1
    try {
      const { sales, requests } = await fetchSalesForEmail(accessToken, user.email)
      pedidos += requests
      vendasVistas += sales.length
      const latest = sales[0] || null

      await HotmartSaleHistory.updateOne(
        { userId: user._id, hotmartProductId },
        {
          $set: {
            email: user.email,
            productId: ogiObjectId,
            sales,
            salesCount: sales.length,
            latestApprovedDate: latest?.approvedDate || null,
            latestOfferCode: latest?.offerCode || null,
            latestTransactionStatus: latest?.transactionStatus || null,
            lastSyncedAt: new Date(),
            syncError: null
          }
        },
        { upsert: true }
      )

      report.updated += 1
      report.salesChecked = vendasVistas
      report.pagesFetched = pedidos
      if (sales.length > 0) report.withSales += 1
      else report.withoutSales += 1
    } catch (error: any) {
      const message = error?.message || 'Erro desconhecido ao gravar histórico'
      report.errors.push({ email: user.email, error: message })

      await HotmartSaleHistory.updateOne(
        { userId: user._id, hotmartProductId },
        { $set: { email: user.email, productId: ogiObjectId, syncError: message, lastSyncedAt: new Date() } },
        { upsert: true }
      )
    }
  }

  return report
}

export default syncActiveStudentSalesHistory
