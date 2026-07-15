export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  mongoUri: string
  port: number
  redis?: {
    host: string
    port: number
    username: string
    password?: string
  }
}

export function loadConfig(_env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongoUri = _env.MONGO_URI?.trim()
  if (!mongoUri) throw new Error('CONFIG_INVÁLIDA: MONGO_URI é obrigatória')

  const nodeEnv = _env.NODE_ENV || 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('CONFIG_INVÁLIDA: NODE_ENV deve ser development, test ou production')
  }

  const port = parsePort(_env.PORT, 3001, 'PORT')
  const redis = parseRedisConfig(_env)

  return {
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    mongoUri,
    port,
    ...(redis ? { redis } : {}),
  }
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
