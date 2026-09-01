export interface CronSeedState {
  cronExpression: string
  timezone: string
  hasCreatedBy: boolean
}

export interface CronSeedUpdate {
  cronExpression?: string
  timezone?: string
  ensureCreatedBy?: true
}

export interface CronSeedDefinition {
  name: string
  description: string
  syncType: 'clareza' | 'guru'
  schedule: {
    cronExpression: string
    timezone: string
    enabled: true
  }
  syncConfig: {
    fullSync: boolean
    includeProgress: false
    includeTags: false
    batchSize: 200
  }
  tagRules: readonly []
  tagRuleOptions: {
    enabled: false
    executeAllRules: false
    runInParallel: false
    stopOnError: false
  }
  notifications: {
    enabled: false
    emailOnSuccess: false
    emailOnFailure: false
    recipients: readonly []
  }
  retryPolicy: {
    maxRetries: 2
    retryDelayMinutes: 30
    exponentialBackoff: false
  }
}

export interface CronSeedRepositoryPort {
  findByName(name: string): Promise<CronSeedState | null>
  create(seed: CronSeedDefinition): Promise<void>
  update(name: string, updates: CronSeedUpdate): Promise<void>
  remove(name: string): Promise<void>
}

interface CronSeedProvisionerDependencies {
  repository: CronSeedRepositoryPort
  initializeScheduler: () => Promise<void>
  logError: (message: string, error: unknown) => void
}

const CRON_SEEDS: readonly CronSeedDefinition[] = [
  {
    name: 'ClarezaDailyRefresh',
    description:
      'Atualiza dados Clareza diariamente via Financial Modeling Prep API',
    syncType: 'clareza',
    schedule: {
      cronExpression: '0 3 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
    syncConfig: {
      fullSync: true,
      includeProgress: false,
      includeTags: false,
      batchSize: 200,
    },
    tagRules: [],
    tagRuleOptions: {
      enabled: false,
      executeAllRules: false,
      runInParallel: false,
      stopOnError: false,
    },
    notifications: {
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: false,
      recipients: [],
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelayMinutes: 30,
      exponentialBackoff: false,
    },
  },
  {
    name: 'GuruTrialCheck',
    description:
      'Sincroniza trials Guru e marca expirados (>7d sem conversão) PARA_INATIVAR; não inativa.',
    syncType: 'guru',
    schedule: {
      cronExpression: '0 7 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
    syncConfig: {
      fullSync: false,
      includeProgress: false,
      includeTags: false,
      batchSize: 200,
    },
    tagRules: [],
    tagRuleOptions: {
      enabled: false,
      executeAllRules: false,
      runInParallel: false,
      stopOnError: false,
    },
    notifications: {
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: false,
      recipients: [],
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelayMinutes: 30,
      exponentialBackoff: false,
    },
  },
]

const LEGACY_CLAREZA_SEEDS = ['ClarezaRefresh'] as const

function buildUpdate(
  current: CronSeedState,
  expected: CronSeedDefinition,
): CronSeedUpdate {
  const updates: CronSeedUpdate = {}
  if (current.cronExpression !== expected.schedule.cronExpression) {
    updates.cronExpression = expected.schedule.cronExpression
  }
  if (current.timezone !== expected.schedule.timezone) {
    updates.timezone = expected.schedule.timezone
  }
  if (!current.hasCreatedBy) updates.ensureCreatedBy = true
  return updates
}

export function createCronSeedProvisioner(
  dependencies: CronSeedProvisionerDependencies,
): () => Promise<void> {
  return async () => {
    let schedulerNeedsRefresh = false

    for (const seed of CRON_SEEDS) {
      try {
        const current = await dependencies.repository.findByName(seed.name)
        if (!current) {
          await dependencies.repository.create(seed)
          schedulerNeedsRefresh = true
          continue
        }

        const updates = buildUpdate(current, seed)
        if (Object.keys(updates).length > 0) {
          await dependencies.repository.update(seed.name, updates)
          schedulerNeedsRefresh = true
        }
      } catch (error) {
        dependencies.logError(
          `Erro ao provisionar cron seed ${seed.name}`,
          error,
        )
      }
    }

    try {
      const canonical = await dependencies.repository.findByName('ClarezaDailyRefresh')
      if (canonical) {
        for (const legacyName of LEGACY_CLAREZA_SEEDS) {
          if (await dependencies.repository.findByName(legacyName)) {
            await dependencies.repository.remove(legacyName)
            schedulerNeedsRefresh = true
          }
        }
      }
    } catch (error) {
      dependencies.logError('Erro ao remover cron Clareza legacy', error)
    }

    if (schedulerNeedsRefresh) {
      try {
        await dependencies.initializeScheduler()
      } catch (error) {
        dependencies.logError(
          'Erro ao atualizar scheduler após cron seeds',
          error,
        )
      }
    }
  }
}
