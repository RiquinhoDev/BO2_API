// src/services/guru/guruSync.service.ts - Serviço para sincronizar dados da Guru (APENAS LEITURA)
import axios from 'axios'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'

// Status da Guru que indicam cancelamento (para marcar PARA_INATIVAR)
const GURU_CANCELED_STATUSES = ['canceled', 'expired', 'refunded']

// Prioridade de status: menor número = melhor (mais prioritário)
const STATUS_PRIORITY: Record<string, number> = {
  'active': 1,
  'pastdue': 2,
  'pending': 3,
  'suspended': 4,
  'canceled': 5,
  'expired': 6,
  'refunded': 7
}

/**
 * Verificar se um status é "melhor" (mais prioritário) que outro
 * Retorna true se newStatus tem prioridade MAIOR ou IGUAL ao currentStatus
 */
function isStatusBetterOrEqual(newStatus: string, currentStatus: string): boolean {
  const newPriority = STATUS_PRIORITY[newStatus] ?? 99
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? 99
  return newPriority <= currentPriority
}

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

interface GuruSubscription {
  id: string
  subscription_code: string
  last_status: string
  name: string
  payment_method: string
  charged_every_days: number
  next_cycle_value: number
  dates: {
    started_at: string
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
  details: Array<{
    email: string
    action: 'created' | 'updated' | 'skipped' | 'error'
    error?: string
    markedForInactivation?: number
  }>
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

    const response = await guruApi.get('/subscriptions', {
      params: requestParams
    })

    const subscriptions = response.data?.data || response.data || []
    console.log(`✅ [GURU SYNC] Pedido: ${requestParams.per_page}, Recebido: ${subscriptions.length} subscrições`)

    return subscriptions
  } catch (error: any) {
    console.error('❌ [GURU SYNC] Erro ao buscar subscrições:')
    console.error('   Status:', error.response?.status)
    console.error('   URL:', error.config?.url)
    console.error('   Data:', JSON.stringify(error.response?.data, null, 2))
    console.error('   Message:', error.message)
    throw error
  }
}

/**
 * Buscar todas as páginas de subscrições
 */
export async function fetchAllSubscriptionsPaginated(additionalParams?: {
  started_at_ini?: string // YYYY-MM-DD
  started_at_end?: string // YYYY-MM-DD
  status?: string
}): Promise<GuruSubscription[]> {
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
      const requestParams: any = {
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

      const response = await guruApi.get('/subscriptions', {
        params: requestParams
      })

      const data = response.data?.data || []
      const hasMorePages = response.data?.has_more_pages === 1
      const nextCursor = response.data?.next_cursor
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

      // Verificar se há mais páginas usando os flags da API
      if (onLastPage || !hasMorePages || data.length === 0 || !nextCursor) {
        hasMore = false
        console.log('⏹️ [GURU SYNC] Última página alcançada!')
      } else {
        cursor = nextCursor
        hasMore = true
        console.log(`➡️ [GURU SYNC] Próximo cursor: ${cursor.substring(0, 50)}...`)
      }

      // Rate limiting - esperar 300ms entre requests
      await new Promise(resolve => setTimeout(resolve, 300))

    } catch (error: any) {
      console.error(`❌ [GURU SYNC] Erro na requisição ${pageNumber}:`)
      console.error('   Status:', error.response?.status)
      console.error('   URL:', error.config?.baseURL + error.config?.url)
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2))
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
export async function fetchAllSubscriptionsComplete(): Promise<GuruSubscription[]> {
  console.log('📡 [GURU SNAPSHOT] Buscando TODAS as subscrições (SEM FILTROS)...')

  // Chamar sem parâmetros = busca tudo
  return fetchAllSubscriptionsPaginated()
}

/**
 * Buscar subscrição por ID
 */
export async function fetchSubscriptionById(subscriptionId: string): Promise<GuruSubscription | null> {
  try {
    const response = await guruApi.get(`/subscriptions/${subscriptionId}`)
    return response.data?.data || response.data
  } catch (error: any) {
    if (error.response?.status === 404) {
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
    const response = await guruApi.get('/contacts', {
      params: { email }
    })
    const contacts = response.data?.data || response.data || []
    return contacts[0] || null
  } catch (error: any) {
    if (error.response?.status === 404) {
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
    const response = await guruApi.get(`/contacts/${contactId}/subscriptions`)
    return response.data?.data || response.data || []
  } catch (error: any) {
    console.error(`❌ [GURU SYNC] Erro ao buscar subscrições do contacto ${contactId}:`, error.message)
    return []
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE ESCRITA NA NOSSA BD (NUNCA NA GURU!)
// ═══════════════════════════════════════════════════════════

/**
 * Mapear status da Guru para o nosso formato
 */
function mapGuruStatus(guruStatus: string): 'active' | 'pastdue' | 'canceled' | 'expired' | 'pending' | 'refunded' | 'suspended' {
  const statusMap: Record<string, any> = {
    'active': 'active',
    'paid': 'active',
    'trialing': 'active',
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
  const email = (
    subscription.subscriber?.email ||
    (subscription as any).contact?.email ||
    (subscription as any).email ||
    (subscription as any).customer?.email
  )?.toLowerCase().trim()

  if (!email) {
    console.warn('⚠️ [GURU SYNC] Subscrição sem email:', JSON.stringify({
      id: subscription.id,
      code: subscription.subscription_code,
      subscriber: subscription.subscriber,
      keys: Object.keys(subscription)
    }, null, 2))
    return { action: 'skipped', email: 'sem-email' }
  }

  // Extrair dados de diferentes estruturas possíveis
  const sub = subscription as any

  const guruData = {
    guruContactId: sub.subscriber?.id || sub.contact?.id,
    subscriptionCode: sub.subscription_code || sub.code || sub.id,
    status: mapGuruStatus(sub.last_status || sub.status),
    updatedAt: sub.dates?.last_status_at ? new Date(sub.dates.last_status_at) : new Date(),
    nextCycleAt: sub.dates?.next_cycle_at ? new Date(sub.dates.next_cycle_at) : undefined,
    offerId: sub.product?.offer?.id || sub.offer?.id,
    productId: sub.product?.id || sub.product_id,
    paymentUrl: sub.current_invoice?.payment_url,
    lastSyncAt: new Date(),
    syncVersion: '2.0',
    lastWebhookAt: undefined // Não veio de webhook, veio de sync
  }

  // Nome do subscriber
  const subscriberName = sub.subscriber?.name || sub.contact?.name || sub.name || email.split('@')[0]

  const existingUser = await User.findOne({ email }).select('_id guru')
  let action: 'created' | 'updated' | 'skipped'

  let userId: any

  if (existingUser) {
    const currentGuruStatus = (existingUser as any).guru?.status || null

    // ═══════════════════════════════════════════════════════════
    // PRIORIDADE DE SUBSCRIÇÕES: Só atualizar se nova for MELHOR
    // Isto resolve o problema de múltiplas subscrições por email
    // Ex: sub_A (active) + sub_B (canceled) → guardar active!
    // ═══════════════════════════════════════════════════════════
    if (currentGuruStatus && !isStatusBetterOrEqual(guruData.status, currentGuruStatus)) {
      // Nova subscrição é PIOR que a existente - não sobrescrever
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
    if (currentGuruStatus && GURU_CANCELED_STATUSES.includes(currentGuruStatus) && !GURU_CANCELED_STATUSES.includes(guruData.status)) {
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
    details: []
  }

  try {
    // 1. Buscar todas as subscrições da Guru
    const subscriptions = await fetchAllSubscriptionsPaginated()
    result.total = subscriptions.length

    console.log(`\n📊 [GURU SYNC] Processando ${subscriptions.length} subscrições...\n`)

    // 2. Processar cada subscrição
    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i]

      try {
        const { action, email, markedForInactivation } = await saveSubscriptionToDb(sub)

        if (action === 'created') {
          result.created++
          console.log(`  ✨ CRIADO: ${email}`)
        } else if (action === 'updated') {
          result.updated++
          console.log(`  🔄 ATUALIZADO: ${email}`)
        } else {
          result.skipped++
        }

        // Acumular total de marcados para inativação
        if (markedForInactivation && markedForInactivation > 0) {
          result.markedForInactivation += markedForInactivation
        }

        result.details.push({ email, action, markedForInactivation })

        // Log de progresso a cada 25
        if ((i + 1) % 25 === 0) {
          console.log(`\n📈 [GURU SYNC] Progresso: ${i + 1}/${subscriptions.length} (✨${result.created} novos, 🔄${result.updated} atualizados, ⏭️${result.skipped} ignorados, 🔴${result.markedForInactivation} p/inativar)\n`)
        }

      } catch (error: any) {
        result.errors++
        const errorEmail = (sub as any).subscriber?.email || (sub as any).contact?.email || 'sem-email'
        result.details.push({ email: errorEmail, action: 'error', error: error.message })
        console.error(`❌ [GURU SYNC] Erro ao processar ${errorEmail}:`, error.message)
      }
    }

    const duration = Date.now() - startTime

    console.log('\n════════════════════════════════════════════════════════')
    console.log('✅ [GURU SYNC] SINCRONIZAÇÃO COMPLETA!')
    console.log('════════════════════════════════════════════════════════')
    console.log(`📊 Total processado: ${result.total}`)
    console.log(`✨ Novos criados: ${result.created}`)
    console.log(`🔄 Atualizados: ${result.updated}`)
    console.log(`⏭️ Ignorados (sem email): ${result.skipped}`)
    console.log(`❌ Erros: ${result.errors}`)
    console.log(`🔴 Marcados PARA_INATIVAR: ${result.markedForInactivation}`)

    // Mostrar alguns exemplos
    const createdEmails = result.details.filter(d => d.action === 'created').slice(0, 5)
    const updatedEmails = result.details.filter(d => d.action === 'updated').slice(0, 5)

    if (createdEmails.length > 0) {
      console.log(`\n📧 Exemplos de emails criados:`)
      createdEmails.forEach(d => console.log(`   - ${d.email}`))
    }
    if (updatedEmails.length > 0) {
      console.log(`\n📧 Exemplos de emails atualizados:`)
      updatedEmails.forEach(d => console.log(`   - ${d.email}`))
    }

    console.log(`\n⏱️ Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log('════════════════════════════════════════════════════════\n')

    return result

  } catch (error: any) {
    console.error('\n❌ [GURU SYNC] ERRO FATAL:', error.message)
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

  } catch (error: any) {
    console.error(`❌ [GURU SYNC] Erro ao verificar email ${email}:`, error.message)
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
