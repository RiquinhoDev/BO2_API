import { Router } from 'express'
import {
  listCourseLessons,
  syncCourseLessons,
  updateCourseLessonUrl
} from '../controllers/courseLessons.controller'

const router = Router()

router.get('/', listCourseLessons)
router.put('/:pageId', updateCourseLessonUrl)
router.post('/sync', syncCourseLessons)

export default router
