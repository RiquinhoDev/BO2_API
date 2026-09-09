import logger from '../../../utils/logger'
import axios from 'axios'
import type { IUser } from '../../../models/user'
import type { CrossReferenceResult } from '../crossReference.service'
import { getGuruUserToken } from '../../requestDrivenRuntimeConfig'

const GURU_SUBSCRIPTIONS_API_URL = 'https://digitalmanager.guru/api/v2'

logger.info('ðŸ”§ [GURU CONFIG] Subscriptions API URL:', GURU_SUBSCRIPTIONS_API_URL)

const guruApi = axios.create({
  baseURL: GURU_SUBSCRIPTIONS_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
})

guruApi.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getGuruUserToken()}`
  logger.info(`ðŸ“¡ [GURU API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
  return config
})

export interface GuruSubscription {
  id: string
  subscription_code: string
  last_status: string
  started_at?: string | number
  cancelled_at?: string | number
  canceled_at?: string | number
  name: string
  payment_method: string
  charged_every_days: number
  next_cycle_value: number
  dates: {
    started_at: string
    created_at?: string
    canceled_at?: string
    cancelled_at?: string
    next_cycle_at?: string
    last_status_at: string
  }
  subscriber: {
    id: string
    email: string
    name: string
    phone_number?: string
    phone_local_code?: string
    doc?: string
  }
  product: {
    id: string
    name: string
    marketplace_id?: string
    offer?: {
      id: string
      name: string
      value: number
    }
  }
  current_invoice?: {
    status: string
    value: number
    payment_url?: string
  }
  // Trial
  trial_days?: number
  trial_started_at?: string
  trial_finished_at?: string
  status?: string
  contact?: {
    id?: string
    email?: string
    name?: string
  }
  email?: string
  customer?: {
    email?: string
  }
  code?: string
  offer?: {
    id?: string
  }
  product_id?: string
}

export interface GuruContact {
  id: string
  email: string
  name: string
  phone_number?: string
  phone_local_code?: string
  doc?: string
  created_at: string
}

export interface SyncResult {
  total: number
  created: number
  updated: number
  skipped: number
  errors: number
  markedForInactivation: number
  uniqueEmails: number
  multiSubEmails: number
  crossReference?: CrossReferenceResult
  details: Array<{
    email: string
    action: 'created' | 'updated' | 'skipped' | 'error'
    error?: string
    markedForInactivation?: number
  }>
}

export type GuruStatus = NonNullable<IUser['guru']>['status']

interface GuruListResponse {
  data?: GuruSubscription[]
  has_more_pages?: number
  next_cursor?: string | null
  total_rows?: number
  on_last_page?: number
}

export interface GuruPaginationLimits {
  readonly maxPages?: number
  readonly maxItems?: number
  readonly beforeRequest?: () => void
  readonly requestSucceeded?: () => void
}

const DEFAULT_GURU_MAX_PAGES = 400

interface GuruContactListResponse {
  data?: GuruContact[]
}

interface GuruSubscriptionResponse {
  data?: GuruSubscription
}

export interface GuruSyncData {
  guruContactId?: string
  subscriptionCode?: string
  status: GuruStatus
  updatedAt?: Date
  nextCycleAt?: Date
  offerId?: string
  productId?: string
  paymentUrl?: string
  isTrial?: boolean
  trialStartedAt?: Date
  trialFinishedAt?: Date
  trialConvertedAt?: Date
  lastSyncAt: Date
  syncVersion: string
  lastWebhookAt?: Date
}

export interface GuruApiErrorDetails {
  status?: number
  url?: string
  data?: unknown
  message: string
}

export function guruApiErrorDetails(error: unknown): GuruApiErrorDetails {
  if (axios.isAxiosError(error)) {
    return {
      status: error.response?.status,
      url: `${error.config?.baseURL || ''}${error.config?.url || ''}` || undefined,
      data: error.response?.data,
      message: error.message,
    }
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  }
}

export function subscriptionEmail(subscription: GuruSubscription): string | undefined {
  return (
    subscription.subscriber?.email ||
    subscription.contact?.email ||
    subscription.email ||
    subscription.customer?.email
  )?.toLowerCase().trim()
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE LEITURA DA API GURU (NUNCA ESCREVEM NA GURU!)
// ═══════════════════════════════════════════════════════════

/**
 * Buscar todas as subscrições da Guru
 * GET /subscriptions
 */

export async function fetchAllSubscriptions(params?: {
  status?: string
  page?: number
  limit?: number
}): Promise<GuruSubscription[]> {
  logger.info('📡 [GURU SYNC] Buscando subscrições da Guru...')

  try {
    const requestParams = {
      status: params?.status,
      page: params?.page || 1,
      per_page: params?.limit || 100
    }
    logger.info('📤 [GURU SYNC] Params:', requestParams)

    const response = await guruApi.get<GuruListResponse | GuruSubscription[]>('/subscriptions', {
      params: requestParams
    })

    const subscriptions = Array.isArray(response.data)
      ? response.data
      : response.data.data || []
    logger.info(`✅ [GURU SYNC] Pedido: ${requestParams.per_page}, Recebido: ${subscriptions.length} subscrições`)

    return subscriptions
  } catch (error: unknown) {
    const details = guruApiErrorDetails(error)
    logger.error('❌ [GURU SYNC] Erro ao buscar subscrições:')
    logger.error('   Status:', details.status)
    logger.error('   URL:', details.url)
    logger.error('   Data:', JSON.stringify(details.data, null, 2))
    logger.error('   Message:', details.message)
    throw error
  }
}

/**
 * Buscar todas as páginas de subscrições
 */
export async function fetchAllSubscriptionsPaginated(
  additionalParams?: {
    started_at_ini?: string // YYYY-MM-DD
    started_at_end?: string // YYYY-MM-DD
    status?: string
    product_id?: string
  },
  // Progresso página-a-página (fetched, totalEsperado) — usado pela barra de progresso do churn live
  onProgress?: (fetched: number, total: number | null) => void,
  limits: GuruPaginationLimits = {},
): Promise<GuruSubscription[]> {
  logger.info('📡 [GURU SYNC] Buscando TODAS as subscrições (cursor-based pagination)...')
  if (additionalParams?.started_at_ini || additionalParams?.started_at_end) {
    logger.info(`📅 [GURU SYNC] Filtros de data: ${additionalParams.started_at_ini || 'início'} até ${additionalParams.started_at_end || 'fim'}`)
  }

  const allSubscriptions: GuruSubscription[] = []
  let cursor: string | undefined = undefined
  let hasMore = true
  let pageNumber = 0
  let totalExpected: number | null = null
  const maxPages = limits.maxPages ?? DEFAULT_GURU_MAX_PAGES
  const maxItems = limits.maxItems ?? Number.MAX_SAFE_INTEGER
  const seenCursors = new Set<string>()

  while (hasMore) {
    try {
      pageNumber++
      if (pageNumber > maxPages) {
        throw new Error(`GURU_PAGINATION_PAGE_LIMIT_EXCEEDED:${maxPages}`)
      }

      // GURU usa cursor-based pagination, não page-based!
      const requestParams: {
        per_page: number
        cursor?: string
        started_at_ini?: string
        started_at_end?: string
        status?: string
        product_id?: string
      } = {
        per_page: 50 // Máximo permitido pela API da Guru
      }

      // Se temos cursor, adicionar aos params (não enviar na primeira req)
      if (cursor) {
        requestParams.cursor = cursor
      }

      // Adicionar filtros de data se fornecidos
      if (additionalParams?.started_at_ini) {
        requestParams.started_at_ini = additionalParams.started_at_ini
      }
      if (additionalParams?.started_at_end) {
        requestParams.started_at_end = additionalParams.started_at_end
      }
      if (additionalParams?.status) {
        requestParams.status = additionalParams.status
      }
      if (additionalParams?.product_id) {
        requestParams.product_id = additionalParams.product_id
      }

      logger.info(`📤 [GURU SYNC] Requisição ${pageNumber} com params:`, requestParams)

      limits.beforeRequest?.()
      const response = await guruApi.get<GuruListResponse>('/subscriptions', {
        params: requestParams
      })

      const rawEnvelope: unknown = response.data
      if (!rawEnvelope || typeof rawEnvelope !== 'object' || Array.isArray(rawEnvelope)) {
        throw new Error('GURU_PAGINATION_ENVELOPE_INVALID')
      }
      const envelope = rawEnvelope as Record<string, unknown>
      const data = envelope.data
      const hasMoreRaw = envelope.has_more_pages
      const onLastRaw = envelope.on_last_page
      const totalRows = envelope.total_rows
      const nextCursorRaw = envelope.next_cursor
      if (!Array.isArray(data)
        || typeof hasMoreRaw !== 'number' || !Number.isInteger(hasMoreRaw) || ![0, 1].includes(hasMoreRaw)
        || typeof onLastRaw !== 'number' || !Number.isInteger(onLastRaw) || ![0, 1].includes(onLastRaw)
        || (nextCursorRaw !== undefined && nextCursorRaw !== null
          && (typeof nextCursorRaw !== 'string' || !nextCursorRaw.trim()))) {
        throw new Error('GURU_PAGINATION_ENVELOPE_INVALID')
      }
      const hasMorePages = hasMoreRaw === 1
      const onLastPage = onLastRaw === 1
      const nextCursor = typeof nextCursorRaw === 'string' ? nextCursorRaw : undefined
      if (hasMorePages === onLastPage || (!hasMorePages && nextCursor !== undefined)) {
        throw new Error('GURU_PAGINATION_ENVELOPE_CONTRADICTORY')
      }

      // Guardar total na primeira página
      if (pageNumber === 1) {
        if (typeof totalRows !== 'number' || !Number.isInteger(totalRows) || totalRows < 0) {
          throw new Error('GURU_PAGINATION_ENVELOPE_INVALID')
        }
        if (totalRows > maxItems) {
          throw new Error(`GURU_PAGINATION_ITEM_LIMIT_EXCEEDED:${totalRows}:${maxItems}`)
        }
        totalExpected = totalRows
        logger.info(`📊 [GURU SYNC] Total esperado: ${totalRows} subscrições`)
      } else if (totalRows !== undefined) {
        if (typeof totalRows !== 'number' || !Number.isInteger(totalRows) || totalRows < 0) {
          throw new Error('GURU_PAGINATION_ENVELOPE_INVALID')
        }
        if (totalRows !== totalExpected) {
          throw new Error('GURU_PAGINATION_TOTAL_MISMATCH')
        }
      }

      logger.info(`📄 [GURU SYNC] Página ${pageNumber}: ${data.length} subscrições | has_more=${hasMorePages} | on_last=${onLastPage} | acumulado=${allSubscriptions.length + data.length}/${totalExpected || '?'}`)

      if (allSubscriptions.length + data.length > maxItems) {
        throw new Error(`GURU_PAGINATION_ITEM_LIMIT_EXCEEDED:${allSubscriptions.length + data.length}:${maxItems}`)
      }

      // Adicionar dados ao array only after the bounded page check.
      for (const item of data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error('GURU_PAGINATION_ITEM_INVALID')
        }
      }
      allSubscriptions.push(...data as GuruSubscription[])
      if (allSubscriptions.length > (totalExpected as number)) {
        throw new Error('GURU_PAGINATION_TOTAL_MISMATCH')
      }
      if (!hasMorePages && allSubscriptions.length !== totalExpected) {
        throw new Error('GURU_PAGINATION_FINAL_COUNT_MISMATCH')
      }

      // Verificar se há mais páginas usando os flags da API
      if (onLastPage || !hasMorePages) {
        hasMore = false
        logger.info('⏹️ [GURU SYNC] Última página alcançada!')
      } else {
        if (data.length === 0 || !nextCursor || nextCursor === cursor || seenCursors.has(nextCursor)) {
          throw new Error('GURU_PAGINATION_NON_PROGRESS')
        }
        seenCursors.add(nextCursor)
        cursor = nextCursor
        hasMore = true
        logger.info(`➡️ [GURU SYNC] Próximo cursor: ${nextCursor.substring(0, 50)}...`)
      }

      // A page is successful only after envelope, count, cursor and progress checks.
      limits.requestSucceeded?.()
      onProgress?.(allSubscriptions.length, totalExpected)

      // Rate limiting - esperar 300ms entre requests
      await new Promise(resolve => setTimeout(resolve, 300))

    } catch (error: unknown) {
      const details = guruApiErrorDetails(error)
      logger.error(`❌ [GURU SYNC] Erro na requisição ${pageNumber}:`)
      logger.error('   Status:', details.status)
      logger.error('   URL:', details.url)
      logger.error('   Data:', JSON.stringify(details.data, null, 2))
      throw error
    }
  }

  logger.info(`✅ [GURU SYNC] Total obtido: ${allSubscriptions.length} subscrições (esperado: ${totalExpected || 'desconhecido'})`)
  return allSubscriptions
}

/**
 * Buscar subscrições de um mês específico (para snapshots históricos)
 * NOTA: Esta função está DEPRECATED - usar fetchAllSubscriptionsComplete() + filtro local
 */
export async function fetchSubscriptionsByMonth(year: number, month: number): Promise<GuruSubscription[]> {
  // Calcular início e fim do mês
  const startDate = new Date(year, month - 1, 1) // month é 1-12, Date precisa 0-11
  const endDate = new Date(year, month, 0, 23, 59, 59) // Último dia do mês

  const started_at_ini = startDate.toISOString().split('T')[0] // YYYY-MM-DD
  const started_at_end = endDate.toISOString().split('T')[0] // YYYY-MM-DD

  logger.info(`📅 [GURU SNAPSHOT] Buscando subscrições de ${month}/${year} (${started_at_ini} até ${started_at_end})`)

  return fetchAllSubscriptionsPaginated({
    started_at_ini,
    started_at_end
  })
}

/**
 * Buscar TODAS as subscrições da Guru (sem filtros)
 * Para criar snapshots históricos precisos
 */
export async function fetchAllSubscriptionsComplete(
  onProgress?: (fetched: number, total: number | null) => void,
  limits?: GuruPaginationLimits,
): Promise<GuruSubscription[]> {
  logger.info('📡 [GURU SNAPSHOT] Buscando TODAS as subscrições (SEM FILTROS)...')

  // Chamar sem parâmetros = busca tudo
  return fetchAllSubscriptionsPaginated(undefined, onProgress, limits)
}

/**
 * Buscar subscrição por ID
 */
export async function fetchSubscriptionById(
  subscriptionId: string,
  options: { beforeRequest?: () => void; requestSucceeded?: () => void } = {},
): Promise<GuruSubscription | null> {
  try {
    options.beforeRequest?.()
    const response = await guruApi.get<GuruSubscriptionResponse | GuruSubscription>(`/subscriptions/${subscriptionId}`)
    if (!response.data || typeof response.data !== 'object') throw new Error('GURU_SUBSCRIPTION_ENVELOPE_INVALID')
    const payload = 'id' in response.data
      ? response.data
      : response.data.data
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('GURU_SUBSCRIPTION_ENVELOPE_INVALID')
    }
    options.requestSucceeded?.()
    return payload as GuruSubscription
  } catch (error: unknown) {
    if (guruApiErrorDetails(error).status === 404) {
      return null
    }
    throw error
  }
}

/**
 * Buscar contacto por email
 */
export async function fetchContactByEmail(email: string): Promise<GuruContact | null> {
  try {
    const response = await guruApi.get<GuruContactListResponse | GuruContact[]>('/contacts', {
      params: { email }
    })
    const contacts = Array.isArray(response.data)
      ? response.data
      : response.data.data || []
    return contacts[0] || null
  } catch (error: unknown) {
    if (guruApiErrorDetails(error).status === 404) {
      return null
    }
    throw error
  }
}

/**
 * Buscar subscrições de um contacto
 */
export async function fetchContactSubscriptions(contactId: string): Promise<GuruSubscription[]> {
  try {
    const response = await guruApi.get<GuruListResponse | GuruSubscription[]>(`/contacts/${contactId}/subscriptions`)
    return Array.isArray(response.data) ? response.data : response.data.data || []
  } catch (error: unknown) {
    logger.error(`❌ [GURU SYNC] Erro ao buscar subscrições do contacto ${contactId}:`, guruApiErrorDetails(error).message)
    return []
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE ESCRITA NA NOSSA BD (NUNCA NA GURU!)
// ═══════════════════════════════════════════════════════════

/**
 * Mapear status da Guru para o nosso formato
 */
