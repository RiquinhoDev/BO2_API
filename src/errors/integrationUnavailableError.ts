import type { IntegrationConfigs } from '../config/configTypes'

export type IntegrationName = keyof IntegrationConfigs

export class IntegrationUnavailableError extends Error {
  readonly integration: IntegrationName
  readonly internalCause?: unknown

  constructor(integration: IntegrationName, cause?: unknown) {
    super('Integration unavailable')
    this.name = 'IntegrationUnavailableError'
    this.integration = integration
    this.internalCause = cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}