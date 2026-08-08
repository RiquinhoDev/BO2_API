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
