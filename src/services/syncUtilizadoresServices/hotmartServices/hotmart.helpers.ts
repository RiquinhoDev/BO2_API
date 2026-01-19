// ════════════════════════════════════════════════════════════
// 📁 src/services/hotmartServices/hotmart.helpers.ts
// Hotmart Helpers - Funções reutilizáveis
// ════════════════════════════════════════════════════════════

import axios from 'axios'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface HotmartLesson {
  page_id: string
  page_name: string
  module_name: string
  is_module_extra: boolean
  is_completed: boolean
  completed_date?: number
}

export interface HotmartUser {
  id?: string
  user_id?: string
  uid?: string
  code?: string
  email: string
  name: string
  class_id?: string
  class_name?: string
  purchase_date?: number | string
  signup_date?: number | string
  first_access_date?: number | string
  last_access_date?: number | string
  plus_access?: string
  access_count?: number
  engagement?: string
  // ✅ NOVOS CAMPOS DA API HOTMART
  status?: string  // ACTIVE, INACTIVE, etc
  role?: string
  type?: string
  locale?: string
  is_deletable?: boolean
}

export interface ProgressData {
  completedPercentage: number
  total: number
  completed: number
  lessons: {
    pageId: string
    pageName: string
    moduleName: string
    isModuleExtra: boolean
    isCompleted: boolean
    completedDate?: Date
  }[]
  lastUpdated: Date
}

// ═══════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════

/**
 * Obter Access Token da Hotmart API
 * @returns {Promise<string>} Access token válido
 */
export const getHotmartAccessToken = async (): Promise<string> => {
  try {
    const clientId = process.env.HOTMART_CLIENT_ID
    const clientSecret = process.env.HOTMART_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios')
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    console.log(`🔐 [HotmartAuth] Gerando token...`)

    const response = await axios.post(
      'https://api-sec-vlc.hotmart.com/security/oauth/token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`
        }
      }
    )

    if (!response.data.access_token) {
      throw new Error('Access token não encontrado na resposta')
    }

    console.log(`✅ [HotmartAuth] Token obtido - Expira em: ${response.data.expires_in}s`)
    return response.data.access_token

  } catch (error: any) {
    console.error('❌ [HotmartAuth] Erro:', error.response?.data || error.message)
    throw new Error(
      `Falha ao obter token: ${error.response?.data?.error_description || error.message}`
    )
  }
}

// ═══════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════

/**
 * Buscar TODOS os utilizadores da Hotmart (paginação automática)
 * @param {string} accessToken - Token de autenticação
 * @returns {Promise<HotmartUser[]>} Lista completa de utilizadores
 */
export const fetchAllHotmartUsers = async (accessToken: string): Promise<HotmartUser[]> => {
  let allUsers: HotmartUser[] = []
  let nextPageToken: string | null = null
  let pageCount = 0
  const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk'

  console.log(`📡 [HotmartFetch] Iniciando busca de utilizadores...`)

  try {
    do {
      pageCount++
      let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`
      if (nextPageToken) {
        requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`
      }

      console.log(`📄 [HotmartFetch] Página ${pageCount}: ${requestUrl}`)

      const response = await axios.get(requestUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // ✅ 30s timeout por request
      })

      // Normalizar resposta (diferentes formatos possíveis)
      const users = response.data.users || response.data.items || response.data.data || []
      const pageInfo = response.data.page_info || response.data.pageInfo || response.data.pagination || {}

      if (!Array.isArray(users)) {
        throw new Error(`Resposta inválida: esperado array, recebido ${typeof users}`)
      }

      allUsers = allUsers.concat(users)
      nextPageToken = pageInfo.next_page_token || pageInfo.nextPageToken || null

console.log(`✅ [HotmartFetch] Página ${pageCount}: ${users.length} utilizadores | Total: ${allUsers.length}`)
console.log(`   nextPageToken: ${nextPageToken ? 'exists' : 'null'}`)

// Rate limiting (só se houver próxima página)
if (nextPageToken) {
  await new Promise(resolve => setTimeout(resolve, 200))
}
    } while (nextPageToken)

    console.log(`🎯 [HotmartFetch] Busca completa: ${allUsers.length} utilizadores em ${pageCount} páginas`)
    return allUsers

  } catch (error: any) {
    console.error('❌ [HotmartFetch] Erro:', error.response?.data || error.message)
    throw new Error(`Erro ao buscar utilizadores: ${error.message}`)
  }
}

/**
 * Buscar lições de um utilizador específico
 * @param {string} userId - ID do utilizador na Hotmart
 * @param {string} accessToken - Token de autenticação
 * @returns {Promise<HotmartLesson[]>} Lista de lições
 */
export const fetchUserLessons = async (
  userId: string,
  accessToken: string
): Promise<HotmartLesson[]> => {
  try {
    const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk'

const response = await axios.get(
  `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=${subdomain}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000 // ✅ 10s timeout por request
  }
)

    return response.data.lessons || []

  } catch (error: any) {
    console.warn(`⚠️ [HotmartFetch] Erro ao buscar lições do user ${userId}:`, error.message)
    return []
  }
}

/**
 * Buscar progresso de múltiplos utilizadores em paralelo (com controle de concorrência)
 * @param {HotmartUser[]} users - Lista de utilizadores
 * @param {string} accessToken - Token de autenticação
 * @param {number} concurrency - Máximo de requests simultâneos (default: 5)
 * @returns {Promise<Map<string, ProgressData>>} Mapa de userId -> progressData
 */
export const fetchBatchUserProgress = async (
  users: HotmartUser[],
  accessToken: string,
  concurrency: number = 5
): Promise<Map<string, ProgressData>> => {
  
  const progressMap = new Map<string, ProgressData>()
  const userIds = users
    .map(u => u.id || u.user_id || u.uid || u.code)
    .filter(Boolean) as string[]

  console.log(`📊 [HotmartProgress] Iniciando fetch de progresso...`)
  console.log(`   👥 Total users: ${userIds.length}`)
  console.log(`   🔢 Concurrency: ${concurrency}`)
  console.log(`   ⏱️  Estimativa: ~${Math.ceil(userIds.length / concurrency * 0.5 / 60)} minutos`)

  const startTime = Date.now()
  let processedCount = 0

  // Processar em batches
  for (let i = 0; i < userIds.length; i += concurrency) {
    const batch = userIds.slice(i, i + concurrency)
    const batchNum = Math.floor(i / concurrency) + 1
    const totalBatches = Math.ceil(userIds.length / concurrency)
    
    const batchStart = Date.now()
    
    const progressPromises = batch.map(async (userId) => {
      try {
        const lessons = await fetchUserLessons(userId, accessToken)
        if (lessons.length > 0) {
          const progress = calculateProgress(lessons)
          progressMap.set(userId, progress)
        }
      } catch (error) {
        // Silencioso - não logar cada erro
      }
    })

    await Promise.all(progressPromises)
    
    processedCount += batch.length
    const batchDuration = Date.now() - batchStart
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const percentage = Math.floor((processedCount / userIds.length) * 100)
    
    // ✅ LOG A CADA 10 BATCHES (não todos!)
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      const remaining = Math.ceil((userIds.length - processedCount) / concurrency * (batchDuration / 1000))
      console.log(`   📦 Batch ${batchNum}/${totalBatches} (${percentage}%) - ${elapsed}s passados, ~${Math.ceil(remaining / 60)} min restantes`)
    }
    
    // Rate limiting entre batches
    if (i + concurrency < userIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100)) // 100ms
    }
  }

  const totalDuration = Math.floor((Date.now() - startTime) / 1000)
  console.log(`✅ [HotmartProgress] Completo!`)
  console.log(`   ⏱️  Duração: ${totalDuration}s (${Math.floor(totalDuration / 60)} min)`)
  console.log(`   📊 Sucesso: ${progressMap.size}/${userIds.length} users (${Math.floor(progressMap.size / userIds.length * 100)}%)`)
  console.log(`   ⚡ Velocidade: ${(userIds.length / totalDuration).toFixed(1)} users/s`)

  return progressMap
}
// ═══════════════════════════════════════════════════════════
// DATA PROCESSING
// ═══════════════════════════════════════════════════════════

/**
 * Calcular progresso baseado nas lições
 * @param {HotmartLesson[]} lessons - Lista de lições
 * @returns {ProgressData} Dados de progresso calculados
 */
export const calculateProgress = (lessons: HotmartLesson[]): ProgressData => {
  if (lessons.length === 0) {
    return {
      completedPercentage: 0,
      total: 0,
      completed: 0,
      lessons: [],
      lastUpdated: new Date()
    }
  }

  const completed = lessons.filter(lesson => lesson.is_completed).length
  const total = lessons.length
  const completedPercentage = Math.round((completed / total) * 100)

  return {
    completedPercentage,
    total,
    completed,
    lessons: lessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    })),
    lastUpdated: new Date()
  }
}

/**
 * Converter timestamp Unix para Date (com validação)
 * @param {any} timestamp - Timestamp em diversos formatos
 * @returns {Date | null} Data válida ou null
 */
export const convertUnixTimestamp = (timestamp: any): Date | null => {
  if (!timestamp) return null

  // ISO string
  if (typeof timestamp === 'string' && timestamp.includes('T') && timestamp.includes('Z')) {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      if (year >= 2000 && year <= 2030) {
        return date
      }
    }
    return null
  }

  // Unix timestamp
  const numTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
  if (isNaN(numTimestamp) || numTimestamp <= 0) return null

  // Converter para milliseconds se necessário
  const timestampMs = numTimestamp < 1e12 ? numTimestamp * 1000 : numTimestamp
  const date = new Date(timestampMs)

  // Validar ano
  const year = date.getFullYear()
  if (year < 2000 || year > 2030) {
    console.warn(`⚠️ Data suspeita: ${date.toISOString()} (timestamp: ${timestamp})`)
    return null
  }

  return date
}

/**
 * Normalizar dados do utilizador Hotmart para formato Universal
 * @param {HotmartUser} hotmartUser - Dados brutos da API
 * @param {ProgressData} progressData - Dados de progresso (opcional)
 * @returns {object} Dados normalizados para Universal Sync
 */
export const normalizeHotmartUser = (
  hotmartUser: HotmartUser,
  progressData?: ProgressData
) => {
  const hotmartId = hotmartUser.id || hotmartUser.user_id || hotmartUser.uid || hotmartUser.code

  return {
    // Identificação
    email: hotmartUser.email.toLowerCase().trim(),
    name: hotmartUser.name.trim(),
    hotmartUserId: hotmartId,

    // Datas
    purchaseDate: convertUnixTimestamp(hotmartUser.purchase_date),
    signupDate: convertUnixTimestamp(hotmartUser.signup_date) || null,  // ✅ null se não vier da API
    firstAccessDate: convertUnixTimestamp(hotmartUser.first_access_date),
    lastAccessDate: convertUnixTimestamp(hotmartUser.last_access_date),

    // Status
    plusAccess: hotmartUser.plus_access || 'WITHOUT_PLUS_ACCESS',

    // Turmas
    classId: hotmartUser.class_id,
    className: hotmartUser.class_name || (hotmartUser.class_id ? `Turma ${hotmartUser.class_id}` : undefined),

    // Engagement
    accessCount: Number(hotmartUser.access_count) || 0,
    engagementLevel: hotmartUser.engagement || 'NONE',

    // ✅ NOVOS CAMPOS DA API HOTMART
    status: hotmartUser.status || null,
    role: hotmartUser.role || null,
    type: hotmartUser.type || null,
    locale: hotmartUser.locale || null,
    isDeletable: hotmartUser.is_deletable !== undefined ? hotmartUser.is_deletable : null,

    // Progresso (se disponível)
    progress: progressData ? {
      completedPercentage: progressData.completedPercentage,
      total: progressData.total,
      completed: progressData.completed,
      lessons: progressData.lessons,
      lastUpdated: progressData.lastUpdated
    } : undefined
  }
}

/**
 * Validar dados mínimos do utilizador
 * @param {HotmartUser} user - Dados do utilizador
 * @returns {boolean} true se válido
 * @throws {Error} Se dados inválidos
 */
export const validateHotmartUser = (user: HotmartUser): boolean => {
  if (!user.email || !user.email.trim()) {
    throw new Error('Email inválido')
  }
  
  if (!user.name || !user.name.trim()) {
    throw new Error('Nome inválido')
  }
  
  const hotmartId = user.id || user.user_id || user.uid || user.code
  if (!hotmartId) {
    throw new Error('ID Hotmart inválido')
  }
  
  return true
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  // Auth
  getHotmartAccessToken,
  
  // Fetch
  fetchAllHotmartUsers,
  fetchUserLessons,
  fetchBatchUserProgress,
  
  // Process
  calculateProgress,
  convertUnixTimestamp,
  normalizeHotmartUser,
  validateHotmartUser
}
