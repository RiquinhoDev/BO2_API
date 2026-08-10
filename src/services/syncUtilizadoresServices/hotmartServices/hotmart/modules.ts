import axios from 'axios'
import { HotmartModule, HotmartModuleProgress } from '../../../../types/lesson.types'
import { requestWithRetry } from './transport'
import type { HotmartLesson } from './transport'
export const fetchCourseModules = async (
  accessToken: string,
  subdomain: string = 'ogi-v1'
): Promise<HotmartModule[]> => {
  try {
    const response = await axios.get(
      'https://developers.hotmart.com/club/api/v1/modules',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          subdomain,
          is_extra: false
        }
      }
    )

    const modules: HotmartModule[] = Array.isArray(response.data) ? response.data : []

    // Ordenar por sequência
    modules.sort((a, b) => a.sequence - b.sequence)

    console.log(`✅ [HotmartModules] ${modules.length} módulos encontrados para ${subdomain}`)
    return modules
  } catch (error: any) {
    const status = error.response?.status
    const errorMsg = error.response?.data?.message || error.message

    if (status === 401) {
      console.warn(`⚠️ [HotmartModules] Endpoint /modules requer permissões adicionais (401)`)
      console.warn(`⚠️ [HotmartModules] Sync continuará SEM dados de módulos`)
    } else if (status === 429) {
      console.warn(`⚠️ [HotmartModules] Rate limit atingido (429) - tente novamente mais tarde`)
    } else {
      console.error(`❌ [HotmartModules] Erro ao buscar módulos de ${subdomain}:`, errorMsg)
    }

    return []
  }
}

/**
 * Calcular progresso por módulo A PARTIR DAS LIÇÕES
 * (não precisa do endpoint /modules - extrai módulos das lições)
 * @param {HotmartLesson[]} lessons - Lições do utilizador
 * @returns {HotmartModuleProgress[]} Progresso de cada módulo
 */
export const calculateModuleProgress = (
  lessons: HotmartLesson[]
): HotmartModuleProgress[] => {

  if (lessons.length === 0) {
    return []
  }

  // Agrupar lições por nome de módulo
  const moduleMap = new Map<string, {
    name: string
    isExtra: boolean
    lessons: HotmartLesson[]
    firstIndex: number
  }>()

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i]
    const moduleName = lesson.module_name.trim()

    if (!moduleMap.has(moduleName)) {
      moduleMap.set(moduleName, {
        name: moduleName,
        isExtra: lesson.is_module_extra,
        lessons: [],
        firstIndex: i
      })
    }

    moduleMap.get(moduleName)!.lessons.push(lesson)
  }

  // Converter Map para array e calcular progresso
  const moduleProgressList: HotmartModuleProgress[] = []

  for (const [moduleName, moduleData] of moduleMap.entries()) {
    const totalPages = moduleData.lessons.length
    const completedPages = moduleData.lessons.filter(l => l.is_completed).length
    const isCompleted = totalPages > 0 && completedPages === totalPages

    // Encontrar timestamp da última lição completada
    const completedLessons = moduleData.lessons.filter(l => l.is_completed && l.completed_date)
    const lastCompletedDate = completedLessons.length > 0
      ? Math.max(...completedLessons.map(l => l.completed_date || 0))
      : undefined

    moduleProgressList.push({
      moduleId: moduleName.toLowerCase().replace(/\s+/g, '-'), // Gerar ID a partir do nome
      name: moduleData.name,
      sequence: moduleData.firstIndex + 1, // Sequência baseada na primeira aparição
      totalPages,
      completedPages,
      isCompleted,
      isExtra: moduleData.isExtra,
      progressPercentage: totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0,
      lastCompletedDate
    })
  }

  // Ordenar pela primeira aparição (mantém ordem natural do curso)
  return moduleProgressList.sort((a, b) => a.sequence - b.sequence)
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════
