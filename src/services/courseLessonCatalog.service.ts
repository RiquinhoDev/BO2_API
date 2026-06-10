import mongoose from 'mongoose'
import CourseLesson from '../models/CourseLesson'
import Product from '../models/product/Product'
import UserProduct from '../models/UserProduct'
import { hotmartLessonsService } from './syncUtilizadoresServices/hotmartServices/hotmartLessonsService'
import {
  fetchAllHotmartUsers,
  getHotmartAccessToken,
  HotmartLesson
} from './syncUtilizadoresServices/hotmartServices/hotmart.helpers'

type MongooseReadModel = mongoose.Model<mongoose.Document>

const ProductReadModel = Product as unknown as MongooseReadModel
const UserProductReadModel = UserProduct as unknown as MongooseReadModel
const CourseLessonWriteModel = CourseLesson as unknown as mongoose.Model<any>

interface ProductLean {
  _id: mongoose.Types.ObjectId
  code?: string
  name?: string
  courseCode?: string
  subdomain?: string
}

interface UserProductLean {
  platformUserId?: string
}

interface CourseLessonCatalogEntry {
  pageId: string
  pageName: string
  moduleId: string
  moduleName: string
  moduleSequence: number
  lessonSequence: number
  courseCode: string
  productId?: mongoose.Types.ObjectId
}

export interface CourseLessonCatalogSyncResult {
  representativeUserId: string
  subdomain: string
  totalLessons: number
  created: number
  updated: number
  skipped: number
}

export async function syncCourseLessonCatalog(): Promise<CourseLessonCatalogSyncResult> {
  const product = await findOgiProduct()
  const subdomain = resolveSubdomain(product)
  const representativeUserId = await resolveRepresentativeUserId(product?._id)

  if (!representativeUserId) {
    throw new Error('COURSE_LESSON_REPRESENTATIVE_USER_NOT_FOUND')
  }

  const response = await hotmartLessonsService.getUserLessons(representativeUserId, subdomain)
  const lessons = Array.isArray(response.lessons) ? response.lessons : []
  const entries = buildCatalogEntries(lessons, product)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const entry of entries) {
    const result = await CourseLessonWriteModel.updateOne(
      { pageId: entry.pageId },
      {
        $set: {
          pageName: entry.pageName,
          moduleId: entry.moduleId,
          moduleName: entry.moduleName,
          moduleSequence: entry.moduleSequence,
          lessonSequence: entry.lessonSequence,
          courseCode: entry.courseCode,
          productId: entry.productId,
          isActive: true
        },
        $setOnInsert: {
          url: ''
        }
      },
      { upsert: true }
    )

    if (result.upsertedCount && result.upsertedCount > 0) {
      created += 1
    } else if (result.matchedCount && result.matchedCount > 0) {
      updated += 1
    } else {
      skipped += 1
    }
  }

  return {
    representativeUserId,
    subdomain,
    totalLessons: entries.length,
    created,
    updated,
    skipped
  }
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
    .select('_id code name courseCode subdomain')
    .lean()
    .exec() as Promise<ProductLean | null>
}

function resolveSubdomain(product: ProductLean | null): string {
  return (
    process.env.COURSE_LESSON_SUBDOMAIN
    || product?.subdomain
    || process.env.subdomain
    || process.env.HOTMART_SUBDOMAIN
    || 'ograndeinvestimento-bomrmk'
  )
}

async function resolveRepresentativeUserId(
  productId?: mongoose.Types.ObjectId
): Promise<string> {
  if (process.env.COURSE_LESSON_SYNC_USER_ID) {
    return process.env.COURSE_LESSON_SYNC_USER_ID
  }

  const query: Record<string, unknown> = {
    platform: 'hotmart',
    platformUserId: { $exists: true, $ne: '' }
  }

  if (productId) {
    query.productId = productId
  }

  const userProduct = await UserProductReadModel.findOne(query)
    .sort({ 'progress.total': -1, updatedAt: -1 })
    .select('platformUserId')
    .lean()
    .exec() as UserProductLean | null

  if (userProduct?.platformUserId) {
    return userProduct.platformUserId
  }

  const token = await getHotmartAccessToken()
  const users = await fetchAllHotmartUsers(token)
  const representative = users.find((user) => user.id || user.user_id || user.uid || user.code)

  return representative
    ? String(representative.id || representative.user_id || representative.uid || representative.code)
    : ''
}

function buildCatalogEntries(
  lessons: HotmartLesson[],
  product: ProductLean | null
): CourseLessonCatalogEntry[] {
  const moduleSequences = new Map<string, number>()
  const lessonSequencesByModule = new Map<string, number>()
  const courseCode = product?.courseCode || 'OGI'

  return lessons
    .filter((lesson) => lesson.page_id && lesson.page_name && lesson.module_name)
    .map((lesson) => {
      const moduleName = lesson.module_name.trim()
      const moduleSequence = getOrCreateModuleSequence(moduleSequences, moduleName)
      const lessonSequence = getNextLessonSequence(lessonSequencesByModule, moduleName)

      return {
        pageId: String(lesson.page_id),
        pageName: lesson.page_name.trim(),
        moduleId: buildModuleId(moduleName),
        moduleName,
        moduleSequence,
        lessonSequence,
        courseCode,
        productId: product?._id
      }
    })
}

function getOrCreateModuleSequence(moduleSequences: Map<string, number>, moduleName: string): number {
  const existing = moduleSequences.get(moduleName)
  if (existing) return existing

  const next = moduleSequences.size + 1
  moduleSequences.set(moduleName, next)
  return next
}

function getNextLessonSequence(lessonSequencesByModule: Map<string, number>, moduleName: string): number {
  const next = (lessonSequencesByModule.get(moduleName) || 0) + 1
  lessonSequencesByModule.set(moduleName, next)
  return next
}

function buildModuleId(moduleName: string): string {
  return moduleName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
