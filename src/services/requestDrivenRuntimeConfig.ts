import { getRuntimeConfig } from '../config/runtimeConfig'
import { IntegrationUnavailableError } from '../errors/integrationUnavailableError'

export interface CurseducaRuntimeSettings {
  readonly apiUrl: string
  readonly apiKey: string
  readonly accessToken: string
}

export function getCurseducaRuntimeSettings(): CurseducaRuntimeSettings {
  const integration = getRuntimeConfig().integrations.curseduca
  if (!integration.configured) throw new IntegrationUnavailableError('curseduca')
  return integration.value
}

export function getOptionalCurseducaRuntimeSettings(): CurseducaRuntimeSettings | undefined {
  const integration = getRuntimeConfig().integrations.curseduca
  return integration.configured ? integration.value : undefined
}

export function getGuruUserToken(): string {
  const integration = getRuntimeConfig().integrations.guru
  const token = integration.configured ? integration.value.userToken : undefined
  if (!token) throw new IntegrationUnavailableError('guru')
  return token
}

export function getGuruAccountToken(): string {
  const integration = getRuntimeConfig().integrations.guru
  const token = integration.configured ? integration.value.accountToken : undefined
  if (!token) throw new IntegrationUnavailableError('guru')
  return token
}

export function getSlackWebhookUrl(): string | undefined {
  const integration = getRuntimeConfig().integrations.slack
  return integration.configured ? integration.value.webhookUrl : undefined
}

export function getStudentSummaryToken(): string | undefined {
  const integration = getRuntimeConfig().integrations.studentSummary
  return integration.configured ? integration.value.token : undefined
}

export function getOptionalFmpApiKey(): string | undefined {
  const integration = getRuntimeConfig().integrations.fmp
  return integration.configured ? integration.value.apiKey : undefined
}

export function getFmpApiKey(): string {
  const integration = getRuntimeConfig().integrations.fmp
  if (!integration.configured) throw new IntegrationUnavailableError('fmp')
  return integration.value.apiKey
}

export interface HotmartCredentials {
  readonly clientId: string
  readonly clientSecret: string
}

export function getHotmartCredentials(): HotmartCredentials {
  const integration = getRuntimeConfig().integrations.hotmart
  if (!integration.configured) throw new IntegrationUnavailableError('hotmart')
  return {
    clientId: integration.value.clientId,
    clientSecret: integration.value.clientSecret,
  }
}

export function getHotmartSubdomain(): string {
  const integration = getRuntimeConfig().integrations.hotmart
  const subdomain = integration.configured ? integration.value.subdomain : undefined
  if (!subdomain) throw new IntegrationUnavailableError('hotmart')
  return subdomain
}

export function getOptionalHotmartSubdomain(): string | undefined {
  const integration = getRuntimeConfig().integrations.hotmart
  return integration.configured ? integration.value.subdomain : undefined
}

export function getHotmartSyncUserId(): string | undefined {
  const integration = getRuntimeConfig().integrations.hotmart
  return integration.configured ? integration.value.syncUserId : undefined
}
