import type { IntegrationConfig } from './configTypes'

export interface BoundedIntegerOptions {
  readonly min?: number
  readonly max?: number
  readonly defaultValue?: number
}

export const DEFAULT_LOG_DIRECTORY = 'logs'
export const LOG_LEVELS = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])

export function parseBooleanFlag(
  value: string | undefined,
  name: string,
  fallback = false,
): boolean {
  if (value === undefined) return fallback

  const normalized = value.trim()
  if (normalized === 'false') return false
  if (normalized === 'true') return true

  throw new Error(`CONFIG_INVÁLIDA: ${name} deve ser true ou false`)
}

export function parseBoundedInteger(
  value: string | undefined,
  name: string,
  options: BoundedIntegerOptions = {},
): number {
  const min = options.min ?? Number.MIN_SAFE_INTEGER
  const max = options.max ?? Number.MAX_SAFE_INTEGER

  if (value === undefined) {
    if (options.defaultValue !== undefined) return options.defaultValue
    throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)
  }

  const normalized = value.trim()
  const parsed = Number(normalized)
  if (
    normalized === '' ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(`CONFIG_INVALIDA: ${name} deve ser um inteiro entre ${min} e ${max}`)
  }

  return parsed
}

export function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`CONFIG_INVÁLIDA: ${name} deve ser uma porta entre 1 e 65535`)
  }
  return port
}

export function parseOptionalUrl(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined

  const normalized = value.trim()
  if (!normalized) throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)

  try {
    const parsed = new URL(normalized)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('unsupported URL')
    }
    return parsed.toString()
  } catch {
    throw new Error(`CONFIG_INVALIDA: ${name} deve ser um URL HTTP(S) valido`)
  }
}

export function parseRequiredUrl(value: string | undefined, name: string): string {
  const parsed = parseOptionalUrl(value, name)
  if (!parsed) throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)
  return parsed
}

export function parseStrongSecret(value: string | undefined, name: string, required: true): string
export function parseStrongSecret(
  value: string | undefined,
  name: string,
  required: false,
): string | undefined
export function parseStrongSecret(
  value: string | undefined,
  name: string,
  required = true,
): string | undefined {
  if (value === undefined) {
    if (required) throw new Error(`CONFIG_INVÁLIDA: ${name} é obrigatória`)
    return undefined
  }

  const secret = value.trim()
  if (!secret) throw new Error(`CONFIG_INVÁLIDA: ${name} é obrigatória`)
  if (secret.length < 32) {
    throw new Error(`CONFIG_INVÁLIDA: ${name} deve ter pelo menos 32 caracteres`)
  }
  return secret
}

export function readOptionalString(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]
  if (value === undefined) return undefined

  const normalized = value.trim()
  if (!normalized) throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)
  return normalized
}

export function hasAnyValue(env: NodeJS.ProcessEnv, names: readonly string[]): boolean {
  return names.some((name) => env[name] !== undefined)
}

export function configuredCredentialGroup<T extends object>(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  build: (values: Record<string, string>) => T,
): IntegrationConfig<T> {
  if (!hasAnyValue(env, names)) return { configured: false }

  const values: Record<string, string> = {}
  const missing: string[] = []
  for (const name of names) {
    const value = env[name]
    if (value === undefined || !value.trim()) {
      missing.push(name)
    } else {
      values[name] = value.trim()
    }
  }

  if (missing.length > 0) {
    throw new Error(`CONFIG_INVALIDA: credenciais incompletas (${missing.join(', ')})`)
  }

  return { configured: true, value: build(values) }
}
