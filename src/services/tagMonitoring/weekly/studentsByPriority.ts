import { CriticalTag, WeeklyNativeTagSnapshot } from '../../../models/tagMonitoring'
import User from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import logger from '../../../utils/logger'

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}
export async function getStudentsByPriority(params: {
    priorities?: ('CRITICAL' | 'MEDIUM' | 'LOW')[]
    tagName?: string
    limit?: number
    skip?: number
  }): Promise<{
    students: Array<{
      _id: string
      name: string
      email: string
      tags: Array<{ name: string; priority: 'CRITICAL' | 'MEDIUM' | 'LOW' }>
      products: string[]
    }>
    total: number
    page: number
    totalPages: number
  }> {
    try {
      const { priorities = ['CRITICAL'], tagName, limit = 20, skip = 0 } = params

      // 1. Buscar tags críticas ativas filtradas por prioridade
      const query: any = { isActive: true }
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

      const tagNames = criticalTags.map((t) => t.tagName)

      // 2. Buscar snapshots mais recentes (última semana) que contenham essas tags
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

      // 3. Extrair emails únicos
      const emailsSet = new Set(snapshots.map((s) => s.email))
      const uniqueEmails = Array.from(emailsSet)

      if (uniqueEmails.length === 0) {
        return {
          students: [],
          total: 0,
          page: 1,
          totalPages: 0,
        }
      }

      // 4. Buscar informações completas dos alunos (com paginação)
      const users = await User.find({ email: { $in: uniqueEmails } })
        .select('_id name email')
        .skip(skip)
        .limit(limit)
        .lean()

      // 5. Enriquecer com produtos e tags
      const enrichedStudents = await Promise.all(
        users.map(async (user) => {
          // Buscar produtos do aluno
          const userProducts = await UserProduct.find({ userId: user._id })
            .populate('productId')
            .lean()

          const products = userProducts
            .map((up: any) => up.productId?.name)
            .filter(Boolean)

          // Buscar snapshot do aluno para obter suas tags
          const userSnapshot = snapshots.find((s) => s.email === user.email)
          const userTags = userSnapshot?.nativeTags || []

          // Mapear tags com suas prioridades
          const tagsWithPriority = criticalTags
            .filter((ct) => userTags.includes(ct.tagName))
            .map((ct) => ({
              name: ct.tagName,
              priority: ct.priority as 'CRITICAL' | 'MEDIUM' | 'LOW',
            }))

          return {
            _id: user._id.toString(),
            name: user.name || user.email,
            email: user.email,
            tags: tagsWithPriority,
            products: products as string[],
          }
        })
      )

      // 6. Filtrar alunos que têm pelo menos uma tag
      const studentsWithTags = enrichedStudents.filter((s) => s.tags.length > 0)

      // 7. Calcular total e paginação
      const total = uniqueEmails.length
      const totalPages = Math.ceil(total / limit)
      const page = Math.floor(skip / limit) + 1

      return {
        students: studentsWithTags,
        total,
        page,
        totalPages,
      }
    } catch (error) {
      logger.error('Erro ao buscar alunos por prioridade:', error)
      throw error
    }
  }
