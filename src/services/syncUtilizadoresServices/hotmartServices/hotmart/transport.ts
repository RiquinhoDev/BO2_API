import logger from '../../../../utils/logger'
import axios from 'axios'
import { HotmartModule, HotmartModuleProgress } from '../../../../types/lesson.types'
import { getHotmartCredentials, getHotmartSubdomain } from '../../../requestDrivenRuntimeConfig'
import { calculateProgress } from './processing'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function responseData(error: unknown): unknown {
  return axios.isAxiosError(error) ? error.response?.data : undefined
}

function errorDescription(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const data: unknown = error.response?.data
  if (typeof data !== 'object' || data === null || !('error_description' in data)) return undefined
  const description = data.error_description
  return typeof description === 'string' ? description : undefined
}

const getRetryDelayMs = (error: unknown, attempt: number, baseDelayMs: number) => {
  const retryAfterHeader = axios.isAxiosError(error)
    ? error.response?.headers?.['retry-after']
    : undefined
  const retryAfter = retryAfterHeader ? parseInt(String(retryAfterHeader), 10) : NaN
  if (!Number.isNaN(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000
  }

  const jitter = Math.floor(Math.random() * 250)
  return Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, 10000)
}

// Erros de rede em que a resposta nem chega a existir. Não trazem
// error.response, por isso não têm status HTTP nenhum para comparar.
const CODIGOS_DE_REDE_REPETIVEIS = new Set([
  'ECONNRESET',    // a Hotmart cortou a ligação a meio — o mais frequente
  'ECONNABORTED',  // timeout do axios
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',     // falha temporária de DNS
  'EPIPE',
  'ERR_NETWORK'
])

/**
 * Vale a pena repetir este erro?
 *
 * Só para falhas transitórias. Um 401 (token mau), um 400 (pedido mau) ou um
 * 404 continuam a rebentar à primeira, que é o que se quer: repetir esses só
 * atrasaria o sync sem nunca resolver nada.
 */
function estadoHttp(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

function codigoDeRede(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const causa = error.cause as { code?: unknown } | undefined
  const codigo = error.code ?? causa?.code
  return typeof codigo === 'string' ? codigo : undefined
}

function vaiValerARepetir(error: unknown): boolean {
  const status = estadoHttp(error)

  if (status === 429) return true
  if (typeof status === 'number') return status >= 500 && status < 600

  // Sem status = a ligação falhou antes de haver resposta.
  const codigo = codigoDeRede(error)
  return codigo !== undefined && CODIGOS_DE_REDE_REPETIVEIS.has(codigo)
}

export async function requestWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number }
): Promise<T> {
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (error: unknown) {
      if (!vaiValerARepetir(error) || attempt >= options.maxRetries) {
        throw error
      }

      const status = estadoHttp(error)
      const motivo = status ? `HTTP ${status}` : (codigoDeRede(error) ?? 'erro de rede')
      const delay = getRetryDelayMs(error, attempt, options.baseDelayMs)
      logger.warn(
        `[HotmartFetch] ${motivo}. Retry in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries})`
      )
      await sleep(delay)
      attempt += 1
    }
  }
}

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
  status?: string
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

interface HotmartTokenResponse {
  access_token?: string
  expires_in?: number
}

interface HotmartPageInfo {
  next_page_token?: string
  nextPageToken?: string
}

interface HotmartUsersResponse {
  users?: HotmartUser[]
  items?: HotmartUser[]
  data?: HotmartUser[]
  page_info?: HotmartPageInfo
  pageInfo?: HotmartPageInfo
  pagination?: HotmartPageInfo
}

interface HotmartLessonsResponse {
  lessons?: HotmartLesson[]
}

export const getHotmartAccessToken = async (): Promise<string> => {
  const { clientId, clientSecret } = getHotmartCredentials()
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    logger.info('🔐 [HotmartAuth] Gerando token...')

    const response = await axios.post<HotmartTokenResponse>(
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

    logger.info(`✅ [HotmartAuth] Token obtido - Expira em: ${response.data.expires_in}s`)
    return response.data.access_token
  } catch (error: unknown) {
    logger.error('❌ [HotmartAuth] Erro:', responseData(error) || errorMessage(error))
    throw new Error(`Falha ao obter token: ${errorDescription(error) || errorMessage(error)}`)
  }
}

export const fetchAllHotmartUsers = async (accessToken: string): Promise<HotmartUser[]> => {
  let allUsers: HotmartUser[] = []
  let nextPageToken: string | null = null
  let pageCount = 0
  const subdomain = getHotmartSubdomain()

  logger.info('📡 [HotmartFetch] Iniciando busca de utilizadores...')

  try {
    do {
      pageCount++
      let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`
      if (nextPageToken) {
        requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`
      }

      logger.info(`📄 [HotmartFetch] Página ${pageCount}: ${requestUrl}`)

      const response = await requestWithRetry(
        () => axios.get<HotmartUsersResponse>(requestUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }),
        { maxRetries: 5, baseDelayMs: 1000 }
      )

      const users = response.data.users || response.data.items || response.data.data || []
      const pageInfo = response.data.page_info || response.data.pageInfo || response.data.pagination || {}

      if (!Array.isArray(users)) {
        throw new Error(`Resposta inválida: esperado array, recebido ${typeof users}`)
      }

      allUsers = allUsers.concat(users)
      nextPageToken = pageInfo.next_page_token || pageInfo.nextPageToken || null

      logger.info(`✅ [HotmartFetch] Página ${pageCount}: ${users.length} utilizadores | Total: ${allUsers.length}`)
      logger.info(`   nextPageToken: ${nextPageToken ? 'exists' : 'null'}`)

      if (nextPageToken) {
        await sleep(500)
      }
    } while (nextPageToken)

    logger.info(`🎯 [HotmartFetch] Busca completa: ${allUsers.length} utilizadores em ${pageCount} páginas`)
    return allUsers
  } catch (error: unknown) {
    logger.error('❌ [HotmartFetch] Erro:', responseData(error) || errorMessage(error))
    throw new Error(`Erro ao buscar utilizadores: ${errorMessage(error)}`)
  }
}

export const fetchUserLessons = async (
  userId: string,
  accessToken: string
): Promise<HotmartLesson[]> => {
  const subdomain = getHotmartSubdomain()
  try {
    const response = await requestWithRetry(
      () => axios.get<HotmartLessonsResponse>(
        `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=${subdomain}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      ),
      { maxRetries: 3, baseDelayMs: 500 }
    )

    return response.data.lessons || []
  } catch (error: unknown) {
    logger.warn(`⚠️ [HotmartFetch] Erro ao buscar lições do user ${userId}:`, errorMessage(error))
    return []
  }
}

export const fetchBatchUserProgress = async (
  users: HotmartUser[],
  accessToken: string,
  concurrency: number = 5
): Promise<Map<string, ProgressData>> => {
  const progressMap = new Map<string, ProgressData>()
  const userIds = users
    .map(u => u.id || u.user_id || u.uid || u.code)
    .filter((value): value is string => Boolean(value))

  logger.info('📊 [HotmartProgress] Iniciando fetch de progresso...')
  logger.info(`   👥 Total users: ${userIds.length}`)
  logger.info(`   🔢 Concurrency: ${concurrency}`)
  logger.info(`   ⏱️  Estimativa: ~${Math.ceil(userIds.length / concurrency * 0.5 / 60)} minutos`)

  const startTime = Date.now()
  let processedCount = 0

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
      } catch {
        // Silencioso - não logar cada erro
      }
    })

    await Promise.all(progressPromises)

    processedCount += batch.length
    const batchDuration = Date.now() - batchStart
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const percentage = Math.floor((processedCount / userIds.length) * 100)

    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      const remaining = Math.ceil((userIds.length - processedCount) / concurrency * (batchDuration / 1000))
      logger.info(`   📦 Batch ${batchNum}/${totalBatches} (${percentage}%) - ${elapsed}s passados, ~${Math.ceil(remaining / 60)} min restantes`)
    }

    if (i + concurrency < userIds.length) {
      await sleep(100)
    }
  }

  const totalDuration = Math.floor((Date.now() - startTime) / 1000)
  logger.info('✅ [HotmartProgress] Completo!')
  logger.info(`   ⏱️  Duração: ${totalDuration}s (${Math.floor(totalDuration / 60)} min)`)
  logger.info(`   📊 Sucesso: ${progressMap.size}/${userIds.length} users (${Math.floor(progressMap.size / userIds.length * 100)}%)`)
  logger.info(`   ⚡ Velocidade: ${(userIds.length / totalDuration).toFixed(1)} users/s`)

  return progressMap
}
