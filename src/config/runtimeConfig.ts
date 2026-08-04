import type { AppConfig } from './configTypes'

let activeConfig: Readonly<AppConfig> | undefined

function freezeRecursively<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value

  const objectValue = value as object
  if (seen.has(objectValue)) return value
  seen.add(objectValue)

  for (const child of Object.values(objectValue)) {
    freezeRecursively(child, seen)
  }

  return Object.freeze(value)
}

function valuesEqual(left: unknown, right: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(left, right)) return true
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false
  }

  const previous = seen.get(left)
  if (previous === right) return true
  seen.set(left, right)

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }
    return left.every((item, index) => valuesEqual(item, right[index], seen))
  }

  const leftKeys = Reflect.ownKeys(left)
  const rightKeys = Reflect.ownKeys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    if (!rightKeys.includes(key)) return false
    return valuesEqual(
      (left as Record<PropertyKey, unknown>)[key],
      (right as Record<PropertyKey, unknown>)[key],
      seen,
    )
  })
}

export function initializeRuntimeConfig(config: AppConfig): void {
  if (activeConfig) {
    if (valuesEqual(activeConfig, config)) return
    throw new Error('RUNTIME_CONFIG_ALREADY_INITIALIZED')
  }

  activeConfig = freezeRecursively(config)
}

export function getRuntimeConfig(): Readonly<AppConfig> {
  if (!activeConfig) throw new Error('RUNTIME_CONFIG_NOT_INITIALIZED')
  return activeConfig
}

/** Test-only reset; production bootstrap never resets the singleton. */
export function resetRuntimeConfigForTests(): void {
  activeConfig = undefined
}

export { freezeRecursively }
