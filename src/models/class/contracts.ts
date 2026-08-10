import type { IClassHistory } from './ClassHistory'

// ===== TIPOS E INTERFACES AUXILIARES =====

export interface ClassFilters {
  search?: string
  isActive?: boolean
  source?: string
  limit: number
  offset: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface ClassStats {
  totalClasses: number
  totalStudents: number
  activeClasses: number
  inactiveClasses: number
  recentMovements: number
  sourceBreakdown: {
    hotmart_sync: number
    manual: number
    import: number
    curseduca_sync: number  // 🆕
  }
  studentDistribution: {
    classId: string
    className: string
    studentCount: number
  }[]
}

export interface StudentMovement {
  studentId: string
  fromClassId?: string
  toClassId: string
  reason?: string
  performedBy?: string
}

export interface MovementResult {
  success: boolean
  studentId: string
  message: string
  movement?: IClassHistory
  error?: string
}

export interface SearchCriteria {
  email?: string
  name?: string
  discordId?: string
  classId?: string
  status?: string
  minProgress?: number
  maxProgress?: number
  minEngagement?: number
  maxEngagement?: number
}

// ===== FUNÇÕES AUXILIARES =====

/**
 * Valida o ID de uma turma
 * Aceita: letras, números, hífens, underscores e UUIDs
 */
export function validateClassId(classId: string): boolean {
  if (!classId || typeof classId !== 'string') {
    return false
  }
  
  // Aceitar UUIDs (para CursEduca) e classIds normais (Hotmart)
  // UUID: 8-4-4-4-12 caracteres hexadecimais separados por hífens
  // ClassId normal: letras, números, hífens e underscores
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const classIdRegex = /^[a-zA-Z0-9_-]+$/
  
  return uuidRegex.test(classId) || classIdRegex.test(classId)
}

/**
 * Normaliza o nome de uma turma
 * Remove espaços extras e capitaliza adequadamente
 */
export function normalizeClassName(name: string): string {
  if (!name || typeof name !== 'string') {
    return ''
  }
  
  // Remover espaços extras e trim
  return name.trim().replace(/\s+/g, ' ')
}
