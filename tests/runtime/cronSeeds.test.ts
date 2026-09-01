import {
  createCronSeedProvisioner,
  type CronSeedDefinition,
  type CronSeedRepositoryPort,
  type CronSeedState,
  type CronSeedUpdate,
} from '../../src/runtime/cronSeeds'

class InMemoryCronSeedRepository implements CronSeedRepositoryPort {
  readonly created: CronSeedDefinition[] = []
  readonly updated: Array<{
    name: string
    updates: CronSeedUpdate
  }> = []
  readonly removed: string[] = []

  constructor(
    private readonly jobs = new Map<string, CronSeedState>(),
  ) {}

  async findByName(name: string): Promise<CronSeedState | null> {
    return this.jobs.get(name) ?? null
  }

  async create(seed: CronSeedDefinition): Promise<void> {
    this.created.push(seed)
    this.jobs.set(seed.name, {
      cronExpression: seed.schedule.cronExpression,
      timezone: seed.schedule.timezone,
      hasCreatedBy: true,
    })
  }

  async update(
    name: string,
    updates: CronSeedUpdate,
  ): Promise<void> {
    const existing = this.jobs.get(name)
    if (!existing) throw new Error(`Missing seed ${name}`)
    this.updated.push({ name, updates })
    this.jobs.set(name, {
      ...existing,
      ...(updates.cronExpression
        ? { cronExpression: updates.cronExpression }
        : {}),
      ...(updates.timezone ? { timezone: updates.timezone } : {}),
      ...(updates.ensureCreatedBy ? { hasCreatedBy: true } : {}),
    })
  }

  async remove(name: string): Promise<void> {
    this.removed.push(name)
    this.jobs.delete(name)
  }
}

test('creates both canonical seeds and initializes the scheduler once', async () => {
  const repository = new InMemoryCronSeedRepository()
  let schedulerInitializations = 0
  const provision = createCronSeedProvisioner({
    repository,
    initializeScheduler: async () => {
      schedulerInitializations += 1
    },
    logError: () => undefined,
  })

  await provision()

  expect(repository.created.map(seed => seed.name)).toEqual([
    'ClarezaDailyRefresh',
    'GuruTrialCheck',
  ])
  expect(repository.created.map(seed => seed.schedule)).toEqual([
    {
      cronExpression: '0 3 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
    {
      cronExpression: '0 7 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
  ])
  expect(schedulerInitializations).toBe(1)
})

test('does not write or reinitialize when canonical seeds already exist', async () => {
  const repository = new InMemoryCronSeedRepository(new Map([
    ['ClarezaDailyRefresh', {
      cronExpression: '0 3 * * *',
      timezone: 'Europe/Lisbon',
      hasCreatedBy: true,
    }],
    ['GuruTrialCheck', {
      cronExpression: '0 7 * * *',
      timezone: 'Europe/Lisbon',
      hasCreatedBy: true,
    }],
  ]))
  let schedulerInitializations = 0

  await createCronSeedProvisioner({
    repository,
    initializeScheduler: async () => {
      schedulerInitializations += 1
    },
    logError: () => undefined,
  })()

  expect(repository.created).toEqual([])
  expect(repository.updated).toEqual([])
  expect(schedulerInitializations).toBe(0)
})

test('repairs the Clareza schedule and audit owner through one repository update', async () => {
  const repository = new InMemoryCronSeedRepository(new Map([
    ['ClarezaDailyRefresh', {
      cronExpression: '0 0 * * *',
      timezone: 'UTC',
      hasCreatedBy: false,
    }],
    ['GuruTrialCheck', {
      cronExpression: '0 7 * * *',
      timezone: 'Europe/Lisbon',
      hasCreatedBy: true,
    }],
  ]))

  await createCronSeedProvisioner({
    repository,
    initializeScheduler: async () => undefined,
    logError: () => undefined,
  })()

  expect(repository.updated).toEqual([{
    name: 'ClarezaDailyRefresh',
    updates: {
      cronExpression: '0 3 * * *',
      timezone: 'Europe/Lisbon',
      ensureCreatedBy: true,
    },
  }])
})

test('removes the old Clareza scheduler only after the canonical job exists', async () => {
  const repository = new InMemoryCronSeedRepository(new Map([
    ['ClarezaRefresh', {
      cronExpression: '0 6 * * *', timezone: 'Europe/Lisbon', hasCreatedBy: true,
    }],
  ]))

  await createCronSeedProvisioner({
    repository,
    initializeScheduler: async () => undefined,
    logError: () => undefined,
  })()

  expect(repository.created.map(seed => seed.name)).toContain('ClarezaDailyRefresh')
  expect(repository.removed).toEqual(['ClarezaRefresh'])
})

test('logs scheduler refresh failure without aborting application startup', async () => {
  const repository = new InMemoryCronSeedRepository()
  const errors: string[] = []

  await expect(createCronSeedProvisioner({
    repository,
    initializeScheduler: async () => {
      throw new Error('scheduler unavailable')
    },
    logError: message => errors.push(message),
  })()).resolves.toBeUndefined()

  expect(errors).toEqual(['Erro ao atualizar scheduler após cron seeds'])
})
