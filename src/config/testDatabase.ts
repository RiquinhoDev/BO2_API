const BLOCKED_MESSAGE = 'BLOQUEADO: Mongo de teste inseguro'

function blockedDatabaseError(reason: string): Error {
  return new Error(`${BLOCKED_MESSAGE} — ${reason}`)
}

export function assertSafeTestMongoUri(uri: string | undefined): string {
  if (!uri?.trim()) {
    throw blockedDatabaseError('MONGO_URI_TEST é obrigatória; MONGO_URI nunca é fallback')
  }

  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw blockedDatabaseError('MONGO_URI_TEST é inválida')
  }

  const databaseName = parsed.pathname.replace(/^\//, '').split('/')[0]
  const safeProtocol = parsed.protocol === 'mongodb:'
  const safeHost = parsed.hostname === '127.0.0.1'
  const safeDatabase = databaseName.endsWith('_test')

  if (!safeProtocol || !safeHost || !safeDatabase) {
    throw blockedDatabaseError('exigido mongodb://127.0.0.1/<nome>_test ou Mongo efémero equivalente')
  }

  return uri
}

export function getRequiredTestMongoUri(env: NodeJS.ProcessEnv = process.env): string {
  return assertSafeTestMongoUri(env.MONGO_URI_TEST)
}
