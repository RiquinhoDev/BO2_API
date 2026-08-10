import type { HotmartLesson } from './hotmartLegacyClient'

export type HotmartProgressLesson = {
  pageId: string
  pageName: string
  moduleName: string
  isModuleExtra: boolean
  isCompleted: boolean
  completedDate?: Date
}

export type HotmartProgress = {
  completedPercentage: number
  total: number
  completed: number
  lessons: HotmartProgressLesson[]
}

export function calculateHotmartProgress(lessons: HotmartLesson[]): HotmartProgress {
  if (lessons.length === 0) {
    return { completedPercentage: 0, total: 0, completed: 0, lessons: [] }
  }

  const completed = lessons.filter(lesson => lesson.is_completed).length
  const total = lessons.length

  return {
    completedPercentage: Math.round((completed / total) * 100),
    total,
    completed,
    lessons: lessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    }))
  }
}
