import { CriticalTag, WeeklyNativeTagSnapshot } from '../../../models/tagMonitoring'
import User from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import logger from '../../../utils/logger'

type TagPriority = 'CRITICAL' | 'MEDIUM' | 'LOW'

interface CriticalTagQuery {
  isActive: true
  priority?: { $in: TagPriority[] }
  tagName?: string
}

interface PopulatedProductName {
  _id?: unknown
  name?: string
}

interface UserProductWithName {
  productId?: PopulatedProductName | null
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

export async function getStudentsByPriority(params: {
  priorities?: TagPriority[]
  tagName?: string
  limit?: number
  skip?: number
}): Promise<{
  students: Array<{
    _id: string
    name: string
    email: string
    tags: Array<{ name: string; priority: TagPriority }>
    products: string[]
  }>
  total: number
  page: number
  totalPages: number
}> {
  try {
    const { priorities = ['CRITICAL'], tagName, limit = 20, skip = 0 } = params

    const query: CriticalTagQuery = { isActive: true }
    if (priorities.length > 0) {
      query.priority = { $in: priorities }
    }
    if (tagName) {
      query.tagName = tagName
    }

    const criticalTags = await CriticalTag.find(query).lean()

    if (criticalTags.length === 0) {
      return {
        students: [],
        total: 0,
        page: 1,
        totalPages: 0,
      }
    }

    const tagNames = criticalTags.map((tag) => tag.tagName)

    const currentDate = new Date()
    const weekNumber = getWeekNumber(currentDate)
    const year = currentDate.getFullYear()

    const snapshots = await WeeklyNativeTagSnapshot.find({
      weekNumber,
      year,
      nativeTags: { $in: tagNames },
    })
      .select('email nativeTags userId')
      .lean()

    const emailsSet = new Set(snapshots.map((snapshot) => snapshot.email))
    const uniqueEmails = Array.from(emailsSet)

    if (uniqueEmails.length === 0) {
      return {
        students: [],
        total: 0,
        page: 1,
        totalPages: 0,
      }
    }

    const users = await User.find({ email: { $in: uniqueEmails } })
      .select('_id name email')
      .skip(skip)
      .limit(limit)
      .lean()

    const enrichedStudents = await Promise.all(
      users.map(async (user) => {
        const userProducts = await UserProduct.find({ userId: user._id })
          .populate('productId')
          .lean<UserProductWithName[]>()

        const products = userProducts.flatMap((userProduct) => {
          const name = userProduct.productId?.name
          return typeof name === 'string' ? [name] : []
        })

        const userSnapshot = snapshots.find((snapshot) => snapshot.email === user.email)
        const userTags = userSnapshot?.nativeTags || []

        const tagsWithPriority = criticalTags
          .filter((criticalTag) => userTags.includes(criticalTag.tagName))
          .flatMap((criticalTag) => {
            const priority = criticalTag.priority
            return priority === 'CRITICAL' || priority === 'MEDIUM' || priority === 'LOW'
              ? [{ name: criticalTag.tagName, priority }]
              : []
          })

        return {
          _id: user._id.toString(),
          name: user.name || user.email,
          email: user.email,
          tags: tagsWithPriority,
          products,
        }
      })
    )

    const studentsWithTags = enrichedStudents.filter((student) => student.tags.length > 0)

    const total = uniqueEmails.length
    const totalPages = Math.ceil(total / limit)
    const page = Math.floor(skip / limit) + 1

    return {
      students: studentsWithTags,
      total,
      page,
      totalPages,
    }
  } catch (error: unknown) {
    logger.error('Erro ao buscar alunos por prioridade:', error)
    throw error
  }
}
