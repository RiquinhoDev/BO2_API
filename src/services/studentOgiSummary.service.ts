import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Product from '../models/product/Product'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import CourseLesson from '../models/CourseLesson'
import { ACHIEVEMENT_DEFINITIONS } from './achievements/achievementDefinitions'
import { evaluateAndPersistAchievements } from './achievements/achievementEvaluation.service'
import { recordDailyActivity } from './achievements/streakCalculator'
import { findRenewalOffer } from './renewal/renewalMatcher.service'
import { parseTurmaName, resolveAccessEnd } from './renewal/turmaParser'

type MongooseReadModel = mongoose.Model<mongoose.Document>
type StudentSummarySource = 'userProduct' | 'legacyHotmart' | 'none'

const ProductReadModel = Product as unknown as MongooseReadModel
const UserProductReadModel = UserProduct as unknown as MongooseReadModel
const CourseLessonReadModel = CourseLesson as unknown as MongooseReadModel

interface JwtStudentPayload {
  email?: string
}

interface OgiModuleSummary {
  id: string
  name: string
  sequence: number
  totalLessons: number
  completedLessons: number
  percentage: number
  completed: boolean
}

type ContinueLessonStatus = 'next' | 'resume' | 'start'

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
    classId?: string
    className?: string
    isActive?: boolean
    enrolledAt?: Date
  }>
  progress?: {
    completedLessons?: number
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

export function normalizeStudentEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function resolveStudentEmailFromToken(token: string): string {
  const secret = process.env.STUDENT_ACCESS_JWT_SECRET || process.env.JWT_SECRET

  if (!secret) {
    throw new Error('STUDENT_ACCESS_JWT_SECRET_OR_JWT_SECRET_MISSING')
  }

  const payload = jwt.verify(token, secret) as JwtStudentPayload
  if (!payload.email) {
    throw new Error('STUDENT_TOKEN_EMAIL_MISSING')
  }

  return normalizeStudentEmail(payload.email)
}

export function isValidSummaryAccessToken(token?: string): boolean {
  const expectedToken = process.env.STUDENT_SUMMARY_TOKEN
  return Boolean(expectedToken && token && token === expectedToken)
}

export interface StudentAccessResult {
  found: boolean
  email: string
  name?: string
  active: boolean
  expiresAt: Date | null
  className: string | null
  purchaseDate: Date | null
  manuallyInactivated: boolean
  reason: 'OK' | 'INACTIVATED' | 'EXPIRED' | 'NO_DATA'
  source: 'bo2'
}

/**
 * Decisão de acesso LEVE (sem efeitos secundários: não avalia achievements
 * nem regista streak). Usada pela API legacy no gate de login — fonte única
 * da regra de acesso (2 camadas: compra + nome da turma, via resolveAccessEnd)
 * + inativação manual do Backoffice.
 */
export async function getStudentAccess(email: string): Promise<StudentAccessResult | null> {
  const normalizedEmail = normalizeStudentEmail(email)
  const user = await User.findOne({ email: normalizedEmail })
    .select('name email hotmart.enrolledClasses hotmart.purchaseDate hotmart.signupDate inactivation')
    .lean()
    .exec() as StudentLean | null

  if (!user) return null

  const activeClassName = getActiveHotmartClassName(user)
  const purchaseDate = user.hotmart?.purchaseDate || user.hotmart?.signupDate || null
  const expiresAt = resolveAccessEnd(purchaseDate, activeClassName)
  const manuallyInactivated = Boolean(user.inactivation?.isManuallyInactivated)
  const dateValid = Boolean(expiresAt && expiresAt.getTime() >= Date.now())

  let reason: StudentAccessResult['reason'] = 'OK'
  if (manuallyInactivated) reason = 'INACTIVATED'
  else if (!expiresAt) reason = 'NO_DATA'
  else if (!dateValid) reason = 'EXPIRED'

  return {
    found: true,
    email: user.email,
    name: user.name,
    active: !manuallyInactivated && dateValid,
    expiresAt: expiresAt ?? null,
    className: activeClassName ?? null,
    purchaseDate: purchaseDate ?? null,
    manuallyInactivated,
    reason,
    source: 'bo2'
  }
}

export async function getStudentOgiSummary(email: string): Promise<StudentOgiSummary | null> {
  const normalizedEmail = normalizeStudentEmail(email)
  const user = await User.findOne({ email: normalizedEmail })
    .select('name email hotmart curseduca discord combined engagement inactivation achievements achievementStats')
    .exec() as (StudentLean & { achievements?: any[]; achievementStats?: any }) | null

  if (!user) return null

  const streakUpdate = await recordDailyActivity(user)

  await evaluateAndPersistAchievements(user, {
    force: streakUpdate.changed,
    staleMs: 12 * 60 * 60 * 1000,
    backfillUnlockedAsSeen: true
  })

  const ogiProduct = await findOgiProduct()
  const userProduct = await findOgiUserProduct(user._id, ogiProduct?._id)

  return buildStudentOgiSummary(typeof (user as any).toObject === 'function' ? (user as any).toObject() : user, userProduct)
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
  user: StudentLean & { achievements?: any[]; achievementStats?: any },
  userProduct: UserProductLean | null
): Promise<StudentOgiSummary> {
  const modules = buildModuleSummaries(userProduct)
  const source = getSummarySource(user, userProduct)
  const totalLessons = getTotalLessons(user, userProduct, modules)
  const completedLessons = getCompletedLessons(user, userProduct)
  const percentage = getProgressPercentage(user, userProduct, completedLessons, totalLessons)
  const purchaseDate = userProduct?.metadata?.purchaseDate || user.hotmart?.purchaseDate
  const enrolledAt = userProduct?.enrolledAt || user.hotmart?.signupDate
  const continueLesson = await buildContinueLesson(userProduct)
  const activeClassName = getActiveHotmartClassName(user)
  const parsedTurma = activeClassName ? parseTurmaName(activeClassName) : null
  // Fim de acesso canónico (2 camadas: compra + nome da turma) — mesma regra do
  // gate de login na API legacy. Fallback ao cálculo antigo se não houver dados.
  const fallbackExpiresAt = calculateExpirationDate(purchaseDate || enrolledAt)
  const expiresAt = resolveAccessEnd(purchaseDate || enrolledAt, activeClassName)
    || fallbackExpiresAt
  const renewalOffer = await findRenewalOffer({
    turmaNumber: parsedTurma?.turmaNumber,
    expiryYYMM: parsedTurma?.accessEndYYMM
  })

  // Construir achievements a partir do cache no User doc
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
      renewalUrl: renewalOffer?.link || null,
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

async function buildContinueLesson(userProduct: UserProductLean | null): Promise<OgiContinueLesson | undefined> {
  const catalog = await CourseLessonReadModel.find({
    isActive: true,
    courseCode: /^OGI/i
  })
    .sort({ moduleSequence: 1, lessonSequence: 1 })
    .select('pageId pageName moduleName moduleSequence lessonSequence url')
    .lean()
    .exec() as unknown as CourseLessonLean[]

  if (catalog.length === 0) return undefined

  const completedPageIds = new Set(userProduct?.progress?.lessonsCompleted || [])
  const hasStarted = completedPageIds.size > 0

  if (!hasStarted) {
    return toContinueLesson(catalog[0], 'start')
  }

  const firstIncomplete = catalog.find((lesson) => !completedPageIds.has(lesson.pageId))
  if (firstIncomplete) {
    return toContinueLesson(firstIncomplete, 'next')
  }

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
  achievements?: any[],
  stats?: any
): StudentOgiSummary['achievements'] {
  if (!achievements || achievements.length === 0) return undefined

  // Enriquecer com definições (nomes, descrições)
  const defMap = new Map(ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d]))

  const items = achievements.map((a: any) => {
    const def = defMap.get(a.id)
    return {
      id: a.id,
      name: def?.name || a.id,
      description: def?.description || '',
      category: def?.category || 'marcos',
      isUnlocked: Boolean(a.unlockedAt),
      unlockedAt: a.unlockedAt ? new Date(a.unlockedAt).toISOString() : null,
      isNew: Boolean(a.unlockedAt && !a.seenAt),
      progress: a.progress || undefined,
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

function getActiveHotmartClassName(user: StudentLean): string | undefined {
  const classes = user.hotmart?.enrolledClasses || []
  const activeClass = classes.find((classItem) => classItem.className && classItem.isActive !== false)
    || classes.find((classItem) => classItem.className)

  return activeClass?.className
}

function getTotalLessons(
  user: StudentLean,
  userProduct: UserProductLean | null,
  modules: OgiModuleSummary[]
): number {
  return userProduct?.progress?.total
    || sumModulesTotalLessons(modules)
    || user.combined?.totalLessons
    || user.hotmart?.progress?.lessonsData?.length
    || 0
}

function getCompletedLessons(user: StudentLean, userProduct: UserProductLean | null): number {
  return userProduct?.progress?.completed
    || userProduct?.progress?.lessonsCompleted?.length
    || user.hotmart?.progress?.completedLessons
    || 0
}

function getProgressPercentage(
  user: StudentLean,
  userProduct: UserProductLean | null,
  completedLessons: number,
  totalLessons: number
): number {
  if (typeof userProduct?.progress?.percentage === 'number') {
    return clampPercentage(userProduct.progress.percentage)
  }

  if (typeof user.combined?.totalProgress === 'number') {
    return clampPercentage(user.combined.totalProgress)
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
