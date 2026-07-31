import {
  type Collection,
  type Document,
  MongoClient,
} from 'mongodb'

export const usersV2PlatformStatusIndex = {
  name: 'users_v2_platform_status',
  key: { platform: 1, status: 1 },
}

export interface UsersV2IndexCatalog {
  list(): Promise<unknown[]>
  createExpected(): Promise<void>
}

export interface UsersV2IndexConnection {
  openCatalog(): Promise<UsersV2IndexCatalog>
  close(): Promise<void>
}

export interface UsersV2IndexMaintenanceResult {
  status: 'missing' | 'created' | 'verified'
  indexName: string
  mutated: boolean
}

export interface UsersV2IndexMaintenanceOptions {
  apply: boolean
}

export interface UsersV2IndexCliConfig {
  mongoUri: string
  apply: boolean
}

export class UsersV2IndexMaintenanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsersV2IndexMaintenanceError'
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return Object.fromEntries(Object.entries(value))
}

const keySignature = (value: unknown): string | undefined => {
  const record = asRecord(value)
  if (record === undefined) return undefined

  const entries: Array<[string, 1 | -1]> = []
  for (const [path, direction] of Object.entries(record)) {
    if (direction !== 1 && direction !== -1) return undefined
    entries.push([path, direction])
  }
  return JSON.stringify(entries)
}

const expectedKeySignature = keySignature(
  usersV2PlatformStatusIndex.key,
)

const hasDefaultBooleanOption = (value: unknown): boolean =>
  value === undefined || value === false

const hasExpectedOptions = (index: Record<string, unknown>): boolean => {
  if (!hasDefaultBooleanOption(index.unique)) return false
  if (!hasDefaultBooleanOption(index.sparse)) return false
  if (!hasDefaultBooleanOption(index.hidden)) return false
  if (!hasDefaultBooleanOption(index.prepareUnique)) return false

  const nonDefaultOptions = [
    'partialFilterExpression',
    'expireAfterSeconds',
    'collation',
    'wildcardProjection',
    'storageEngine',
    'weights',
    'default_language',
    'language_override',
    'textIndexVersion',
    '2dsphereIndexVersion',
    'bits',
    'min',
    'max',
    'bucketSize',
  ]
  return nonDefaultOptions.every(option => index[option] === undefined)
}

const inspectIndexes = (
  indexes: unknown[],
): 'missing' | 'verified' => {
  if (expectedKeySignature === undefined) {
    throw new UsersV2IndexMaintenanceError(
      'Users V2 expected index key is invalid',
    )
  }

  const parsed = indexes
    .map(asRecord)
    .filter((index): index is Record<string, unknown> =>
      index !== undefined)
  const equivalents = parsed
    .filter(index =>
      keySignature(index.key) === expectedKeySignature
      && index.name !== usersV2PlatformStatusIndex.name)
    .map(index => index.name)
    .filter((name): name is string => typeof name === 'string')
    .sort()

  if (equivalents.length > 0) {
    throw new UsersV2IndexMaintenanceError(
      `Equivalent Users V2 index ${equivalents[0]} exists; `
      + 'resolve the naming conflict before applying',
    )
  }

  const named = parsed.find(
    index => index.name === usersV2PlatformStatusIndex.name,
  )
  if (named === undefined) return 'missing'

  if (
    keySignature(named.key) !== expectedKeySignature
    || !hasExpectedOptions(named)
  ) {
    throw new UsersV2IndexMaintenanceError(
      `${usersV2PlatformStatusIndex.name} exists with an unexpected key `
      + 'or options',
    )
  }

  return 'verified'
}

export class MongoUsersV2IndexCatalog implements UsersV2IndexCatalog {
  constructor(private readonly collection: Collection<Document>) {}

  async list(): Promise<unknown[]> {
    return this.collection.listIndexes().toArray()
  }

  async createExpected(): Promise<void> {
    await this.collection.createIndex(
      usersV2PlatformStatusIndex.key,
      { name: usersV2PlatformStatusIndex.name },
    )
  }
}

export class MongoUsersV2IndexConnection
implements UsersV2IndexConnection {
  private readonly client: MongoClient

  constructor(mongoUri: string) {
    this.client = new MongoClient(mongoUri)
  }

  async openCatalog(): Promise<UsersV2IndexCatalog> {
    await this.client.connect()
    return new MongoUsersV2IndexCatalog(
      this.client.db().collection('userproducts'),
    )
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}

export async function ensureUsersV2Index(
  catalog: UsersV2IndexCatalog,
  options: UsersV2IndexMaintenanceOptions,
): Promise<UsersV2IndexMaintenanceResult> {
  const initialState = inspectIndexes(await catalog.list())
  if (initialState === 'verified') {
    return {
      status: 'verified',
      indexName: usersV2PlatformStatusIndex.name,
      mutated: false,
    }
  }

  if (!options.apply) {
    return {
      status: 'missing',
      indexName: usersV2PlatformStatusIndex.name,
      mutated: false,
    }
  }

  await catalog.createExpected()
  const finalState = inspectIndexes(await catalog.list())
  if (finalState !== 'verified') {
    throw new UsersV2IndexMaintenanceError(
      'Users V2 index creation could not be verified',
    )
  }

  return {
    status: 'created',
    indexName: usersV2PlatformStatusIndex.name,
    mutated: true,
  }
}

export async function runUsersV2IndexMaintenance(
  connection: UsersV2IndexConnection,
  options: UsersV2IndexMaintenanceOptions,
): Promise<UsersV2IndexMaintenanceResult> {
  try {
    const catalog = await connection.openCatalog()
    return await ensureUsersV2Index(catalog, options)
  } finally {
    await connection.close()
  }
}

export function readUsersV2IndexCliConfig(
  environment: NodeJS.ProcessEnv,
): UsersV2IndexCliConfig {
  const mongoUri = environment.MONGO_URI?.trim()
  if (mongoUri === undefined || mongoUri.length === 0) {
    throw new UsersV2IndexMaintenanceError(
      'MONGO_URI is required for Users V2 index maintenance',
    )
  }

  const applyValue = environment.USERS_V2_INDEX_APPLY
  if (
    applyValue !== undefined
    && applyValue !== 'true'
    && applyValue !== 'false'
  ) {
    throw new UsersV2IndexMaintenanceError(
      'USERS_V2_INDEX_APPLY must be true or false',
    )
  }

  return {
    mongoUri,
    apply: applyValue === 'true',
  }
}

export async function runUsersV2IndexCli(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<UsersV2IndexMaintenanceResult> {
  const config = readUsersV2IndexCliConfig(environment)
  return runUsersV2IndexMaintenance(
    new MongoUsersV2IndexConnection(config.mongoUri),
    { apply: config.apply },
  )
}

if (require.main === module) {
  void runUsersV2IndexCli()
    .then(result => {
      process.stdout.write(`${JSON.stringify(result)}\n`)
    })
    .catch(error => {
      const message = error instanceof UsersV2IndexMaintenanceError
        ? error.message
        : 'Users V2 index maintenance failed'
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    })
}
