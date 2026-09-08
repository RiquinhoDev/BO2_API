import { parseBooleanFlag } from './configPrimitives'
import type { CurseducaIntegration, IntegrationConfig } from './configTypes'

export function parseCurseducaSyncManualExecutionEnabled(
  env: NodeJS.ProcessEnv,
  curseduca: IntegrationConfig<CurseducaIntegration>,
): boolean {
  const enabled = parseBooleanFlag(
    env.CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED,
    'CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED',
  )
  if (enabled && !curseduca.configured) {
    throw new Error(
      'CONFIG_INVALIDA: CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED requer credenciais CursEduca completas',
    )
  }
  return enabled
}
