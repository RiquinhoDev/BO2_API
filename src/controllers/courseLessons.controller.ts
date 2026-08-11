import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import mongoose from 'mongoose'
import CourseLesson from '../models/CourseLesson'
import { syncCourseLessonCatalog } from '../services/courseLessonCatalog.service'
import { internalError } from '../security/errorHandling'

type MongooseReadModel = mongoose.Model<mongoose.Document>

const CourseLessonReadModel = CourseLesson as unknown as MongooseReadModel

interface CourseLessonLean {
  pageId: string
  pageName: string
  moduleId: string
  moduleName: string
  moduleSequence: number
  lessonSequence: number
  courseCode: string
  url: string
  isActive: boolean
  updatedAt?: Date
}

interface CourseLessonModuleGroup {
  moduleId: string
  moduleName: string
  moduleSequence: number
  lessons: CourseLessonLean[]
}

export async function listCourseLessons(_req: Request, res: Response, next: NextFunction) {
  try {
    const lessons = await CourseLessonReadModel.find({ isActive: true })
      .sort({ moduleSequence: 1, lessonSequence: 1 })
      .lean()
      .exec() as unknown as CourseLessonLean[]

    res.json(successResponse({ modules: groupLessonsByModule(lessons) }, { totalLessons: lessons.length }))
  } catch (error: unknown) {
    next(internalError('Erro ao listar aulas do curso.', 'COURSE_LESSONS_LIST_FAILED', error))
  }
}

export async function updateCourseLessonUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const { pageId } = req.params
    const { url } = req.body

    if (typeof url !== 'string') {
      return res.status(400).json({ message: 'Campo url obrigatorio.' })
    }

    const lesson = await CourseLessonReadModel.findOneAndUpdate(
      { pageId },
      { $set: { url: url.trim() } },
      { new: true }
    )
      .lean()
      .exec() as unknown as CourseLessonLean | null

    if (!lesson) {
      return res.status(404).json({ message: 'Aula nao encontrada.' })
    }

    res.json(successResponse({ lesson }, { message: 'Link da aula guardado com sucesso.' }))
  } catch (error: unknown) {
    next(internalError('Erro ao guardar link da aula.', 'COURSE_LESSON_UPDATE_FAILED', error))
  }
}

export async function syncCourseLessons(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await syncCourseLessonCatalog()
    res.json(successResponse({ sync: result },
      { message: 'Catalogo de aulas sincronizado com sucesso.' }))
  } catch (error: unknown) {
    next(internalError('Erro ao sincronizar catalogo de aulas.', 'COURSE_LESSONS_SYNC_FAILED', error))
  }
}

function groupLessonsByModule(lessons: CourseLessonLean[]): CourseLessonModuleGroup[] {
  const moduleMap = new Map<string, CourseLessonModuleGroup>()

  for (const lesson of lessons) {
    const key = lesson.moduleId || lesson.moduleName

    if (!moduleMap.has(key)) {
      moduleMap.set(key, {
        moduleId: lesson.moduleId,
        moduleName: lesson.moduleName,
        moduleSequence: lesson.moduleSequence,
        lessons: []
      })
    }

    moduleMap.get(key)!.lessons.push(lesson)
  }

  return Array.from(moduleMap.values())
}
