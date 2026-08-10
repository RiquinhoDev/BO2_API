import axios from 'axios'
import type { IUser } from '../../../models/user'
import type { CrossReferenceResult } from '../crossReference.service'
import { getGuruUserToken } from '../../requestDrivenRuntimeConfig'

const GURU_SUBSCRIPTIONS_API_URL = 'https://digitalmanager.guru/api/v2'

console.log('ðŸ”§ [GURU CONFIG] Subscriptions API URL:', GURU_SUBSCRIPTIONS_API_URL)

const guruApi = axios.create({
  baseURL: GURU_SUBSCRIPTIONS_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
})

guruApi.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getGuruUserToken()}`
  console.log(`ðŸ“¡ [GURU API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
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
  next_cursor?: string
  total_rows?: number
  on_last_page?: number
}

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
  console.log('📡 [GURU SYNC] Buscando subscrições da Guru...')

  try {
    const requestParams = {
      status: params?.status,
      page: params?.page || 1,
      per_page: params?.limit || 100
    }
    console.log('📤 [GURU SYNC] Params:', requestParams)

    const response = await guruApi.get<GuruListResponse | GuruSubscription[]>('/subscriptions', {
      params: requestParams
    })

    const subscriptions = Array.isArray(response.data)
      ? response.data
      : response.data.data || []
    console.log(`✅ [GURU SYNC] Pedido: ${requestParams.per_page}, Recebido: ${subscriptions.length} subscrições`)

    return subscriptions
  } catch (error: unknown) {
    const details = guruApiErrorDetails(error)
    console.error('❌ [GURU SYNC] Erro ao buscar subscrições:')
    console.error('   Status:', details.status)
    console.error('   URL:', details.url)
    console.error('   Data:', JSON.stringify(details.data, null, 2))
    console.error('   Message:', details.message)
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
  },
  // Progresso página-a-página (fetched, totalEsperado) — usado pela barra de progresso do churn live
  onProgress?: (fetched: number, total: number | null) => void
): Promise<GuruSubscription[]> {
  console.log('📡 [GURU SYNC] Buscando TODAS as subscrições (cursor-based pagination)...')
  if (additionalParams?.started_at_ini || additionalParams?.started_at_end) {
    console.log(`📅 [GURU SYNC] Filtros de data: ${additionalParams.started_at_ini || 'início'} até ${additionalParams.started_at_end || 'fim'}`)
  }

  const allSubscriptions: GuruSubscription[] = []
  let cursor: string | undefined = undefined
  let hasMore = true
  let pageNumber = 0
  let totalExpected: number | null = null

  while (hasMore) {
    try {
      pageNumber++

      // GURU usa cursor-based pagination, não page-based!
      const requestParams: {
        per_page: number
        cursor?: string
        started_at_ini?: string
        started_at_end?: string
        status?: string
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

      console.log(`📤 [GURU SYNC] Requisição ${pageNumber} com params:`, requestParams)

      const response = await guruApi.get<GuruListResponse>('/subscriptions', {
        params: requestParams
      })

      const data = response.data?.data || []
      const hasMorePages = response.data?.has_more_pages === 1
      const nextCursor = typeof response.data?.next_cursor === 'string'
        ? response.data.next_cursor
        : undefined
      const totalRows = response.data?.total_rows
      const onLastPage = response.data?.on_last_page === 1

      // Guardar total na primeira página
      if (pageNumber === 1 && typeof totalRows === 'number') {
        totalExpected = totalRows
        console.log(`📊 [GURU SYNC] Total esperado: ${totalRows} subscrições`)
      }

      console.log(`📄 [GURU SYNC] Página ${pageNumber}: ${data.length} subscrições | has_more=${hasMorePages} | on_last=${onLastPage} | acumulado=${allSubscriptions.length + data.length}/${totalExpected || '?'}`)

      // Adicionar dados ao array
      allSubscriptions.push(...data)
      onProgress?.(allSubscriptions.length, totalExpected)

      // Verificar se há mais páginas usando os flags da API
      if (onLastPage || !hasMorePages || data.length === 0 || !nextCursor) {
        hasMore = false
        console.log('⏹️ [GURU SYNC] Última página alcançada!')
      } else {
        cursor = nextCursor
        hasMore = true
        console.log(`➡️ [GURU SYNC] Próximo cursor: ${nextCursor.substring(0, 50)}...`)
      }

      // Rate limiting - esperar 300ms entre requests
      await new Promise(resolve => setTimeout(resolve, 300))

    } catch (error: unknown) {
      const details = guruApiErrorDetails(error)
      console.error(`❌ [GURU SYNC] Erro na requisição ${pageNumber}:`)
      console.error('   Status:', details.status)
      console.error('   URL:', details.url)
      console.error('   Data:', JSON.stringify(details.data, null, 2))
      hasMore = false
    }
  }

  console.log(`✅ [GURU SYNC] Total obtido: ${allSubscriptions.length} subscrições (esperado: ${totalExpected || 'desconhecido'})`)
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

  console.log(`📅 [GURU SNAPSHOT] Buscando subscrições de ${month}/${year} (${started_at_ini} até ${started_at_end})`)

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
  onProgress?: (fetched: number, total: number | null) => void
): Promise<GuruSubscription[]> {
  console.log('📡 [GURU SNAPSHOT] Buscando TODAS as subscrições (SEM FILTROS)...')

  // Chamar sem parâmetros = busca tudo
  return fetchAllSubscriptionsPaginated(undefined, onProgress)
}

/**
 * Buscar subscrição por ID
 */
export async function fetchSubscriptionById(subscriptionId: string): Promise<GuruSubscription | null> {
  try {
    const response = await guruApi.get<GuruSubscriptionResponse | GuruSubscription>(`/subscriptions/${subscriptionId}`)
    return 'id' in response.data ? response.data : response.data.data || null
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
    console.error(`❌ [GURU SYNC] Erro ao buscar subscrições do contacto ${contactId}:`, guruApiErrorDetails(error).message)
    return []
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE ESCRITA NA NOSSA BD (NUNCA NA GURU!)
// ═══════════════════════════════════════════════════════════

/**
 * Mapear status da Guru para o nosso formato
 */
