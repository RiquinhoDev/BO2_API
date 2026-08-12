export type ApplicationResponseFamily = 'success-data'

export type ResponseFamily =
  | ApplicationResponseFamily
  | 'public-document'
  | 'redirect'
  | 'stream-or-file'
  | 'no-content'

export const RESPONSE_FAMILIES: readonly ResponseFamily[] = [
  'success-data',
  'public-document',
  'redirect',
  'stream-or-file',
  'no-content',
]

export interface SuccessResponse<
  T,
  M extends Record<string, unknown> | undefined = undefined,
> {
  success: true
  data: T
  meta?: M
}

export function successResponse<
  T,
  M extends Record<string, unknown> | undefined = undefined,
>(data: T, meta?: M): SuccessResponse<T, M> {
  return meta === undefined ? { success: true, data } : { success: true, data, meta }
}

export interface OperationalSuccessPayload {
  completed: boolean
  message?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export function operationalSuccessResponse(payload: OperationalSuccessPayload) {
  const { message, data, ...rest } = payload
  return successResponse(
    { ...rest, ...(data ?? {}) },
    message === undefined ? undefined : { message },
  )
}

export interface ResponseContractDecision {
  method: string
  path: string
  family: ResponseFamily
  shapeKeys: readonly string[]
  evidence: string
  frontConsumer: string | null
}