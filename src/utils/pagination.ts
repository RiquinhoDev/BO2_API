const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MIN_LIMIT = 1
const ABSOLUTE_MAX_LIMIT = 200

export interface PaginationInput {
  page?: unknown
  limit?: unknown
}

export interface PaginationOptions {
  defaultLimit?: number
  maxLimit?: number
}

export interface PaginationMetadata {
  page: number
  limit: number
  total: number
  pages: number
}

export interface PaginationResult {
  page: number
  limit: number
  skip: number
  metadata(total: number): PaginationMetadata
}

const toInteger = (value: unknown): number | undefined => {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || value.trim() === '')
  ) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed)
    ? parsed
    : undefined
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

export const paginate = (
  input: PaginationInput,
  options: PaginationOptions = {}
): PaginationResult => {
  const configuredMax = toInteger(options.maxLimit)
  const maxLimit = clamp(
    configuredMax ?? ABSOLUTE_MAX_LIMIT,
    MIN_LIMIT,
    ABSOLUTE_MAX_LIMIT
  )

  const configuredDefault = toInteger(options.defaultLimit)
  const defaultLimit = clamp(
    configuredDefault ?? DEFAULT_LIMIT,
    MIN_LIMIT,
    maxLimit
  )

  const requestedPage = toInteger(input.page)
  const page = Math.max(DEFAULT_PAGE, requestedPage ?? DEFAULT_PAGE)

  const requestedLimit = toInteger(input.limit)
  const limit = clamp(requestedLimit ?? defaultLimit, MIN_LIMIT, maxLimit)
  const skip = (page - 1) * limit

  return {
    page,
    limit,
    skip,
    metadata: (total: number) => ({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    })
  }
}
