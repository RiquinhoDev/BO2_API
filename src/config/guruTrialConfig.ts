import type { GuruIntegration, IntegrationConfig } from './configTypes'
import { hasAnyValue, parseBooleanFlag, readOptionalString } from './configPrimitives'

export function parseGuru(env: NodeJS.ProcessEnv): IntegrationConfig<GuruIntegration> {
  const names = ['GURU_USER_TOKEN', 'GURU_ACCOUNT_TOKEN'] as const
  if (!hasAnyValue(env, names)) return { configured: false }

  return {
    configured: true,
    value: {
      ...(readOptionalString(env, 'GURU_USER_TOKEN')
        ? { userToken: readOptionalString(env, 'GURU_USER_TOKEN') }
        : {}),
      ...(readOptionalString(env, 'GURU_ACCOUNT_TOKEN')
        ? { accountToken: readOptionalString(env, 'GURU_ACCOUNT_TOKEN') }
        : {}),
    },
  }
}

export function parseGuruTrialManualExecutionEnabled(
  env: NodeJS.ProcessEnv,
  integration: IntegrationConfig<GuruIntegration>,
): boolean {
  const enabled = parseBooleanFlag(
    env.GURU_TRIAL_MANUAL_EXECUTION_ENABLED,
    'GURU_TRIAL_MANUAL_EXECUTION_ENABLED',
  )
  if (enabled && (!integration.configured || !integration.value.userToken || !integration.value.accountToken)) {
    throw new Error('CONFIG_INVALIDA: GURU_TRIAL_MANUAL_EXECUTION_ENABLED requer credenciais Guru completas')
  }
  return enabled
}
