import mongoose from 'mongoose'
import { SyncType } from '../../models/SyncModels/CronJobConfig'
import type { ICondition, RuleCategory } from '../../models/acTags/TagRule'

export type JobIdParams = {
  id: string
}

export type LegacyCronConfig = {
  name: string
  cronExpression: string
  isActive: boolean
  nextRun?: Date
  lastRun?: Date
}

export type SystemJob = {
  source: 'legacy-tag-cron'
  name: string
  description: string
  cronExpression: string
  isActive: boolean
  scheduledAtRuntime: false
  nextRun: Date | null
  lastRun: Date | null
}

export type PopulatedCourse = {
  _id: mongoose.Types.ObjectId
  name: string
  code: string
}

export type PopulatedTagRule = {
  _id: mongoose.Types.ObjectId
  name: string
  description?: string
  category: RuleCategory
  priority: number
  conditions?: ICondition[]
  actions?: {
    addTag?: string
  }
  isActive: boolean
  courseId?: PopulatedCourse | null
}

export type TagRuleSummary = {
  _id: mongoose.Types.ObjectId
  name: string
  tagName: string
  description: string
  category: RuleCategory
  priority: number
  course: PopulatedCourse
  conditions: ICondition[]
  estimatedStudents: number
  isActive: boolean
}

export type CourseRuleGroup = {
  courseName: string
  courseId: string
  courseCode: string
  platform: SyncType
  rules: TagRuleSummary[]
  totalRules: number
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
