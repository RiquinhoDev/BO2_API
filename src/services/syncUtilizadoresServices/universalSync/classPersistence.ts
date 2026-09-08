import type { UpdateQuery } from 'mongoose'
import { Class, type IClass } from '../../../models/Class'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import { errorMessage, mongoErrorCode } from './fieldUtils'
import logger from '../../../utils/logger'

const beforeMutation = (hooks?: CronExecutionPhaseHooks): void => {
  hooks?.assertOwnership?.()
  hooks?.localMutationStarted()
  hooks?.consumeMutation?.()
}

/** Ensure a provider class exists without bypassing a prepared execution plan. */
export async function ensureClassExists(
  classId: string,
  className: string | undefined,
  source: 'hotmart' | 'curseduca',
  curseducaId?: string,
  curseducaUuid?: string,
  phaseHooks?: CronExecutionPhaseHooks,
  plannedClass?: IClass,
  plannedClassLookupProvided = false,
  onResolvedClass?: (classRow: Record<string, unknown>) => void,
  planConflictCode = 'HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT',
): Promise<string> {
  if (!classId) return className || `Turma ${classId}`

  try {
    const existingClass = plannedClassLookupProvided
      ? plannedClass
      : await Class.findOne({ classId })

    if (!existingClass) {
      const displayName = className || `Turma ${classId}`

      beforeMutation(phaseHooks)
      const createdClass = await Class.create({
        classId,
        name: displayName,
        curseducaId: source === 'curseduca' ? curseducaId : undefined,
        curseducaUuid: source === 'curseduca' ? curseducaUuid : undefined,
        source: source === 'hotmart' ? 'hotmart_sync' : 'curseduca_sync',
        isActive: true,
        estado: 'ativo',
        studentCount: 1,
        lastSyncAt: new Date(),
      })
      onResolvedClass?.(createdClass as unknown as Record<string, unknown>)

      logger.info(`   ✅ [Class] Nova turma criada: ${classId} - "${displayName}"`)
      return displayName
    }

    const updates: UpdateQuery<IClass> = {
      lastSyncAt: new Date(),
      $inc: { studentCount: 0 },
    }
    const isGenericName = existingClass.name.match(/^Turma [a-zA-Z0-9]+$/)
    const hasNewName = className && className !== existingClass.name && !className.match(/^Turma [a-zA-Z0-9]+$/)

    if (isGenericName && hasNewName) {
      updates.name = className
      logger.info(`   📝 [Class] Nome atualizado: ${classId} - "${existingClass.name}" → "${className}"`)
    }

    if (source === 'curseduca') {
      if (curseducaId && !existingClass.curseducaId) updates.curseducaId = curseducaId
      if (curseducaUuid && !existingClass.curseducaUuid) updates.curseducaUuid = curseducaUuid
    }

    beforeMutation(phaseHooks)
    const updatedClass = await Class.findOneAndUpdate(
      {
        _id: existingClass._id,
        classId,
        ...(existingClass.updatedAt ? { updatedAt: existingClass.updatedAt } : { name: existingClass.name }),
      },
      updates,
      { new: true },
    )
    if (!updatedClass && plannedClassLookupProvided) throw new Error(planConflictCode)
    if (updatedClass) onResolvedClass?.(updatedClass as unknown as Record<string, unknown>)
    return (isGenericName && hasNewName ? className : existingClass.name) || `Turma ${classId}`
  } catch (error: unknown) {
    if (phaseHooks) throw error
    if (mongoErrorCode(error) !== 11000) {
      logger.error(`   ⚠️ [Class] Erro ao criar/atualizar turma ${classId}:`, errorMessage(error))
    }
    return className || `Turma ${classId}`
  }
}
