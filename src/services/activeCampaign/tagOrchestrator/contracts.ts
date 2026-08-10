import nativeTagProtection from '../nativeTagProtection.service'

export function isBOTag(tagName: string): boolean {
  return nativeTagProtection.isBOTag(tagName)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export interface TagOperation {
  userId: string
  productId: string
  tag: string
  action: 'APPLY' | 'REMOVE'
  reason?: string
}

export interface OrchestrationResult {
  userId: string
  productId: string
  productCode: string
  tagsApplied: string[]
  tagsRemoved: string[]
  communicationsTriggered: number
  success: boolean
  error?: string
}

export interface ExecutionStats {
  total: number
  successful: number
  failed: number
  successRate: string
  appliedTotal: number
  removedTotal: number
  byProduct: Record<string, number>
}

export type OrchestrationContext = {
  productCode: string
  lastActivity: Date | null
  daysInactive: number | null
}