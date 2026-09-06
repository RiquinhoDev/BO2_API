import mongoose from 'mongoose'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'

export interface WeeklyTagSnapshotOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
}

export interface EmailSelection {
  emails: string[]
  truncated: boolean
  remaining: number
}

export interface CleanupResult {
  deleted: number
  candidates: number
  skipped: number
  truncated: boolean
  remaining: number
}

export interface SnapshotData {
  email: string
  userId: mongoose.Types.ObjectId
  nativeTags: string[]
  capturedAt: Date
  weekNumber: number
  year: number
}

export function assertOwnership(options: WeeklyTagSnapshotOptions): void {
  options.phaseHooks?.assertOwnership?.()
}

export function isOwnershipFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError'
}

export function uniqueEmails(values: readonly (string | undefined)[]): string[] {
  const emails = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const email = value.trim().toLowerCase()
    if (email) emails.add(email)
  }
  return [...emails]
}
