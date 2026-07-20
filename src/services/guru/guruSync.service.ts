// src/services/guru/guruSync.service.ts - Serviço para sincronizar dados da Guru (APENAS LEITURA)
import axios from 'axios'
import User, { type IUser } from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type { CrossReferenceResult } from './crossReference.service'
import {
  GURU_CANCELED_STATUSES,
  getStatusPriority,
  isStatusBetterOrEqual as sharedIsStatusBetterOrEqual,
  getEffectiveStatus,
  type GuruDateInfo
} from './guru.constants'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

// URL base para API de subscriptions (diferente do myorders)
const GURU_SUBSCRIPTIONS_API_URL = 'https://digitalmanager.guru/api/v2'
const GURU_USER_TOKEN = process.env.GURU_USER_TOKEN

// Log de configuração no arranque
console.log('🔧 [GURU CONFIG] Subscriptions API URL:', GURU_SUBSCRIPTIONS_API_URL)
console.log('🔧 [GURU CONFIG] Token configurado:', GURU_USER_TOKEN ? 'SIM (' + GURU_USER_TOKEN.substring(0, 10) + '...)' : 'NÃO!')

// Axios instance para API Guru (subscriptions/contacts)
const guruApi = axios.create({
  baseURL: GURU_SUBSCRIPTIONS_API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
})

// Adicionar token em cada request
guruApi.interceptors.request.use((config) => {
  if (GURU_USER_TOKEN) {
    config.headers.Authorization = `Bearer ${GURU_USER_TOKEN}`
  }
  console.log(`📡 [GURU API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
  return config
})

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

export interface GuruSubscription {
  id: string
  subscription_code: string
  last_status: string
  started_at?: string | number
  name: string
  payment_method: string
  charged_every_days: number
  next_cycle_value: number
  dates: {
    started_at: string
    created_at?: string
    canceled_at?: string
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

interface GuruContact {
  id: string
  email: string
  name: string
  phone_number?: string
  phone_local_code?: string
  doc?: string
  created_at: string
}

interface SyncResult {
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

type GuruStatus = NonNullable<IUser['guru']>['status']

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

interface GuruSyncData {
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

interface GuruApiErrorDetails {
  status?: number
  url?: string
  data?: unknown
  message: string
}

function guruApiErrorDetails(error: unknown): GuruApiErrorDetails {
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

function subscriptionEmail(subscription: GuruSubscription): string | undefined {
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
function mapGuruStatus(guruStatus: string): GuruStatus {
  const statusMap: Record<string, GuruStatus> = {
    'active': 'active',
    'paid': 'active',
    'trialing': 'trial',
    'trial': 'trial',
    'past_due': 'pastdue',
    'pastdue': 'pastdue',
    'unpaid': 'pastdue',
    'canceled': 'canceled',
    'cancelled': 'canceled',
    'expired': 'expired',
    'pending': 'pending',
    'refunded': 'refunded',
    'suspended': 'suspended'
  }
  return statusMap[guruStatus?.toLowerCase()] || 'pending'
}

/**
 * Guardar subscrição na nossa BD
 * NOTA: Também marca UserProducts como PARA_INATIVAR se status for cancelado
 */
export async function saveSubscriptionToDb(subscription: GuruSubscription): Promise<{
  action: 'created' | 'updated' | 'skipped'
  email: string
  markedForInactivation?: number
}> {
  // Tentar encontrar o email em diferentes locais da estrutura
  const email = subscriptionEmail(subscription)

  if (!email) {
    console.warn('⚠️ [GURU SYNC] Subscrição sem email:', JSON.stringify({
      id: subscription.id,
      code: subscription.subscription_code,
      subscriber: subscription.subscriber,
      keys: Object.keys(subscription)
    }, null, 2))
    return { action: 'skipped', email: 'sem-email' }
  }

  const mappedStatus = mapGuruStatus(subscription.last_status || subscription.status || '')

  const guruData: GuruSyncData = {
    guruContactId: subscription.subscriber?.id || subscription.contact?.id,
    subscriptionCode: subscription.subscription_code || subscription.code || subscription.id,
    status: mappedStatus,
    updatedAt: subscription.dates?.last_status_at ? new Date(subscription.dates.last_status_at)
      : subscription.dates?.started_at ? new Date(subscription.dates.started_at)
      : subscription.dates?.created_at ? new Date(subscription.dates.created_at)
      : undefined,
    nextCycleAt: subscription.dates?.next_cycle_at ? new Date(subscription.dates.next_cycle_at) : undefined,
    offerId: subscription.product?.offer?.id || subscription.offer?.id,
    productId: subscription.product?.id || subscription.product_id,
    paymentUrl: subscription.current_invoice?.payment_url,
    // Trial
    isTrial: mappedStatus === 'trial',
    trialStartedAt: subscription.trial_started_at ? new Date(subscription.trial_started_at) : undefined,
    trialFinishedAt: subscription.trial_finished_at ? new Date(subscription.trial_finished_at) : undefined,
    // Se era trial e agora é active → converteu
    trialConvertedAt: undefined,
    lastSyncAt: new Date(),
    syncVersion: '2.0',
    lastWebhookAt: undefined // Não veio de webhook, veio de sync
  }

  // Nome do subscriber
  const subscriberName = subscription.subscriber?.name || subscription.contact?.name || subscription.name || email.split('@')[0]

  const existingUser = await User.findOne({ email }).select('_id guru')
  let action: 'created' | 'updated' | 'skipped'

  let userId: IUser['_id']

  if (existingUser) {
    const currentGuruStatus = existingUser.guru?.status || null

    // ═══════════════════════════════════════════════════════════
    // PRIORIDADE DE SUBSCRIÇÕES: Só atualizar se nova for MELHOR
    // Isto resolve o problema de múltiplas subscrições por email
    // Ex: sub_A (active) + sub_B (canceled) → guardar active!
    // NOTA: pending stale (>7 dias sem pagar) tem prioridade PIOR que canceled
    // ═══════════════════════════════════════════════════════════
    const newDates: GuruDateInfo = {
      updatedAt: guruData.updatedAt,
      nextCycleAt: guruData.nextCycleAt
    }
    const currentDates: GuruDateInfo = {
      updatedAt: existingUser.guru?.updatedAt,
      nextCycleAt: existingUser.guru?.nextCycleAt
    }
    if (currentGuruStatus && !sharedIsStatusBetterOrEqual(guruData.status, currentGuruStatus, newDates, currentDates)) {
      console.log(`  ⏭️ SKIP: ${email} - manter ${currentGuruStatus} (ignorar ${guruData.status} de sub ${guruData.subscriptionCode})`)
      return { action: 'skipped', email, markedForInactivation: 0 }
    }

    // Nova subscrição é melhor ou igual - atualizar
    await User.updateOne(
      { _id: existingUser._id },
      {
        $set: {
          guru: guruData,
          'metadata.updatedAt': new Date(),
          'metadata.sources.guru': { lastSync: new Date(), version: '2.0' }
        }
      },
      { runValidators: false }
    )
    userId = existingUser._id
    action = 'updated'

    // Se estamos a MELHORAR o status (ex: canceled → active),
    // reverter PARA_INATIVAR que possa ter sido marcado por subscrição anterior
    const currentEffective = getEffectiveStatus(currentGuruStatus, currentDates)
    const newEffective = getEffectiveStatus(guruData.status, newDates)
    if (currentGuruStatus && currentEffective.isCanceled && !newEffective.isCanceled) {
      const revertResult = await UserProduct.updateMany(
        {
          userId,
          platform: 'curseduca',
          status: 'PARA_INATIVAR',
          'metadata.guruSyncMarked': true
        },
        {
          $set: {
            status: 'ACTIVE',
            'metadata.revertedAt': new Date(),
            'metadata.revertedBy': 'guru_sync_priority',
            'metadata.revertReason': `Encontrada subscrição ${guruData.status} (${guruData.subscriptionCode})`
          },
          $unset: {
            'metadata.markedForInactivationAt': 1,
            'metadata.markedForInactivationReason': 1,
            'metadata.guruSyncMarked': 1
          }
        }
      )
      if (revertResult.modifiedCount > 0) {
        console.log(`  ✅ REVERTIDO: ${email} - ${revertResult.modifiedCount} UserProduct(s) voltaram a ACTIVE (encontrada sub ${guruData.status})`)
      }
    }
  } else {
    // Criar user apenas com campos essenciais + Guru
    const newUser = await User.create({
      email,
      name: subscriberName,
      guru: guruData,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: {
          guru: { lastSync: new Date(), version: '2.0' }
        }
      }
    })
    userId = newUser._id
    action = 'created'
  }

  // ═══════════════════════════════════════════════════════════
  // MARCAR USERPRODUCTS PARA INATIVAR SE STATUS FOR CANCELADO
  // (Só marca se o status guardado é realmente canceled -
  //  ou seja, não há nenhuma subscrição active para este email)
  // ═══════════════════════════════════════════════════════════
  let markedForInactivation = 0

  if (GURU_CANCELED_STATUSES.includes(guruData.status)) {
    // Buscar UserProducts do CursEduca que estejam ACTIVE
    const result = await UserProduct.updateMany(
      {
        userId,
        platform: 'curseduca',
        status: 'ACTIVE'
      },
      {
        $set: {
          status: 'PARA_INATIVAR',
          'metadata.markedForInactivationAt': new Date(),
          'metadata.markedForInactivationReason': `Sync Guru: status ${guruData.status}`,
          'metadata.guruSyncMarked': true
        }
      }
    )

    markedForInactivation = result.modifiedCount || 0

    if (markedForInactivation > 0) {
      console.log(`  ⚠️ PARA_INATIVAR: ${email} (${markedForInactivation} UserProduct(s))`)
    }
  }

  return { action, email, markedForInactivation }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL DE SYNC
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar TODAS as subscrições da Guru para a nossa BD
 *
 * IMPORTANTE: Esta função APENAS LÊ da Guru e ESCREVE na nossa BD.
 * Nunca escreve, atualiza ou modifica dados na Guru.
 */
export async function syncAllSubscriptions(): Promise<SyncResult> {
  console.log('\n════════════════════════════════════════════════════════')
  console.log('💰 [GURU SYNC] INICIANDO SINCRONIZAÇÃO COMPLETA')
  console.log('════════════════════════════════════════════════════════\n')

  const startTime = Date.now()

  const result: SyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    markedForInactivation: 0,
    uniqueEmails: 0,
    multiSubEmails: 0,
    details: []
  }

  try {
    // 1. Buscar todas as subscrições da Guru
    const subscriptions = await fetchAllSubscriptionsPaginated()
    result.total = subscriptions.length

    console.log(`\n📊 [GURU SYNC] Total subscrições: ${subscriptions.length}`)

    // ═══════════════════════════════════════════════════════════
    // 2. PRÉ-AGRUPAR POR EMAIL
    // Garante que o melhor status de TODAS as subs é usado
    // Elimina problemas de ordem de processamento
    // ═══════════════════════════════════════════════════════════

    const subsByEmail = new Map<string, GuruSubscription[]>()

    for (const sub of subscriptions) {
      const email = subscriptionEmail(sub)

      if (!email) {
        result.skipped++
        continue
      }

      const emailSubscriptions = subsByEmail.get(email)
      if (emailSubscriptions) {
        emailSubscriptions.push(sub)
      } else {
        subsByEmail.set(email, [sub])
      }
    }

    result.uniqueEmails = subsByEmail.size
    result.multiSubEmails = Array.from(subsByEmail.values()).filter(subs => subs.length > 1).length

    console.log(`📧 [GURU SYNC] ${subsByEmail.size} emails únicos (${result.multiSubEmails} com múltiplas subs)`)
    console.log(`📊 [GURU SYNC] Processando email a email...\n`)

    // ═══════════════════════════════════════════════════════════
    // 3. PROCESSAR CADA EMAIL COM A MELHOR SUBSCRIÇÃO
    // ═══════════════════════════════════════════════════════════

    let processedCount = 0

    for (const [email, subs] of subsByEmail) {
      processedCount++

      try {
        // Encontrar a MELHOR subscrição para este email
        // NOTA: pending stale (>7 dias sem pagar) recebe prioridade 8 (pior que refunded)
        const bestSub = subs.reduce((best, curr) => {
          const bestStatus = mapGuruStatus(best.last_status || best.status || '')
          const currStatus = mapGuruStatus(curr.last_status || curr.status || '')
          const bestDates: GuruDateInfo = {
            updatedAt: best.dates?.last_status_at,
            nextCycleAt: best.dates?.next_cycle_at,
            startedAt: best.dates?.started_at
          }
          const currDates: GuruDateInfo = {
            updatedAt: curr.dates?.last_status_at,
            nextCycleAt: curr.dates?.next_cycle_at,
            startedAt: curr.dates?.started_at
          }
          const bestPrio = getStatusPriority(bestStatus, bestDates)
          const currPrio = getStatusPriority(currStatus, currDates)
          return currPrio < bestPrio ? curr : best
        })

        const bestStatus = mapGuruStatus(bestSub.last_status || bestSub.status || '')

        // Datas da melhor subscrição (para classificação de pending stale)
        const bestDatesForCheck: GuruDateInfo = {
          updatedAt: bestSub.dates?.last_status_at,
          nextCycleAt: bestSub.dates?.next_cycle_at,
          startedAt: bestSub.dates?.started_at
        }

        // Guardar dados da melhor subscrição
        const guruData: GuruSyncData = {
          guruContactId: bestSub.subscriber?.id || bestSub.contact?.id,
          subscriptionCode: bestSub.subscription_code || bestSub.code || bestSub.id,
          status: bestStatus,
          updatedAt: bestSub.dates?.last_status_at ? new Date(bestSub.dates.last_status_at)
            : bestSub.dates?.started_at ? new Date(bestSub.dates.started_at)
            : bestSub.dates?.created_at ? new Date(bestSub.dates.created_at)
            : undefined,
          nextCycleAt: bestSub.dates?.next_cycle_at ? new Date(bestSub.dates.next_cycle_at) : undefined,
          offerId: bestSub.product?.offer?.id || bestSub.offer?.id,
          productId: bestSub.product?.id || bestSub.product_id,
          paymentUrl: bestSub.current_invoice?.payment_url,
          lastSyncAt: new Date(),
          syncVersion: '3.0',
          lastWebhookAt: undefined
        }

        const subscriberName = bestSub.subscriber?.name || bestSub.contact?.name || bestSub.name || email.split('@')[0]

        // Buscar user existente
        const existingUser = await User.findOne({ email }).select('_id guru')
        let userId: IUser['_id']
        let action: 'created' | 'updated' | 'skipped'

        if (existingUser) {
          const currentGuruStatus = existingUser.guru?.status || null

          // Atualizar user com dados da melhor subscrição
          await User.updateOne(
            { _id: existingUser._id },
            {
              $set: {
                guru: guruData,
                'metadata.updatedAt': new Date(),
                'metadata.sources.guru': { lastSync: new Date(), version: '3.0' }
              }
            },
            { runValidators: false }
          )
          userId = existingUser._id
          action = 'updated'

          // Se melhorou de canceled → active, reverter PARA_INATIVAR
          // NOTA: pending stale é tratado como canceled
          const prevEffective = getEffectiveStatus(currentGuruStatus, {
            updatedAt: existingUser.guru?.updatedAt,
            nextCycleAt: existingUser.guru?.nextCycleAt
          })
          const newEffectiveSync = getEffectiveStatus(bestStatus, bestDatesForCheck)
          if (currentGuruStatus && prevEffective.isCanceled && !newEffectiveSync.isCanceled) {
            const revertResult = await UserProduct.updateMany(
              {
                userId,
                platform: 'curseduca',
                status: 'PARA_INATIVAR',
                'metadata.guruSyncMarked': true
              },
              {
                $set: {
                  status: 'ACTIVE',
                  'metadata.revertedAt': new Date(),
                  'metadata.revertedBy': 'guru_sync_v3',
                  'metadata.revertReason': `Subscrição ${bestStatus} encontrada (${guruData.subscriptionCode})`
                },
                $unset: {
                  'metadata.markedForInactivationAt': 1,
                  'metadata.markedForInactivationReason': 1,
                  'metadata.guruSyncMarked': 1
                }
              }
            )
            if (revertResult.modifiedCount > 0) {
              console.log(`  🟢 REVERTIDO: ${email} - ${revertResult.modifiedCount} UserProduct(s) → ACTIVE (sub ${bestStatus})`)
            }
          }
        } else {
          // Criar novo user
          const newUser = await User.create({
            email,
            name: subscriberName,
            guru: guruData,
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              sources: {
                guru: { lastSync: new Date(), version: '3.0' }
              }
            }
          })
          userId = newUser._id
          action = 'created'
        }

        // ═══════════════════════════════════════════════════════════
        // MARCAR PARA_INATIVAR SÓ SE TODAS AS SUBS SÃO CANCELADAS
        // Se o bestStatus é canceled (ou pending stale) → NENHUMA sub é ativa
        // ═══════════════════════════════════════════════════════════
        let markedForInactivation = 0
        const bestEffective = getEffectiveStatus(bestStatus, bestDatesForCheck)

        if (bestEffective.isCanceled) {
          const markResult = await UserProduct.updateMany(
            {
              userId,
              platform: 'curseduca',
              status: 'ACTIVE'
            },
            {
              $set: {
                status: 'PARA_INATIVAR',
                'metadata.markedForInactivationAt': new Date(),
                'metadata.markedForInactivationReason': `Guru sync v3: todas as ${subs.length} sub(s) canceladas (melhor: ${bestStatus})`,
                'metadata.guruSyncMarked': true
              }
            }
          )
          markedForInactivation = markResult.modifiedCount || 0
        }

        if (action === 'created') {
          result.created++
          console.log(`  ✨ CRIADO: ${email} (${bestStatus}, ${subs.length} sub(s))`)
        } else {
          result.updated++
        }

        if (markedForInactivation > 0) {
          result.markedForInactivation += markedForInactivation
          console.log(`  🔴 PARA_INATIVAR: ${email} (${markedForInactivation} UserProduct(s), ${subs.length} sub(s) todas ${bestStatus})`)
        }

        result.details.push({ email, action, markedForInactivation })

        // Log de progresso a cada 50 emails
        if (processedCount % 50 === 0) {
          console.log(`\n📈 [GURU SYNC] Progresso: ${processedCount}/${subsByEmail.size} emails (✨${result.created} novos, 🔄${result.updated} atualizados, 🔴${result.markedForInactivation} p/inativar)\n`)
        }

      } catch (error: unknown) {
        const message = guruApiErrorDetails(error).message
        result.errors++
        result.details.push({ email, action: 'error', error: message })
        console.error(`❌ [GURU SYNC] Erro ${email}:`, message)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. POST-SYNC: CROSS-REFERENCE COM CURSEDUCA
    // ═══════════════════════════════════════════════════════════
    try {
      const { runCrossReferenceAfterGuruSync } = await import('./crossReference.service')
      const crossRefResult = await runCrossReferenceAfterGuruSync()
      result.crossReference = crossRefResult
    } catch (crossRefError: unknown) {
      console.error('⚠️ [GURU SYNC] Cross-reference falhou (não-fatal):', guruApiErrorDetails(crossRefError).message)
    }

    const duration = Date.now() - startTime

    console.log('\n════════════════════════════════════════════════════════')
    console.log('✅ [GURU SYNC] SINCRONIZAÇÃO COMPLETA!')
    console.log('════════════════════════════════════════════════════════')
    console.log(`📊 Total subscrições: ${result.total}`)
    console.log(`📧 Emails únicos: ${result.uniqueEmails} (${result.multiSubEmails} com múltiplas subs)`)
    console.log(`✨ Novos criados: ${result.created}`)
    console.log(`🔄 Atualizados: ${result.updated}`)
    console.log(`⏭️ Ignorados (sem email): ${result.skipped}`)
    console.log(`❌ Erros: ${result.errors}`)
    console.log(`🔴 Marcados PARA_INATIVAR: ${result.markedForInactivation}`)
    if (result.crossReference) {
      console.log(`🔄 Cross-reference: ${result.crossReference.confirmedInactive} confirmados INACTIVE, ${result.crossReference.revertedToActive} revertidos`)
    }
    console.log(`\n⏱️ Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log('════════════════════════════════════════════════════════\n')

    return result

  } catch (error: unknown) {
    console.error('\n❌ [GURU SYNC] ERRO FATAL:', guruApiErrorDetails(error).message)
    throw error
  }
}

/**
 * Verificar se um email existe na Guru (útil para SSO inteligente)
 */
export async function checkEmailInGuru(email: string): Promise<{
  exists: boolean
  subscription?: GuruSubscription
}> {
  try {
    // Tentar encontrar contacto
    const contact = await fetchContactByEmail(email)

    if (!contact) {
      return { exists: false }
    }

    // Buscar subscrições do contacto
    const subscriptions = await fetchContactSubscriptions(contact.id)

    if (subscriptions.length === 0) {
      return { exists: true, subscription: undefined }
    }

    // Retornar a subscrição mais recente/ativa
    const activeSubscription = subscriptions.find(s =>
      ['active', 'paid', 'trialing', 'past_due', 'pastdue'].includes(s.last_status?.toLowerCase())
    ) || subscriptions[0]

    return { exists: true, subscription: activeSubscription }

  } catch (error: unknown) {
    console.error(`❌ [GURU SYNC] Erro ao verificar email ${email}:`, guruApiErrorDetails(error).message)
    return { exists: false }
  }
}

export default {
  fetchAllSubscriptions,
  fetchAllSubscriptionsPaginated,
  fetchSubscriptionsByMonth,
  fetchAllSubscriptionsComplete,
  fetchSubscriptionById,
  fetchContactByEmail,
  fetchContactSubscriptions,
  saveSubscriptionToDb,
  syncAllSubscriptions,
  checkEmailInGuru
}
