export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  mongoUri: string
  jwtSecret: string
  oldApiJwtSecret?: string
  enableDebugRoutes: boolean
  port: number
  redis?: {
    host: string
    port: number
    username: string
    password?: string
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongoUri = env.MONGO_URI?.trim()
  if (!mongoUri) throw new Error('CONFIG_INVÁLIDA: MONGO_URI é obrigatória')

  const jwtSecret = parseStrongSecret(env.JWT_SECRET, 'JWT_SECRET', true)
  const oldApiJwtSecret = parseStrongSecret(env.OLD_API_JWT_SECRET, 'OLD_API_JWT_SECRET', false)
  const nodeEnv = env.NODE_ENV || 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('CONFIG_INVÁLIDA: NODE_ENV deve ser development, test ou production')
  }

  const enableDebugRoutes = parseBooleanFlag(env.ENABLE_DEBUG_ROUTES, 'ENABLE_DEBUG_ROUTES')
  if (nodeEnv === 'production' && enableDebugRoutes) {
    throw new Error('CONFIG_INVÃLIDA: ENABLE_DEBUG_ROUTES Ã© proibida em produÃ§Ã£o')
  }

  const port = parsePort(env.PORT, 3001, 'PORT')
  const redis = parseRedisConfig(env)

  return {
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    mongoUri,
    jwtSecret,
    ...(oldApiJwtSecret ? { oldApiJwtSecret } : {}),
    enableDebugRoutes,
    port,
    ...(redis ? { redis } : {}),
  }
}

function parseBooleanFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value.trim() === '' || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`CONFIG_INVÃLIDA: ${name} deve ser true ou false`)
}

function parseStrongSecret(value: string | undefined, name: string, required: true): string
function parseStrongSecret(
  value: string | undefined,
  name: string,
  required: false,
): string | undefined
function parseStrongSecret(
  value: string | undefined,
  name: string,
  required: boolean,
): string | undefined {
  const secret = value?.trim()
  if (!secret) {
    if (required) throw new Error(`CONFIG_INVÁLIDA: ${name} é obrigatória`)
    return undefined
  }
  if (secret.length < 32) {
    throw new Error(`CONFIG_INVÁLIDA: ${name} deve ter pelo menos 32 caracteres`)
  }
  return secret
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CONFIG_INVÁLIDA: ${name} deve ser uma porta entre 1 e 65535`)
  }
  return port
}

function parseRedisConfig(env: NodeJS.ProcessEnv): AppConfig['redis'] {
  const host = env.REDIS_HOST?.trim()
  const hasOtherRedisConfig = Boolean(env.REDIS_PORT || env.REDIS_USERNAME || env.REDIS_PASSWORD)

  if (!host) {
    if (hasOtherRedisConfig) {
      throw new Error('CONFIG_INVÁLIDA: REDIS_HOST é obrigatória quando Redis é configurado')
    }
    return undefined
  }

  return {
    host,
    port: parsePort(env.REDIS_PORT, 6379, 'REDIS_PORT'),
    username: env.REDIS_USERNAME?.trim() || 'default',
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
  }
}
