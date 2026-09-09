import type { AppConfig } from '../config/appConfig'

/** Explicit destination approved for the production-data copy; never the source cluster. */
export function isIsolatedComparisonDatabase(config: AppConfig, databaseName: string): boolean {
  if (config.nodeEnv !== 'test' || databaseName !== 'teste') return false
  try {
    const uri = new URL(config.mongoUri)
    return uri.protocol === 'mongodb+srv:'
      && uri.hostname === 'cluster0.otcx5ho.mongodb.net'
      && uri.port === ''
      && uri.pathname === '/teste'
  } catch {
    return false
  }
}
