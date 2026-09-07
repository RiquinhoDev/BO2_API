import { parseBooleanFlag } from './configPrimitives'
import type { IntegrationConfig, HotmartIntegration } from './configTypes'

export function parseHotmartSyncManualExecutionEnabled(
  env: NodeJS.ProcessEnv,
  hotmart: IntegrationConfig<HotmartIntegration>,
): boolean {
  const enabled = parseBooleanFlag(
    env.HOTMART_SYNC_MANUAL_EXECUTION_ENABLED,
    'HOTMART_SYNC_MANUAL_EXECUTION_ENABLED',
  )
  if (enabled && !hotmart.configured) {
    throw new Error(
      'CONFIG_INVALIDA: HOTMART_SYNC_MANUAL_EXECUTION_ENABLED requer credenciais Hotmart completas',
    )
  }
  return enabled
}
