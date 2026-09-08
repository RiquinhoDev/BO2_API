import { getRuntimeConfig } from '../../config/runtimeConfig'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'

export function isClarezaCanonicalEnabled(): boolean {
  return getRuntimeConfig().operationalControls?.clarezaCanonicalEnabled === true
}

export function assertClarezaRefreshEnabled(): void {
  if (!isClarezaCanonicalEnabled() || getRuntimeConfig().operationalControls?.clarezaRefreshEnabled !== true) {
    throw new IntegrationUnavailableError('clareza')
  }
}

export function getCanonicalFmpApiKey(): string {
  const config = getRuntimeConfig()
  if (config.operationalControls?.clarezaCanonicalEnabled !== true
    || config.operationalControls.clarezaFmpEgressEnabled !== true
    || !config.integrations.fmp.configured) throw new IntegrationUnavailableError('fmp')
  return config.integrations.fmp.value.apiKey
}
