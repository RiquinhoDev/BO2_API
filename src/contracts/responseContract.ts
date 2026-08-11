export type ResponseFamily =
  | 'success-data'
  | 'domain-envelope'
  | 'raw-json'
  | 'no-content'
  | 'redirect'
  | 'stream-or-file'

export const RESPONSE_FAMILIES: readonly ResponseFamily[] = [
  'success-data',
  'domain-envelope',
  'raw-json',
  'no-content',
  'redirect',
  'stream-or-file',
]

export interface SuccessResponse<T> {
  success: true
  data: T
}

export function successResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data }
}

export interface ResponseContractDecision {
  method: string
  path: string
  family: ResponseFamily
  shapeKeys: readonly string[]
  evidence: string
  frontConsumer: string | null
}
