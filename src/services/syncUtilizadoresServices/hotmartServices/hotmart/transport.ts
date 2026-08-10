// ════════════════════════════════════════════════════════════
// 📁 src/services/hotmartServices/hotmart.helpers.ts
// Hotmart Helpers - Funções reutilizáveis
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import { HotmartModule, HotmartModuleProgress } from '../../../../types/lesson.types'
import { getHotmartCredentials, getHotmartSubdomain } from '../../../requestDrivenRuntimeConfig'
import { calculateProgress } from './processing'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const getRetryDelayMs = (error: any, attempt: number, baseDelayMs: number) => {
  const retryAfterHeader = error?.response?.headers?.['retry-after']
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
  if (!Number.isNaN(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000
  }

  const jitter = Math.floor(Math.random() * 250)
  return Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, 10000)
}

export async function requestWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number }
): Promise<T> {
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (error: any) {
      const status = error?.response?.status
      if (status !== 429 || attempt >= options.maxRetries) {
        throw error
      }

      const delay = getRetryDelayMs(error, attempt, options.baseDelayMs)
      console.warn(
        `[HotmartFetch] Rate limited (429). Retry in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries})`
      )
      await sleep(delay)
      attempt += 1
    }
  }
}

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

  // ✅ MÓDULOS
  modulesList?: Array<{
    moduleId: string
    name: string
    sequence: number
    totalPages: number
    completedPages: number
    isCompleted: boolean
    isExtra: boolean
    progressPercentage: number
    lastCompletedDate?: number
  }>
  totalModules?: number
  modulesCompleted?: string[]
  currentModule?: number

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
  const { clientId, clientSecret } = getHotmartCredentials()
  try {

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
  const subdomain = getHotmartSubdomain()

  console.log(`📡 [HotmartFetch] Iniciando busca de utilizadores...`)

  try {
    do {
      pageCount++
      let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`
      if (nextPageToken) {
        requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`
      }

      console.log(`📄 [HotmartFetch] Página ${pageCount}: ${requestUrl}`)

      const response = await requestWithRetry(
        () =>
          axios.get(requestUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // ?o. 30s timeout por request
          }),
        { maxRetries: 5, baseDelayMs: 1000 }
      )

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
  await sleep(500)
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
  const subdomain = getHotmartSubdomain()
  try {

const response = await requestWithRetry(
  () =>
    axios.get(
      `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=${subdomain}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // ?o. 10s timeout por request
      }
    ),
  { maxRetries: 3, baseDelayMs: 500 }
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
 * (Extrai módulos diretamente das lições - sem endpoint /modules)
 * @param {HotmartLesson[]} lessons - Lista de lições
 * @returns {ProgressData} Dados de progresso calculados
 */
