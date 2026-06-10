import { Request, Response } from 'express'
import mongoose from 'mongoose'
import CourseLesson from '../models/CourseLesson'
import { syncCourseLessonCatalog } from '../services/courseLessonCatalog.service'

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

export async function listCourseLessons(_req: Request, res: Response) {
  try {
    const lessons = await CourseLessonReadModel.find({ isActive: true })
      .sort({ moduleSequence: 1, lessonSequence: 1 })
      .lean()
      .exec() as unknown as CourseLessonLean[]

    res.json({
      modules: groupLessonsByModule(lessons),
      totalLessons: lessons.length
    })
  } catch (error: any) {
    res.status(500).json({
      message: 'Erro ao listar aulas do curso.',
      details: error.message
    })
  }
}

export async function updateCourseLessonUrl(req: Request, res: Response) {
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

    res.json({
      lesson,
      message: 'Link da aula guardado com sucesso.'
    })
  } catch (error: any) {
    res.status(500).json({
      message: 'Erro ao guardar link da aula.',
      details: error.message
    })
  }
}

export async function syncCourseLessons(req: Request, res: Response) {
  try {
    const result = await syncCourseLessonCatalog()
    res.json({
      sync: result,
      message: 'Catalogo de aulas sincronizado com sucesso.'
    })
  } catch (error: any) {
    res.status(500).json({
      message: 'Erro ao sincronizar catalogo de aulas.',
      details: error.message
    })
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
