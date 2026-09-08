import { parseBooleanFlag } from './configPrimitives'
import type { CurseducaIntegration, HotmartIntegration, IntegrationConfig } from './configTypes'

export function parseAllSyncManualExecutionEnabled(
  env: NodeJS.ProcessEnv,
  hotmart: IntegrationConfig<HotmartIntegration>,
  curseduca: IntegrationConfig<CurseducaIntegration>,
): boolean {
  const enabled = parseBooleanFlag(
    env.ALL_SYNC_MANUAL_EXECUTION_ENABLED,
    'ALL_SYNC_MANUAL_EXECUTION_ENABLED',
  )
  if (enabled && (!hotmart.configured || !curseduca.configured)) {
    throw new Error(
      'CONFIG_INVALIDA: ALL_SYNC_MANUAL_EXECUTION_ENABLED requer credenciais Hotmart e CursEduca completas',
    )
  }
  return enabled
}
