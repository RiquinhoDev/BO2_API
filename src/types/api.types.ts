import { IClass } from "../models/Class"
import { IStudentClassHistory } from "../models/StudentClassHistory"
import { IUser } from "../models/user"

// src/types/api.types.ts - Tipos para a API
export interface SearchStudentQuery {
    email?: string
    name?: string
    discordId?: string
  }
  
  export interface SearchStudentResponse {
    message?: string
    students?: IUser[]
    multiple?: boolean
  }
  
  export interface UpdateStudentData {
    name?: string
    email?: string
    discordIds?: string[]
    classId?: string
    status?: 'ACTIVE' | 'BLOCKED' | 'BLOCKED_BY_OWNER' | 'OVERDUE'
    role?: 'STUDENT' | 'FREE_STUDENT' | 'OWNER' | 'ADMIN' | 'CONTENT_EDITOR' | 'MODERATOR'
    tags?: string[]
    notes?: string
    priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  }
  
  export interface StudentStats {
    hasEmail: boolean
    hasName: boolean
    hasDiscordIds: boolean
    totalDiscordIds: number
    isActive: boolean
    hasProgress: boolean
    progressPercentage: number
    hasPurchaseDate: boolean
    hasLastAccess: boolean
    daysSincePurchase: number | null
    daysSinceLastAccess: number | null
    hasClass: boolean
    classId?: string
    validationStatus: {
      email: boolean
      discordIds: boolean
      name: boolean
    }
  }
  
  export interface StudentHistoryResponse {
    email: string
    classHistory: IStudentClassHistory[]
    syncHistory: any[]
    totalHistoryItems: number
  }
  
  export interface ClassStatsResponse {
    totalStudents: number
    activeStudents: number
    blockedStudents: number
    averageProgress: number
    studentsWithProgress: number
    lastUpdate: Date
  }
  
  export interface ClassWithStats extends IClass {
    stats?: ClassStatsResponse
  }
  
  export interface MoveStudentRequest {
    studentId: string
    fromClassId?: string
    toClassId: string
    reason?: string
  }
  
  export interface MoveMultipleStudentsRequest {
    studentIds: string[]
    toClassId: string
    reason?: string
  }
  
  export interface MoveStudentResponse {
    message: string
    student?: {
      id: string
      name: string
      email: string
      fromClass: string
      toClass: string
      movedAt: Date
    }
    results?: {
      success: Array<{
        studentId: string
        name: string
        email: string
      }>
      errors: Array<{
        studentId: string
        error: string
      }>
      total: number
    }
  }