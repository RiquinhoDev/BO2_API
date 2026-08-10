import type { HotmartLesson, HotmartUser, ProgressData } from './transport'
import { calculateModuleProgress } from './modules'

export const calculateProgress = (
  lessons: HotmartLesson[]
): ProgressData => {
  if (lessons.length === 0) {
    return {
      completedPercentage: 0,
      total: 0,
      completed: 0,
      lessons: [],
      lastUpdated: new Date()
    }
  }

  const completed = lessons.filter(lesson => lesson.is_completed).length
  const total = lessons.length
  const completedPercentage = Math.round((completed / total) * 100)

  // ✅ NOVO: Calcular módulos DIRETAMENTE DAS LIÇÕES (sem endpoint /modules)
  const modulesList = calculateModuleProgress(lessons)
  const totalModules = modulesList.length
  const modulesCompleted = modulesList.filter(m => m.isCompleted).map(m => m.moduleId)

  // Encontrar primeiro módulo incompleto (ou último se todos completos)
  const firstIncomplete = modulesList.find(m => !m.isCompleted)
  const currentModule = firstIncomplete?.sequence || modulesList[modulesList.length - 1]?.sequence

  return {
    completedPercentage,
    total,
    completed,
    lessons: lessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    })),
    modulesList,
    totalModules,
    modulesCompleted,
    currentModule,
    lastUpdated: new Date()
  }
}

/**
 * Converter timestamp Unix para Date (com validação)
 * @param {any} timestamp - Timestamp em diversos formatos
 * @returns {Date | null} Data válida ou null
 */
export const convertUnixTimestamp = (timestamp: any): Date | null => {
  if (!timestamp) return null

  // ISO string
  if (typeof timestamp === 'string' && timestamp.includes('T') && timestamp.includes('Z')) {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      if (year >= 2000 && year <= 2030) {
        return date
      }
    }
    return null
  }

  // Unix timestamp
  const numTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
  if (isNaN(numTimestamp) || numTimestamp <= 0) return null

  // Converter para milliseconds se necessário
  const timestampMs = numTimestamp < 1e12 ? numTimestamp * 1000 : numTimestamp
  const date = new Date(timestampMs)

  // Validar ano
  const year = date.getFullYear()
  if (year < 2000 || year > 2030) {
    console.warn(`⚠️ Data suspeita: ${date.toISOString()} (timestamp: ${timestamp})`)
    return null
  }

  return date
}

// ═══════════════════════════════════════════════════════════
// ENGAGEMENT — normalizar para PT na RECEPÇÃO
// A Hotmart devolve EN (HIGH/MEDIUM/LOW); o público e todo o sistema é PT.
// Apanhamos aqui e alimentamos tudo o resto com o enum PT.
// ═══════════════════════════════════════════════════════════
const ENGAGEMENT_EN_TO_PT: Record<string, string> = {
  HIGH: 'ALTO',
  MEDIUM: 'MEDIO',
  LOW: 'BAIXO'
}
const ENGAGEMENT_PT_VALID = new Set(['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO', 'NONE'])

/** EN (ou já PT) → enum PT. Idempotente; desconhecido → 'NONE'. */
export const normalizeEngagementLevel = (raw?: string | null): string => {
  if (!raw) return 'NONE'
  const up = String(raw).trim().toUpperCase()
  if (ENGAGEMENT_PT_VALID.has(up)) return up
  return ENGAGEMENT_EN_TO_PT[up] || 'NONE'
}

/**
 * Normalizar dados do utilizador Hotmart para formato Universal
 * @param {HotmartUser} hotmartUser - Dados brutos da API
 * @param {ProgressData} progressData - Dados de progresso (opcional)
 * @returns {object} Dados normalizados para Universal Sync
 */
export const normalizeHotmartUser = (
  hotmartUser: HotmartUser,
  progressData?: ProgressData
) => {
  const hotmartId = hotmartUser.id || hotmartUser.user_id || hotmartUser.uid || hotmartUser.code

  return {
    // Identificação
    email: hotmartUser.email.toLowerCase().trim(),
    name: hotmartUser.name.trim(),
    hotmartUserId: hotmartId,

    // Datas
    purchaseDate: convertUnixTimestamp(hotmartUser.purchase_date),
    signupDate: convertUnixTimestamp(hotmartUser.signup_date) || null,  // ✅ null se não vier da API
    firstAccessDate: convertUnixTimestamp(hotmartUser.first_access_date),
    lastAccessDate: convertUnixTimestamp(hotmartUser.last_access_date),

    // Status
    plusAccess: hotmartUser.plus_access || 'WITHOUT_PLUS_ACCESS',

    // Turmas
    classId: hotmartUser.class_id,
    className: hotmartUser.class_name || (hotmartUser.class_id ? `Turma ${hotmartUser.class_id}` : undefined),

    // Engagement
    accessCount: Number(hotmartUser.access_count) || 0,
    engagementLevel: normalizeEngagementLevel(hotmartUser.engagement),

    // ✅ NOVOS CAMPOS DA API HOTMART
    status: hotmartUser.status || null,
    role: hotmartUser.role || null,
    type: hotmartUser.type || null,
    locale: hotmartUser.locale || null,
    isDeletable: hotmartUser.is_deletable !== undefined ? hotmartUser.is_deletable : null,

    // Progresso (se disponível)
    progress: progressData ? {
      completedPercentage: progressData.completedPercentage,
      total: progressData.total,
      completed: progressData.completed,
      lessons: progressData.lessons,
      modulesList: progressData.modulesList,
      totalModules: progressData.totalModules,
      modulesCompleted: progressData.modulesCompleted,
      currentModule: progressData.currentModule,
      lastUpdated: progressData.lastUpdated
    } : undefined
  }
}

/**
 * Validar dados mínimos do utilizador
 * @param {HotmartUser} user - Dados do utilizador
 * @returns {boolean} true se válido
 * @throws {Error} Se dados inválidos
 */
export const validateHotmartUser = (user: HotmartUser): boolean => {
  if (!user.email || !user.email.trim()) {
    throw new Error('Email inválido')
  }
  
  if (!user.name || !user.name.trim()) {
    throw new Error('Nome inválido')
  }
  
  const hotmartId = user.id || user.user_id || user.uid || user.code
  if (!hotmartId) {
    throw new Error('ID Hotmart inválido')
  }
  
  return true
}

// ═══════════════════════════════════════════════════════════
// MÓDULOS DO HOTMART CLUB
// ═══════════════════════════════════════════════════════════

/**
 * Buscar módulos de um curso
 * @param {string} accessToken - Token de autenticação
 * @param {string} subdomain - Subdomínio do curso (ex: 'ogi-v1')
 * @returns {Promise<HotmartModule[]>} Lista de módulos do curso
 */
