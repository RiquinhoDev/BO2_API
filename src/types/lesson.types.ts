// src/types/lesson.types.ts
export interface HotmartLesson {
    page_id: string
    page_name: string
    module_name: string
    is_module_extra: boolean
    is_completed: boolean
    completed_date?: number // timestamp em milissegundos
  }
  
  export interface HotmartLessonsResponse {
    lessons: HotmartLesson[]
  }
  
  export interface LessonProgress {
    pageId: string
    pageName: string
    moduleName: string
    isModuleExtra: boolean
    isCompleted: boolean
    completedDate?: Date
  }
  
  export interface UserLessonsData {
    userId: string
    userEmail: string
    userName: string
    subdomain: string
    lessons: LessonProgress[]
    totalLessons: number
    completedLessons: number
    progressPercentage: number
    lastUpdated: Date
  }
  
  export interface LessonStats {
    totalModules: number
    completedModules: number
    totalLessons: number
    completedLessons: number
    progressPercentage: number
    moduleProgress: {
      moduleName: string
      totalLessons: number
      completedLessons: number
      progressPercentage: number
    }[]
  }

  // ═══════════════════════════════════════════════════════════
  // MÓDULOS DO HOTMART CLUB
  // ═══════════════════════════════════════════════════════════

  export interface HotmartModule {
    module_id: string
    name: string
    sequence: number
    is_extra: boolean
    is_extra_paid: boolean
    is_public: boolean
    classes: string[]
    total_pages: number
  }

  export interface HotmartModuleProgress {
    moduleId: string
    name: string
    sequence: number
    totalPages: number
    completedPages: number
    isCompleted: boolean
    isExtra: boolean
    progressPercentage: number
    lastCompletedDate?: number  // timestamp
  }