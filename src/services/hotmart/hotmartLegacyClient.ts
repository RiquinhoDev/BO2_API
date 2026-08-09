import axios from 'axios'
import type { IUser } from '../../models/user'
import {
  getHotmartCredentials,
  getHotmartSubdomain
} from '../requestDrivenRuntimeConfig'
import logger from '../../utils/logger'

export type HotmartApiUser = {
  email?: string
  name?: string
  id?: string
  user_id?: string
  uid?: string
  code?: string
  class_id?: string
  purchase_date?: unknown
  signup_date?: unknown
  plus_access?: IUser['hotmart'] extends { plusAccess: infer Value } ? Value : string
  first_access_date?: unknown
  last_access_date?: unknown
  access_count?: string | number
  engagement?: string
}

export type HotmartLesson = {
  page_id: string
  page_name: string
  module_name: string
  is_module_extra: boolean
  is_completed: boolean
  completed_date?: number
}

type HotmartUsersResponse = {
  users?: HotmartApiUser[]
  items?: HotmartApiUser[]
  data?: HotmartApiUser[]
  page_info?: { next_page_token?: string }
  pageInfo?: { nextPageToken?: string }
  pagination?: { next_page_token?: string; nextPageToken?: string }
}

type HttpResponse<T> = { data: T }

export interface HotmartHttpPort {
  post<T>(url: string, body: URLSearchParams, config: { headers: Record<string, string> }): Promise<HttpResponse<T>>
  get<T>(url: string, config: { headers: Record<string, string> }): Promise<HttpResponse<T>>
}

type ErrorDetails = {
  message: string
  data?: unknown
  status?: number
  url?: string
  description?: string
}

class HotmartAccessTokenError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'HotmartAccessTokenError'
    this.cause = cause
  }
}

type HotmartClientLog = Pick<typeof logger, 'info' | 'warn' | 'error'>

export interface HotmartLegacyClientDependencies {
  http: HotmartHttpPort
  readCredentials: typeof getHotmartCredentials
  readSubdomain: typeof getHotmartSubdomain
  describeError: (error: unknown) => ErrorDetails
  log: HotmartClientLog
}

function defaultErrorDetails(error: unknown): ErrorDetails {
  const data = axios.isAxiosError(error) ? error.response?.data : undefined
  const description = typeof data === 'object' && data !== null &&
    'error_description' in data && typeof data.error_description === 'string'
    ? data.error_description
    : undefined

  return {
    message: error instanceof Error ? error.message : String(error),
    data,
    status: axios.isAxiosError(error) ? error.response?.status : undefined,
    url: axios.isAxiosError(error) ? error.config?.url : undefined,
    description
  }
}

const defaultDependencies: HotmartLegacyClientDependencies = {
  http: {
    post: (url, body, config) => axios.post(url, body, config),
    get: (url, config) => axios.get(url, config)
  },
  readCredentials: getHotmartCredentials,
  readSubdomain: getHotmartSubdomain,
  describeError: defaultErrorDetails,
  log: logger
}

export function createHotmartLegacyClient(dependencies: HotmartLegacyClientDependencies) {
  return {
    async getAccessToken(): Promise<string> {
      const { clientId, clientSecret } = dependencies.readCredentials()
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

      try {
        const response = await dependencies.http.post<{ access_token?: string; expires_in?: number }>(
          'https://api-sec-vlc.hotmart.com/security/oauth/token',
          new URLSearchParams({ grant_type: 'client_credentials' }),
          { headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`
          } }
        )

        if (!response.data.access_token) {
          throw new Error('Access token não encontrado na resposta')
        }

        dependencies.log.info(`Token Hotmart obtido; expira em ${response.data.expires_in} segundos`)
        return response.data.access_token
      } catch (error: unknown) {
        const details = dependencies.describeError(error)
        dependencies.log.error('Erro ao obter token Hotmart', details)
        throw new HotmartAccessTokenError(`Falha ao obter token de acesso da Hotmart: ${details.description || details.message}`, error)
      }
    },

    async listUsersPage(accessToken: string, pageToken?: string) {
      const subdomain = dependencies.readSubdomain()
      const tokenQuery = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''
      const url = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}${tokenQuery}`
      const response = await dependencies.http.get<HotmartUsersResponse>(url, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      })
      const users = response.data.users || response.data.items || response.data.data || []

      if (!Array.isArray(users)) {
        throw new Error(`Resposta inválida da API: esperado array, recebido ${typeof users}`)
      }

      return {
        users,
        nextPageToken: response.data.page_info?.next_page_token ||
          response.data.pageInfo?.nextPageToken ||
          response.data.pagination?.next_page_token ||
          response.data.pagination?.nextPageToken ||
          null
      }
    },

    async listUserLessons(userId: string, accessToken: string): Promise<HotmartLesson[]> {
      const subdomain = dependencies.readSubdomain()
      const url = `https://developers.hotmart.com/club/api/v1/users/${encodeURIComponent(userId)}/lessons?subdomain=${subdomain}`

      try {
        const response = await dependencies.http.get<{ lessons?: HotmartLesson[] }>(url, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        })
        return response.data.lessons || []
      } catch (error: unknown) {
        dependencies.log.error(`Erro ao buscar lições do utilizador ${userId}`, dependencies.describeError(error))
        return []
      }
    }
  }
}

export const hotmartLegacyClient = createHotmartLegacyClient(defaultDependencies)
