import { type Collection, type Document, MongoClient } from 'mongodb'

export interface AcWebhookLeaseCatalog {
  countLegacyProcessing(): Promise<number>
  backfillLegacyProcessing(leaseExpiresAt: Date): Promise<number>
}

export interface AcWebhookLeaseBackfillOptions {
  apply: boolean
  workersDrained: boolean
  now: Date
}

export interface AcWebhookLeaseBackfillResult {
  status: 'pending' | 'applied' | 'verified'
  legacyProcessing: number
  mutated: number
}

export interface AcWebhookLeaseBackfillCliConfig {
  mongoUri: string
  apply: boolean
  workersDrained: boolean
}

export class AcWebhookLeaseBackfillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcWebhookLeaseBackfillError'
  }
}

const legacyProcessingFilter = {
  status: 'processing',
  leaseExpiresAt: { $exists: false },
}

export class MongoAcWebhookLeaseCatalog implements AcWebhookLeaseCatalog {
  constructor(private readonly collection: Collection<Document>) {}

  countLegacyProcessing(): Promise<number> {
    return this.collection.countDocuments(legacyProcessingFilter)
  }

  async backfillLegacyProcessing(leaseExpiresAt: Date): Promise<number> {
    const result = await this.collection.updateMany(
      legacyProcessingFilter,
      { $set: { leaseExpiresAt } },
    )
    return result.modifiedCount
  }
}

export async function backfillAcWebhookReceiptLeases(
  catalog: AcWebhookLeaseCatalog,
  options: AcWebhookLeaseBackfillOptions,
): Promise<AcWebhookLeaseBackfillResult> {
  const initialCount = await catalog.countLegacyProcessing()
  if (initialCount === 0) {
    return { status: 'verified', legacyProcessing: 0, mutated: 0 }
  }
  if (!options.apply) {
    return {
      status: 'pending',
      legacyProcessing: initialCount,
      mutated: 0,
    }
  }
  if (!options.workersDrained) {
    throw new AcWebhookLeaseBackfillError(
      'old webhook workers must be drained before applying the lease backfill',
    )
  }

  const mutated = await catalog.backfillLegacyProcessing(options.now)
  const remaining = await catalog.countLegacyProcessing()
  if (remaining !== 0) {
    throw new AcWebhookLeaseBackfillError(
      'AC webhook lease backfill could not be verified',
    )
  }
  return {
    status: 'applied',
    legacyProcessing: 0,
    mutated,
  }
}

const readBoolean = (
  environment: NodeJS.ProcessEnv,
  name: string,
): boolean => {
  const value = environment[name]
  if (value !== undefined && value !== 'true' && value !== 'false') {
    throw new AcWebhookLeaseBackfillError(`${name} must be true or false`)
  }
  return value === 'true'
}

export function readAcWebhookLeaseBackfillCliConfig(
  environment: NodeJS.ProcessEnv,
): AcWebhookLeaseBackfillCliConfig {
  const mongoUri = environment.MONGO_URI?.trim()
  if (!mongoUri) {
    throw new AcWebhookLeaseBackfillError(
      'MONGO_URI is required for AC webhook lease backfill',
    )
  }
  return {
    mongoUri,
    apply: readBoolean(environment, 'AC_WEBHOOK_LEASE_BACKFILL_APPLY'),
    workersDrained: readBoolean(
      environment,
      'AC_WEBHOOK_LEGACY_WORKERS_DRAINED',
    ),
  }
}

export async function runAcWebhookLeaseBackfillCli(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AcWebhookLeaseBackfillResult> {
  const config = readAcWebhookLeaseBackfillCliConfig(environment)
  const client = new MongoClient(config.mongoUri)
  try {
    await client.connect()
    return await backfillAcWebhookReceiptLeases(
      new MongoAcWebhookLeaseCatalog(
        client.db().collection('ac_webhook_receipts'),
      ),
      {
        apply: config.apply,
        workersDrained: config.workersDrained,
        now: new Date(),
      },
    )
  } finally {
    await client.close()
  }
}

if (require.main === module) {
  void runAcWebhookLeaseBackfillCli()
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      const message = error instanceof AcWebhookLeaseBackfillError
        ? error.message
        : 'AC webhook lease backfill failed'
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    })
}
