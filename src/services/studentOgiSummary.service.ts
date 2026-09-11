import mongoose from 'mongoose'
import Product from '../models/product/Product'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import CourseLesson from '../models/CourseLesson'
import { ACHIEVEMENT_DEFINITIONS } from './achievements/achievementDefinitions'
import { evaluateAndPersistAchievements } from './achievements/achievementEvaluation.service'
import { recordDailyActivity } from './achievements/streakCalculator'
import { findRenewalOffer } from './renewal/renewalMatcher.service'
import { buildCheckoutLink } from './renewal/renewalSync.service'
import { GENERIC_RENEWAL_OFFER_CODE } from './renewal/renewalConstants'
import { parseTurmaName } from './renewal/turmaParser'
import { getActiveHotmartClassName, normalizeStudentEmail, resolveStudentAccessEnd } from './studentOgiSummary/access'

export {
  getStudentAccess,
  isValidSummaryAccessToken,
  normalizeStudentEmail,
  resolveStudentEmailFromToken
} from './studentOgiSummary/access'
export type { StudentAccessResult } from './studentOgiSummary/access'

type MongooseReadModel = mongoose.Model<mongoose.Document>
type StudentSummarySource = 'userProduct' | 'legacyHotmart' | 'none'

const ProductReadModel = Product as unknown as MongooseReadModel
const UserProductReadModel = UserProduct as unknown as MongooseReadModel
const CourseLessonReadModel = CourseLesson as unknown as MongooseReadModel

interface OgiModuleSummary {
  id: string
  name: string
  sequence: number
  totalLessons: number
  completedLessons: number
  percentage: number
  completed: boolean
}

type ContinueLessonStatus = 'next' | 'resume' | 'start' | 'completed'

interface OgiContinueLesson {
  pageId: string
  pageName: string
  moduleName: string
  url: string
  status: ContinueLessonStatus
}

export interface StudentOgiSummary {
  hasData: boolean
  student: {
    name: string
    email: string
  }
  access: {
    status: string
    enrolledAt?: Date
    purchaseDate?: Date
    expiresAt?: Date
    renewalUrl?: string | null
    turmaNumber?: number | null
  }
  progress: {
    percentage: number
    completedLessons: number
    totalLessons: number
    currentModule?: OgiModuleSummary
    nextModule?: OgiModuleSummary
    continueLesson?: OgiContinueLesson
    lastActivity?: Date
    modules: OgiModuleSummary[]
  }
  sync: {
    source: StudentSummarySource
    lastSyncAt?: Date
  }
  achievements?: {
    items: Array<{
      id: string
      name: string
      description: string
      category: string
      isUnlocked: boolean
      unlockedAt: string | null
      isNew: boolean
      progress?: { current: number; target: number }
    }>
    stats: {
      total: number
      unlocked: number
      percentage: number
      currentStreak: number
      bestStreak: number
    }
  }
}

interface LegacyHotmartData {
  purchaseDate?: Date
  signupDate?: Date
  lastAccessDate?: Date
  enrolledClasses?: Array<{
    classId: string
    className: string
    isActive: boolean
    enrolledAt?: Date
  }>
  progress?: {
    completedLessons: number
    lessonsData?: Array<{
      lessonId: string
      title: string
      completed: boolean
      completedAt?: Date
    }>
    lastAccessDate?: Date
  }
  lastSyncAt?: Date
}

interface LegacyCombinedData {
  totalProgress?: number
  totalLessons?: number
  lastActivity?: Date
}

interface StudentLean {
  _id: mongoose.Types.ObjectId
  name?: string
  email: string
  hotmart?: LegacyHotmartData
  combined?: LegacyCombinedData
  inactivation?: {
    isManuallyInactivated?: boolean
    reason?: string
  }
}

interface AchievementEntry {
  id: string
  unlockedAt: Date | null
  seenAt?: Date | null
  progress?: { current: number; target: number }
}

interface AchievementStats {
  total: number
  unlocked: number
  percentage: number
  currentStreak: number
  bestStreak: number
  lastEvaluatedAt: Date
}

type StudentWithAchievements = StudentLean & {
  achievements?: AchievementEntry[]
  achievementStats?: AchievementStats
  toObject?: () => StudentWithAchievements
}

interface ProductLean {
  _id: mongoose.Types.ObjectId
  code?: string
  name?: string
}

interface UserProductModuleLean {
  moduleId?: string
  name?: string
  sequence?: number
  totalPages?: number
  completedPages?: number
  isCompleted?: boolean
  progressPercentage?: number
}

interface UserProductLean {
  status?: string
  enrolledAt?: Date
  updatedAt?: Date
  progress?: {
    percentage?: number
    completed?: number
    total?: number
    lessonsCompleted?: string[]
    lastActivity?: Date
    modulesList?: UserProductModuleLean[]
    // % oficial do Hotmart Club (cron HotmartOgiProgressRefresh, /users?email=).
    // Fonte preferida — bate exactamente com o que o aluno vê dentro do Hotmart.
    hotmartPercentage?: number
    hotmartCompleted?: number
    hotmartTotal?: number
    hotmartRefreshedAt?: Date
  }
  engagement?: {
    lastLogin?: Date
  }
  metadata?: {
    purchaseDate?: Date
  }
}

interface CourseLessonLean {
  pageId: string
  pageName: string
  moduleName: string
  moduleSequence: number
  lessonSequence: number
  url?: string
}

export async function getStudentOgiSummary(email: string): Promise<StudentOgiSummary | null> {
  const normalizedEmail = normalizeStudentEmail(email)
  const user = await User.findOne({ email: normalizedEmail })
    .select('name email hotmart curseduca discord combined engagement inactivation achievements achievementStats')
    .exec() as StudentWithAchievements | null

  if (!user) return null

  const streakUpdate = await recordDailyActivity(user)

  await evaluateAndPersistAchievements(user, {
    force: streakUpdate.changed,
    staleMs: 12 * 60 * 60 * 1000,
    backfillUnlockedAsSeen: true
  })

  const ogiProduct = await findOgiProduct()
  const userProduct = await findOgiUserProduct(user._id, ogiProduct?._id)

  return buildStudentOgiSummary(typeof user.toObject === 'function' ? user.toObject() : user, userProduct)
}

async function findOgiProduct(): Promise<ProductLean | null> {
  return ProductReadModel.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [
      { code: /^OGI/i },
      { courseCode: /^OGI/i },
      { name: /Grande Investimento/i }
    ]
  })
    .select('_id code name')
    .lean()
    .exec() as Promise<ProductLean | null>
}

async function findOgiUserProduct(
  userId: mongoose.Types.ObjectId,
  productId?: mongoose.Types.ObjectId
): Promise<UserProductLean | null> {
  const query: Record<string, unknown> = {
    userId,
    platform: 'hotmart'
  }

  if (productId) {
    query.productId = productId
  }

  return UserProductReadModel.findOne(query)
    .sort({ updatedAt: -1 })
    .select('status enrolledAt progress engagement metadata.purchaseDate updatedAt')
    .lean()
    .exec() as Promise<UserProductLean | null>
}

async function buildStudentOgiSummary(
  user: StudentWithAchievements,
  userProduct: UserProductLean | null
): Promise<StudentOgiSummary> {
  const modules = buildModuleSummaries(userProduct)
  const source = getSummarySource(user, userProduct)
  const totalLessons = getTotalLessons(user, userProduct, modules)
  const completedLessons = getCompletedLessons(user, userProduct)
  const percentage = getProgressPercentage(user, userProduct, completedLessons, totalLessons)
  const purchaseDate = userProduct?.metadata?.purchaseDate || user.hotmart?.purchaseDate
  const enrolledAt = userProduct?.enrolledAt || user.hotmart?.signupDate
  const continueLesson = await buildContinueLesson(user, userProduct)
  const activeClassName = getActiveHotmartClassName(user)
  const parsedTurma = activeClassName ? parseTurmaName(activeClassName) : null
  const fallbackExpiresAt = calculateExpirationDate(purchaseDate || enrolledAt)
  const expiresAt = await resolveStudentAccessEnd(user.email, purchaseDate || enrolledAt, activeClassName)
    || fallbackExpiresAt
  // Link de renovação: "Turma 1 ..." / "Turma 2 ..." (singular) na turma actual
  // OU alguma vez no histórico → oferta própria dessa turma (a identidade é
  // permanente, sobrevive ao balde genérico entre ciclos). Tudo o resto,
  // incluindo turmas fundidas "Turmas ...", recebe a genérica.
  const renewalOffer = await findRenewalOffer(activeClassName, user._id)

  const achievementsData = buildAchievementsResponse(user.achievements, user.achievementStats)

  return {
    hasData: source !== 'none',
    student: {
      name: user.name || user.email,
      email: user.email
    },
    access: {
      status: userProduct?.status || (user.hotmart ? 'ACTIVE' : 'UNKNOWN'),
      enrolledAt,
      purchaseDate,
      expiresAt,
      renewalUrl: renewalOffer?.link || buildCheckoutLink(GENERIC_RENEWAL_OFFER_CODE),
      turmaNumber: parsedTurma?.turmaNumber ?? null
    },
    progress: {
      percentage,
      completedLessons,
      totalLessons,
      currentModule: findCurrentModule(modules),
      nextModule: findNextModule(modules),
      continueLesson,
      lastActivity: getLastActivity(user, userProduct),
      modules
    },
    sync: {
      source,
      lastSyncAt: userProduct?.updatedAt || user.hotmart?.lastSyncAt
    },
    achievements: achievementsData,
  }
}

async function buildContinueLesson(
  user: StudentWithAchievements,
  userProduct: UserProductLean | null
): Promise<OgiContinueLesson | undefined> {
  // Catálogo do curso (courselessons): dá o url e o nome do módulo por pageId.
  // É opcional — só enriquece. A posição do aluno vem do lessonsData dele.
  const catalog = await CourseLessonReadModel.find({
    isActive: true,
    courseCode: /^OGI/i
  })
    .sort({ moduleSequence: 1, lessonSequence: 1 })
    .select('pageId pageName moduleName moduleSequence lessonSequence url')
    .lean()
    .exec() as unknown as CourseLessonLean[]

  const meta = new Map<string, { url?: string; moduleName?: string }>(
    catalog.map((l) => [l.pageId, { url: l.url, moduleName: l.moduleName }])
  )

  // ── Fonte primária: user.hotmart.progress.lessonsData ──────────────────
  // Lista das lições do aluno, com "completado" e a DATA de conclusão por
  // lição. NOTA: este array NÃO está garantidamente em ordem de curso — por
  // isso só o usamos para achar a ÚLTIMA lição concluída (por data). A lição
  // "seguinte" só é fiável com o catálogo courselessons (que tem a ordem real).
  const lessonsData = user.hotmart?.progress?.lessonsData || []
  if (lessonsData.length > 0) {
    const toContinue = (
      entry: { lessonId: string; title: string },
      status: ContinueLessonStatus
    ): OgiContinueLesson => {
      const m = meta.get(entry.lessonId)
      return {
        pageId: entry.lessonId,
        pageName: entry.title,
        moduleName: m?.moduleName || '',
        url: m?.url || '',
        status
      }
    }

    const completedCount = lessonsData.filter((l) => l.completed).length
    if (completedCount === 0) {
      return toContinue(catalog[0] ? { lessonId: catalog[0].pageId, title: catalog[0].pageName } : lessonsData[0], 'start')
    }
    if (completedCount === lessonsData.length) {
      return toContinue(lessonsData[lessonsData.length - 1], 'completed')
    }

    // última lição concluída, pela DATA de conclusão = onde o aluno parou
    let lastCompleted = lessonsData.find((l) => l.completed)!
    let bestTime = lastCompleted.completedAt ? new Date(lastCompleted.completedAt).getTime() : -Infinity
    for (const l of lessonsData) {
      if (!l.completed || !l.completedAt) continue
      const t = new Date(l.completedAt).getTime()
      if (Number.isFinite(t) && t >= bestTime) { bestTime = t; lastCompleted = l }
    }

    // Se o catálogo courselessons existe, sabemos a ordem real → dar a PRÓXIMA.
    if (catalog.length > 0) {
      const catIndex = catalog.findIndex((c) => c.pageId === lastCompleted.lessonId)
      if (catIndex >= 0 && catIndex + 1 < catalog.length) {
        return toContinueLesson(catalog[catIndex + 1], 'next')
      }
      if (catIndex === catalog.length - 1) {
        return toContinueLesson(catalog[catalog.length - 1], 'resume')
      }
    }

    // Sem catálogo: mostra a última lição concluída (o aluno retoma o curso daí).
    return toContinue(lastCompleted, 'resume')
  }

  // ── Fallback: userProduct.progress.lessonsCompleted + catálogo ──────────
  if (catalog.length === 0) return undefined

  const completedPageIds = new Set(userProduct?.progress?.lessonsCompleted || [])
  if (completedPageIds.size === 0) return toContinueLesson(catalog[0], 'start')

  let furthestCompletedIndex = -1
  catalog.forEach((lesson, index) => {
    if (completedPageIds.has(lesson.pageId)) furthestCompletedIndex = index
  })

  const nextIndex = furthestCompletedIndex + 1
  if (nextIndex < catalog.length) return toContinueLesson(catalog[nextIndex], 'next')
  return toContinueLesson(catalog[catalog.length - 1], 'resume')
}

function toContinueLesson(
  lesson: CourseLessonLean,
  status: ContinueLessonStatus
): OgiContinueLesson {
  return {
    pageId: lesson.pageId,
    pageName: lesson.pageName,
    moduleName: lesson.moduleName,
    url: lesson.url || '',
    status
  }
}

function buildAchievementsResponse(
  achievements?: AchievementEntry[],
  stats?: AchievementStats
): StudentOgiSummary['achievements'] {
  if (!achievements || achievements.length === 0) return undefined

  const defMap = new Map(ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d]))

  const items = achievements.map((achievement) => {
    const def = defMap.get(achievement.id)
    return {
      id: achievement.id,
      name: def?.name || achievement.id,
      description: def?.description || '',
      category: def?.category || 'marcos',
      isUnlocked: Boolean(achievement.unlockedAt),
      unlockedAt: achievement.unlockedAt ? new Date(achievement.unlockedAt).toISOString() : null,
      isNew: Boolean(achievement.unlockedAt && !achievement.seenAt),
      progress: achievement.progress || undefined,
    }
  })

  return {
    items,
    stats: {
      total: stats?.total || ACHIEVEMENT_DEFINITIONS.length,
      unlocked: stats?.unlocked || 0,
      percentage: stats?.percentage || 0,
      currentStreak: stats?.currentStreak || 0,
      bestStreak: stats?.bestStreak || 0,
    },
  }
}

function buildModuleSummaries(userProduct: UserProductLean | null): OgiModuleSummary[] {
  return [...(userProduct?.progress?.modulesList || [])]
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((moduleItem, index) => ({
      id: moduleItem.moduleId || `module-${index + 1}`,
      name: moduleItem.name || `Modulo ${index + 1}`,
      sequence: moduleItem.sequence || index + 1,
      totalLessons: moduleItem.totalPages || 0,
      completedLessons: moduleItem.completedPages || 0,
      percentage: clampPercentage(moduleItem.progressPercentage || 0),
      completed: Boolean(moduleItem.isCompleted)
    }))
}

function getSummarySource(user: StudentLean, userProduct: UserProductLean | null): StudentSummarySource {
  if (userProduct) return 'userProduct'
  if (user.hotmart) return 'legacyHotmart'
  return 'none'
}

function getTotalLessons(
  user: StudentLean,
  userProduct: UserProductLean | null,
  modules: OgiModuleSummary[]
): number {
  // Só fontes OGI/Hotmart — sem user.combined.* (mistura de plataformas).
  // Preferir o total oficial do Hotmart Club (cron) quando existir.
  const hotmartTotal = userProduct?.progress?.hotmartTotal
  if (typeof hotmartTotal === 'number' && hotmartTotal > 0) return hotmartTotal

  return userProduct?.progress?.total
    || sumModulesTotalLessons(modules)
    || user.hotmart?.progress?.lessonsData?.length
    || 0
}

function getCompletedLessons(user: StudentLean, userProduct: UserProductLean | null): number {
  // Preferir o "completo" oficial do Hotmart Club (cron) quando existir.
  const hotmartCompleted = userProduct?.progress?.hotmartCompleted
  if (typeof hotmartCompleted === 'number' && hotmartCompleted > 0) return hotmartCompleted

  return userProduct?.progress?.completed
    || userProduct?.progress?.lessonsCompleted?.length
    || user.hotmart?.progress?.completedLessons
    || 0
}

function getProgressPercentage(
  _user: StudentLean,
  userProduct: UserProductLean | null,
  completedLessons: number,
  totalLessons: number
): number {
  // Fonte preferida: a % oficial do Hotmart Club, capturada aluno a aluno pelo
  // cron HotmartOgiProgressRefresh (/users?email=). É o número exacto que o
  // aluno vê dentro do Hotmart — o denominador da Hotmart não coincide com o
  // nosso sync por lições, por isso só assim a barra bate certo.
  if (typeof userProduct?.progress?.hotmartPercentage === 'number') {
    return clampPercentage(userProduct.progress.hotmartPercentage)
  }

  // Fallback: o progresso calculado pelo sync nocturno (aulas feitas ÷ total,
  // já sem módulos extra). NÃO usar user.combined.* — mistura Hotmart com
  // Curseduca/outras fontes.
  if (typeof userProduct?.progress?.percentage === 'number') {
    return clampPercentage(userProduct.progress.percentage)
  }

  if (totalLessons <= 0) return 0
  return clampPercentage(Math.round((completedLessons / totalLessons) * 100))
}

function getLastActivity(user: StudentLean, userProduct: UserProductLean | null): Date | undefined {
  return userProduct?.progress?.lastActivity
    || userProduct?.engagement?.lastLogin
    || user.hotmart?.progress?.lastAccessDate
    || user.hotmart?.lastAccessDate
    || user.combined?.lastActivity
}

function findCurrentModule(modules: OgiModuleSummary[]): OgiModuleSummary | undefined {
  return modules.find(moduleItem => !moduleItem.completed && moduleItem.completedLessons > 0)
    || modules.find(moduleItem => !moduleItem.completed)
    || modules[modules.length - 1]
}

function findNextModule(modules: OgiModuleSummary[]): OgiModuleSummary | undefined {
  return modules.find(moduleItem => !moduleItem.completed)
}

function sumModulesTotalLessons(modules: OgiModuleSummary[]): number {
  return modules.reduce((total, moduleItem) => total + moduleItem.totalLessons, 0)
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function calculateExpirationDate(startDate?: Date): Date | undefined {
  if (!startDate) return undefined

  const expiresAt = new Date(startDate)
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)
  return expiresAt
}
