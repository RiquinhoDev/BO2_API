import { RequestHandler } from 'express'
import { successResponse } from '../../../contracts/responseContract'
import mongoose from 'mongoose'
import { SyncType } from '../../../models/SyncModels/CronJobConfig'
import { type PopulatedTagRule, type CourseRuleGroup } from '../../../services/cron/controllerSupport'

export const getAvailableTagRules: RequestHandler = async (req, res, next) => {
  try {
    const syncType = req.query.syncType as SyncType | undefined

    if (!syncType || !['hotmart', 'curseduca', 'discord', 'all'].includes(syncType)) {
      res.status(400).json({
        success: false,
        message: 'syncType inválido. Use: hotmart, curseduca, discord ou all'
      })
      return
    }

    console.log(`[CRON] �? Buscando Tag Rules para syncType: ${syncType}`)

    const TagRule = (await import('../../../models/acTags/TagRule')).default
    const Course = (await import('../../../models/Course')).default
    const Product = (await import('../../../models/product/Product')).default

    let courseIds: mongoose.Types.ObjectId[] = []

    if (syncType === 'all') {
      const courses = await Course.find({ isActive: true })
        .select('_id')
        .lean<Array<{ _id: mongoose.Types.ObjectId }>>()
      courseIds = courses.map(c => new mongoose.Types.ObjectId(String(c._id)))
    } else {
      const products = await Product.find({
        platform: syncType,
        isActive: true
      })
        .select('courseId')
        .lean<Array<{ courseId?: mongoose.Types.ObjectId }>>()

      const uniqueIds = products.reduce<string[]>((ids, product) => {
        const courseId = product.courseId?.toString()
        if (courseId && !ids.includes(courseId)) {
          ids.push(courseId)
        }
        return ids
      }, [])
      courseIds = uniqueIds.map(id => new mongoose.Types.ObjectId(id))
    }

    console.log(`[CRON] 📚 Encontrados ${courseIds.length} courses para plataforma ${syncType}`)

    if (courseIds.length === 0) {
      res.status(200).json(successResponse({ rules: [], groupedByCourse: [], totalRules: 0, totalCourses: 0 }, { message: 'Nenhum course encontrado para esta plataforma' }))
      return
    }

    const rules = await TagRule.find({
      courseId: { $in: courseIds },
      isActive: true
    })
      .populate('courseId', 'name code trackingType')
      .sort({ priority: -1, createdAt: -1 })
      .lean<PopulatedTagRule[]>()

    const groupedByCourse = rules.reduce<CourseRuleGroup[]>((acc, rule) => {
      if (!rule.courseId) return acc

      const course = rule.courseId
      const courseId = course._id.toString()

      let group = acc.find(g => g.courseId === courseId)
      if (!group) {
        group = {
          courseName: course.name || 'Sem Nome',
          courseId,
          courseCode: course.code || 'UNKNOWN',
          platform: syncType === 'all' ? 'all' : syncType,
          rules: [],
          totalRules: 0
        }
        acc.push(group)
      }

      group.rules.push({
        _id: rule._id,
        name: rule.name,
        tagName: rule.actions?.addTag || 'N/A',
        description: rule.description || '',
        category: rule.category,
        priority: rule.priority,
        course: { _id: course._id, name: course.name, code: course.code },
        conditions: rule.conditions || [],
        estimatedStudents: 0,
        isActive: rule.isActive
      })

      group.totalRules++
      return acc
    }, [])

    groupedByCourse.sort((a, b) => a.courseName.localeCompare(b.courseName))

    res.status(200).json(successResponse({
        rules: rules.map(rule => ({
          _id: rule._id,
          name: rule.name,
          tagName: rule.actions?.addTag || 'N/A',
          description: rule.description || '',
          category: rule.category,
          priority: rule.priority,
          course: rule.courseId
            ? { _id: rule.courseId._id, name: rule.courseId.name, code: rule.courseId.code }
            : null,
          conditions: rule.conditions || [],
          isActive: rule.isActive
        })),
        groupedByCourse,
        totalRules: rules.length,
        totalCourses: groupedByCourse.length
      }, { message: `${rules.length} Tag Rules encontradas` }))
  } catch (err) {
    next(err) // 🔥 importante para Express lidar com o erro corretamente
  }
}



// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// CREATE JOB
// POST /api/cron/jobs
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

