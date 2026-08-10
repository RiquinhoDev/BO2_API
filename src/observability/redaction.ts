const SENSITIVE_KEY = /token|password|secret|api[_-]?key|authorization|cookie|headers?|body|payload|email|query/i
const PATH_KEY = /context|path|url|endpoint/i
const PLAIN_EMAIL = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g
const ENCODED_EMAIL = /[\w.+-]+%40[\w.-]+(?:%2e|\.)[A-Za-z]{2,}/gi
const BEARER_TOKEN = /(\bBearer\s+)[^\s,;]+/gi
const NAMED_SECRET = /\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;&]+/gi

const PII_PATHS: ReadonlyArray<[RegExp, string]> = [
  [/(\/users\/by-email\/)(?!:email(?:[/?#]|$))[^/?#]+/gi, '$1[REDACTED]'],
  [/(\/ac\/contact\/)(?!:email(?:[/?#]|$))[^/?#]+(\/tags)/gi, '$1[REDACTED]$2'],
  [/(\/guru\/sync\/email\/)(?!:email(?:[/?#]|$))[^/?#]+/gi, '$1[REDACTED]'],
]

function redactString(value: string, pathLike: boolean): string {
  const withoutQuery = pathLike ? value.split(/[?#]/, 1)[0] : value
  const withoutPiiPaths = PII_PATHS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    withoutQuery,
  )

  return withoutPiiPaths
    .replace(PLAIN_EMAIL, '[REDACTED_EMAIL]')
    .replace(ENCODED_EMAIL, '[REDACTED_EMAIL]')
    .replace(BEARER_TOKEN, '$1[REDACTED]')
    .replace(NAMED_SECRET, '$1=[REDACTED]')
}

function redactValue(
  value: unknown,
  key: string | undefined,
  seen: WeakMap<object, unknown>,
): unknown {
  if (typeof value === 'string') return redactString(value, Boolean(key && PATH_KEY.test(key)))
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value

  if (value instanceof Error) {
    const result: Record<string, unknown> = {
      name: redactString(value.name, false),
      message: redactString(value.message, false),
    }
    seen.set(value, result)
    if (value.stack) result.stack = redactString(value.stack, false)
    return result
  }

  const existing = seen.get(value)
  if (existing) return existing

  if (Array.isArray(value)) {
    const result: unknown[] = []
    seen.set(value, result)
    value.forEach((item) => result.push(redactValue(item, undefined, seen)))
    return result
  }

  const result: Record<string, unknown> = {}
  seen.set(value, result)
  Object.entries(value).forEach(([entryKey, entryValue]) => {
    if (SENSITIVE_KEY.test(entryKey)) return
    result[entryKey] = redactValue(entryValue, entryKey, seen)
  })
  return result
}

/** Sanitizes a clone of data before it crosses an observability boundary. */
export function redactSensitiveData<T>(value: T): T {
  return redactValue(value, undefined, new WeakMap()) as T
}
