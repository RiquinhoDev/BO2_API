import axios, { AxiosInstance } from 'axios'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import type { ActiveCampaignIntegration } from '../../config/configTypes'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import logger from '../../utils/logger'

export interface ActiveCampaignTransportPolicy {
  maxRequestsPerMinute: number
  requestDelayMs: number
  requestTimeoutMs: number
  maxRetries: number
  retryDelayMs: number
  windowMs: number
}

interface ActiveCampaignTransportOptions {
  readIntegration?: () => ActiveCampaignIntegration
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  policy?: ActiveCampaignTransportPolicy
}

const DEFAULT_POLICY: ActiveCampaignTransportPolicy = {
  maxRequestsPerMinute: 280,
  requestDelayMs: 200,
  requestTimeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 2_000,
  windowMs: 60_000,
}

function readRuntimeIntegration(): ActiveCampaignIntegration {
  const integration = getRuntimeConfig().integrations.activeCampaign
  if (!integration.configured) throw new IntegrationUnavailableError('activeCampaign')
  return integration.value
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export class ActiveCampaignTransport {
  private clientInstance: AxiosInstance | null = null
  private clientConfigKey: string | null = null
  private requestCount = 0
  private lastResetTime: number
  private readonly readIntegration: () => ActiveCampaignIntegration
  private readonly now: () => number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly policy: ActiveCampaignTransportPolicy

  constructor(options: ActiveCampaignTransportOptions = {}) {
    this.readIntegration = options.readIntegration ?? readRuntimeIntegration
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? wait
    this.policy = options.policy ?? DEFAULT_POLICY
    this.lastResetTime = this.now()
  }

  get client(): AxiosInstance {
    const integration = this.ensureAvailable()
    const configKey = `${integration.apiUrl}\u0000${integration.apiKey}`
    if (this.clientInstance && this.clientConfigKey === configKey) return this.clientInstance

    this.clientInstance = axios.create({
      baseURL: integration.apiUrl,
      timeout: this.policy.requestTimeoutMs,
      headers: {
        'Api-Token': integration.apiKey,
        'Content-Type': 'application/json',
      },
    })
    this.clientConfigKey = configKey
    return this.clientInstance
  }

  ensureAvailable(): ActiveCampaignIntegration {
    return this.readIntegration()
  }

  rethrowIntegrationUnavailable(error: unknown): void {
    if (error instanceof IntegrationUnavailableError) throw error
  }

  async checkRateLimit(): Promise<void> {
    this.ensureAvailable()
    const now = this.now()
    const elapsed = now - this.lastResetTime

    if (elapsed >= this.policy.windowMs) {
      this.requestCount = 0
      this.lastResetTime = now
    }

    if (this.requestCount >= this.policy.maxRequestsPerMinute) {
      const waitTime = this.policy.windowMs - elapsed
      logger.warn(`Rate limit ActiveCampaign atingido; pausa de ${waitTime}ms`)
      await this.sleep(waitTime)
      this.requestCount = 0
      this.lastResetTime = this.now()
    }

    this.requestCount += 1
    if (this.requestCount > 1) await this.sleep(this.policy.requestDelayMs)
  }

  async retryRequest<T>(fn: () => Promise<T>, retries = this.policy.maxRetries): Promise<T> {
    this.ensureAvailable()
    try {
      return await fn()
    } catch (error) {
      this.rethrowIntegrationUnavailable(error)
      if (retries > 0 && this.isRetryableError(error)) {
        logger.warn(`Erro ActiveCampaign; nova tentativa (${retries} restantes)`)
        await this.sleep(this.policy.retryDelayMs)
        return this.retryRequest(fn, retries - 1)
      }
      throw error
    }
  }

  formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return JSON.stringify({
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      }, null, 2)
    }
    return error instanceof Error ? error.message : 'Erro desconhecido'
  }

  async testConnection(): Promise<boolean> {
    this.ensureAvailable()
    try {
      await this.checkRateLimit()
      await this.client.get('/api/3/users/me')
      logger.info('Conexão ActiveCampaign testada com sucesso')
      return true
    } catch (error) {
      this.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao testar ActiveCampaign: ${this.formatError(error)}`)
      return false
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false
    const status = error.response?.status
    return !status || status >= 500 || error.code === 'ECONNABORTED'
  }
}
