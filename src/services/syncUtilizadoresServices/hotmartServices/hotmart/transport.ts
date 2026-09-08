import logger from '../../../../utils/logger'
import axios from 'axios'
import { requestWithRetry } from './retryPolicy'
export { requestWithRetry } from './retryPolicy'
import { getHotmartCredentials, getHotmartSubdomain } from '../../../requestDrivenRuntimeConfig'
import { calculateProgress } from './processing'
import type { CronExecutionPhaseHooks } from '../../../cron/scheduler/executionPhases'

export const HOTMART_PROVIDER_PAGE_SIZE = 100
export const HOTMART_PROVIDER_MAX_PAGES = 200
export const HOTMART_PROVIDER_MAX_ITEMS = 20_000
export const HOTMART_PROVIDER_MAX_LESSONS = 10_000

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
  has_more?: boolean
  hasMore?: boolean
}

interface HotmartUsersResponse {
  users?: HotmartUser[]
  items?: HotmartUser[]
  data?: HotmartUser[]
  page_info?: HotmartPageInfo
  pageInfo?: HotmartPageInfo
  pagination?: HotmartPageInfo
  partial?: boolean
  is_partial?: boolean
  incomplete?: boolean
  success?: boolean
}

interface HotmartLessonsResponse {
  lessons?: HotmartLesson[]
  success?: boolean
  partial?: boolean
  is_partial?: boolean
  incomplete?: boolean
  error?: unknown
  errors?: unknown
  failure?: unknown
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

export interface HotmartFetchOptions {
  phaseHooks?: CronExecutionPhaseHooks
}

const providerError = (code: string, detail: string): Error => {
  const error = new Error(`${code}: ${detail}`)
  const status = code.includes('LIMIT_EXCEEDED') || code === 'HOTMART_PROVIDER_PAGE_SIZE_EXCEEDED' ? 413 : 422
  Object.assign(error, { code, status })
  return error
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizePageUsers = (payload: Record<string, unknown>): HotmartUser[] => {
  const fields = ['users', 'items', 'data'].filter(field => field in payload)
  if (fields.length !== 1) {
    throw providerError('HOTMART_PROVIDER_ENVELOPE_INVALID', 'resposta deve conter exactamente um array de utilizadores')
  }
  const users = payload[fields[0]]
  if (!Array.isArray(users)) {
    throw providerError('HOTMART_PROVIDER_ENVELOPE_INVALID', 'array de utilizadores inválido')
  }
  return users as HotmartUser[]
}

const normalizePageInfo = (payload: Record<string, unknown>): { nextPageToken: string | null; hasMore: boolean } => {
  const containers = ['page_info', 'pageInfo', 'pagination'].filter(field => field in payload)
  const sources: Record<string, unknown>[] = []
  for (const container of containers) {
    if (!isRecord(payload[container])) {
      throw providerError('HOTMART_PROVIDER_PAGINATION_INVALID', 'paginação ausente ou inválida')
    }
    sources.push(payload[container] as Record<string, unknown>)
  }
  const topLevelKeys = ['next_page_token', 'nextPageToken', 'has_more', 'hasMore']
  if (topLevelKeys.some(key => key in payload)) sources.push(payload)
  if (sources.length === 0) {
    throw providerError('HOTMART_PROVIDER_PAGINATION_INVALID', 'paginação ausente ou inválida')
  }
  const allowedKeys = new Set(topLevelKeys)
  if (sources.slice(0, containers.length).some(source => Object.keys(source).some(key => !allowedKeys.has(key)))) {
    throw providerError('HOTMART_PROVIDER_PAGINATION_INVALID', 'campos de paginação desconhecidos')
  }
  const tokens = sources.flatMap(source => ['next_page_token', 'nextPageToken']
    .filter(key => key in source)
    .map(key => source[key]))
  if (tokens.some(value => value !== null && (typeof value !== 'string' || value.trim() === ''))) {
    throw providerError('HOTMART_PROVIDER_PAGINATION_INVALID', 'cursor inválido')
  }
  const normalizedTokens = tokens.filter((value): value is string => typeof value === 'string')
    .map(value => value.trim()).filter(Boolean)
  const distinctTokens = [...new Set(normalizedTokens)]
  if (distinctTokens.length > 1 || (tokens.includes(null) && distinctTokens.length > 0)) {
    throw providerError('HOTMART_PROVIDER_PAGINATION_CONFLICT', 'cursores contraditórios')
  }
  const nextPageToken = distinctTokens[0] ?? null
  const moreValues = sources.flatMap(source => ['has_more', 'hasMore']
    .filter(key => key in source)
    .map(key => source[key]))
  if (moreValues.some(value => typeof value !== 'boolean') || new Set(moreValues).size > 1) {
    throw providerError('HOTMART_PROVIDER_PAGINATION_CONFLICT', 'has_more contraditório')
  }
  const hasMore = moreValues.length > 0 ? moreValues[0] as boolean : nextPageToken !== null
  if (hasMore !== (nextPageToken !== null)) {
    throw providerError('HOTMART_PROVIDER_PAGINATION_CONFLICT', 'cursor e has_more não coincidem')
  }
  return { nextPageToken, hasMore }
}

export const stableHotmartUserId = (user: HotmartUser): string => {
  if (!isRecord(user)) throw providerError('HOTMART_PROVIDER_USER_INVALID', 'utilizador não é objecto')
  const values = ['id', 'user_id', 'uid', 'code']
    .map(key => user[key as keyof HotmartUser])
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(String)
  if (values.length === 0) throw providerError('HOTMART_PROVIDER_USER_IDENTITY_INVALID', 'utilizador sem identidade estável')
  if (new Set(values).size > 1) throw providerError('HOTMART_PROVIDER_USER_IDENTITY_CONFLICT', 'identidades contraditórias')
  return values[0]
}

export const fetchAllHotmartUsers = async (
  accessToken: string,
  options: HotmartFetchOptions = {},
): Promise<HotmartUser[]> => {
  let allUsers: HotmartUser[] = []
  let nextPageToken: string | null = null
  let pageCount = 0
  const seenUserIds = new Set<string>()
  const seenPageTokens = new Set<string>()
  const subdomain = getHotmartSubdomain()

  logger.info('📡 [HotmartFetch] Iniciando busca de utilizadores...')

  try {
    do {
      pageCount++
      if (pageCount > HOTMART_PROVIDER_MAX_PAGES) {
        throw providerError('HOTMART_PROVIDER_PAGE_LIMIT_EXCEEDED', `limite de ${HOTMART_PROVIDER_MAX_PAGES} páginas excedido`)
      }
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
        { maxRetries: 5, baseDelayMs: 1000, phaseHooks: options.phaseHooks }
      )

      const payload = response.data as unknown
      if (!isRecord(payload)) throw providerError('HOTMART_PROVIDER_ENVELOPE_INVALID', 'resposta não é objecto')
      const hasProviderErrors = payload.error !== undefined
        || (Array.isArray(payload.errors) && payload.errors.length > 0)
        || payload.failure !== undefined
      if (payload.success === false || hasProviderErrors || payload.partial === true || payload.is_partial === true || payload.incomplete === true) {
        throw providerError('HOTMART_PROVIDER_PARTIAL_RESPONSE', 'resposta parcial ou falhada')
      }
      const users = normalizePageUsers(payload)
      if (users.length > HOTMART_PROVIDER_PAGE_SIZE) {
        throw providerError('HOTMART_PROVIDER_PAGE_SIZE_EXCEEDED', `página excede ${HOTMART_PROVIDER_PAGE_SIZE} itens`)
      }
      for (const user of users) {
        const userId = stableHotmartUserId(user)
        if (seenUserIds.has(userId)) throw providerError('HOTMART_PROVIDER_USER_DUPLICATE', `identidade repetida: ${userId}`)
        seenUserIds.add(userId)
      }
      if (allUsers.length + users.length > HOTMART_PROVIDER_MAX_ITEMS) {
        throw providerError('HOTMART_PROVIDER_ITEM_LIMIT_EXCEEDED', `limite de ${HOTMART_PROVIDER_MAX_ITEMS} itens excedido`)
      }
      const pageInfo = normalizePageInfo(payload)

      allUsers = allUsers.concat(users)
      if (pageInfo.nextPageToken && seenPageTokens.has(pageInfo.nextPageToken)) {
        throw providerError('HOTMART_PROVIDER_CURSOR_REPEATED', 'cursor repetido')
      }
      if (pageInfo.nextPageToken === nextPageToken && pageInfo.nextPageToken !== null) {
        throw providerError('HOTMART_PROVIDER_CURSOR_REPEATED', 'cursor não avançou')
      }
      nextPageToken = pageInfo.nextPageToken
      if (nextPageToken) seenPageTokens.add(nextPageToken)

      logger.info(`✅ [HotmartFetch] Página ${pageCount}: ${users.length} utilizadores | Total: ${allUsers.length}`)
      logger.info(`   nextPageToken: ${nextPageToken ? 'exists' : 'null'}`)

      if (pageInfo.hasMore && nextPageToken) {
        await sleep(500)
      }
    } while (nextPageToken)

    logger.info(`🎯 [HotmartFetch] Busca completa: ${allUsers.length} utilizadores em ${pageCount} páginas`)
    return allUsers
  } catch (error: unknown) {
    logger.error('❌ [HotmartFetch] Erro:', responseData(error) || errorMessage(error))
    if (error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError') {
      throw error
    }
    if (error instanceof Error && typeof (error as { code?: unknown }).code === 'string') {
      throw error
    }
    throw new Error(`Erro ao buscar utilizadores: ${errorMessage(error)}`)
  }
}

export const fetchUserLessons = async (
  userId: string,
  accessToken: string,
  options: HotmartFetchOptions = {},
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
      { maxRetries: 3, baseDelayMs: 500, phaseHooks: options.phaseHooks }
    )

    const payload = response.data as unknown
    if (!isRecord(payload)) {
      throw providerError('HOTMART_PROVIDER_LESSONS_INVALID', 'envelope de lições inválido')
    }
    if (
      payload.success === false ||
      payload.partial === true ||
      payload.is_partial === true ||
      payload.incomplete === true ||
      payload.failure !== undefined ||
      payload.error !== undefined ||
      payload.errors !== undefined
    ) {
      throw providerError('HOTMART_PROVIDER_LESSONS_FAILED', 'resposta de lições falhada ou parcial')
    }
    if (!Array.isArray(payload.lessons) || payload.lessons.length > HOTMART_PROVIDER_MAX_LESSONS) {
      throw providerError('HOTMART_PROVIDER_LESSONS_INVALID', 'lista de lições inválida')
    }
    return payload.lessons.map((lesson, index) => {
      if (!isRecord(lesson)) {
        throw providerError('HOTMART_PROVIDER_LESSON_INVALID', `lição ${index} inválida`)
      }
      const stringFields = ['page_id', 'page_name', 'module_name']
      if (stringFields.some(field => typeof lesson[field] !== 'string' || String(lesson[field]).trim() === '')) {
        throw providerError('HOTMART_PROVIDER_LESSON_INVALID', `lição ${index} sem identidade/conteúdo`)
      }
      if (typeof lesson.is_module_extra !== 'boolean' || typeof lesson.is_completed !== 'boolean') {
        throw providerError('HOTMART_PROVIDER_LESSON_INVALID', `lição ${index} com flags inválidas`)
      }
      if (lesson.completed_date !== undefined &&
        (typeof lesson.completed_date !== 'number' || !Number.isFinite(lesson.completed_date) || lesson.completed_date < 0)) {
        throw providerError('HOTMART_PROVIDER_LESSON_INVALID', `lição ${index} com data inválida`)
      }
      return lesson as unknown as HotmartLesson
    })
  } catch (error: unknown) {
    logger.warn(`⚠️ [HotmartFetch] Erro ao buscar lições do user ${userId}:`, errorMessage(error))
    throw error
  }
}

export const fetchBatchUserProgress = async (
  users: HotmartUser[],
  accessToken: string,
  concurrency: number = 5,
  options: HotmartFetchOptions = {},
): Promise<Map<string, ProgressData>> => {
  const progressMap = new Map<string, ProgressData>()
  const userIds = users.map(user => stableHotmartUserId(user))

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
      const lessons = await fetchUserLessons(userId, accessToken, options)
      progressMap.set(userId, calculateProgress(lessons))
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
