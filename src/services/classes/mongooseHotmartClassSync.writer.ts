// Mongoose writer for the hotmartClassSync vertical. Owns every Class/User/
// StudentClassHistory/SyncHistory read and write behind the three Hotmart
// handlers, migrated verbatim from the controller. Network, pagination and
// rate-limiting live in the service behind injected ports.
import type { UpdateQuery } from 'mongoose'
import { Class, type IClass } from '../../models/Class'
import StudentClassHistory from '../../models/StudentClassHistory'
import { User } from '../../models'
import type { IUser } from '../../models/user'
import SyncHistory from '../../models/SyncHistory'
import type { HotmartClubUser } from './hotmartClubClient'
import type {
  ClassUpsertOutcome,
  CompleteLocalUser,
  HotmartClassSyncWriter,
  LocalUserBasic,
  SyncRecordRef,
  SyncStats,
} from './hotmartClassSync.service'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class MongooseHotmartClassSyncWriter implements HotmartClassSyncWriter {
  // ---------- syncHotmartClasses ----------
  async startClassSync(now: Date): Promise<SyncRecordRef> {
    const record = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: now,
      stats: { total: 0, added: 0, updated: 0, conflicts: 0, errors: 0 },
      metadata: {
        syncType: 'classes_sync_with_student_update',
        includeStudentCount: true,
        detectInactiveClasses: true,
      },
    })
    return { id: record._id }
  }

  async updateSyncStep(ref: SyncRecordRef, step: string, progress: number): Promise<void> {
    await SyncHistory.findByIdAndUpdate(ref.id, {
      'metadata.currentStep': step,
      'metadata.progress': progress,
    })
  }

  async upsertSyncedClass(classId: string, studentCount: number, now: Date): Promise<ClassUpsertOutcome> {
    const existingClass = await Class.findOne({ classId })

    if (existingClass) {
      const classUpdates: UpdateQuery<IClass> = { lastSyncAt: now, source: 'hotmart_sync' }
      let needsUpdate = false
      if (existingClass.studentCount !== studentCount) {
        classUpdates.studentCount = studentCount
        needsUpdate = true
      }
      if (needsUpdate) {
        await Class.findByIdAndUpdate(existingClass._id, classUpdates)
        return 'updated'
      }
      return 'unchanged'
    }

    await Class.create({
      classId,
      name: `Turma ${classId}`,
      description: `Turma sincronizada da Hotmart em ${now.toLocaleDateString('pt-PT')}`,
      source: 'hotmart_sync',
      isActive: true,
      estado: 'ativo',
      studentCount,
      lastSyncAt: now,
      createdAt: now,
    })
    return 'created'
  }

  async recountClassStudents(classId: string, now: Date): Promise<void> {
    const activeStudents = await User.countDocuments({
      classId,
      'combined.status': 'ACTIVE',
      'inactivation.isManuallyInactivated': { $ne: true },
    })
    await Class.findOneAndUpdate({ classId }, { studentCount: activeStudents, lastSyncAt: now })
  }

  async completeClassSync(ref: SyncRecordRef, stats: SyncStats, errors: string[], now: Date): Promise<void> {
    await SyncHistory.findByIdAndUpdate(ref.id, {
      status: 'completed',
      completedAt: now,
      'metadata.currentStep': 'Sincronização de turmas concluída',
      'metadata.progress': 100,
      stats,
      errorDetails: errors.length > 0 ? errors : undefined,
    })
  }

  async failClassSync(ref: SyncRecordRef, message: string, now: Date): Promise<void> {
    await SyncHistory.findByIdAndUpdate(ref.id, {
      status: 'failed',
      completedAt: now,
      'metadata.currentStep': 'Erro na sincronização de turmas',
      stats: { total: 0, added: 0, updated: 0, conflicts: 0, errors: 1 },
      errorDetails: [message],
    })
  }

  // ---------- checkAndUpdateClassHistory ----------
  async loadLocalUsersBasic(): Promise<LocalUserBasic[]> {
    return User.find({}, '_id email classId').lean() as unknown as LocalUserBasic[]
  }

  async moveUserAndLogHistory(localUser: LocalUserBasic, newClassId: string | null, now: Date): Promise<void> {
    await User.findByIdAndUpdate(localUser._id, {
      classId: newClassId,
      'metadata.updatedAt': now,
    })

    let className = 'Nome não disponível'
    if (newClassId) {
      const classData = await Class.findOne({ classId: newClassId })
      className = classData?.name || `Turma ${newClassId}`
    }

    await StudentClassHistory.create({
      studentId: localUser._id,
      classId: newClassId,
      className,
      dateMoved: now,
      reason: 'Mudança detectada via sincronização Hotmart',
      movedBy: 'checkAndUpdateClassHistory',
    })
  }

  // ---------- syncComplete ----------
  async startCompleteSync(now: Date): Promise<SyncRecordRef> {
    const record = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: now,
      stats: { total: 0, added: 0, updated: 0, conflicts: 0, errors: 0 },
      metadata: {
        currentStep: 'Iniciando sincronização completa...',
        progress: 0,
        totalPages: 0,
        processedUsers: 0,
        apiVersion: 'v1',
        requestId: `sync_${now.getTime()}`,
      },
    })
    return { id: record._id }
  }

  async loadLocalUsersForCompleteSync(): Promise<Map<string, CompleteLocalUser>> {
    const localUsers = (await User.find(
      {},
      '_id email classId hotmartUserId status',
    ).lean()) as unknown as CompleteLocalUser[]
    const map = new Map<string, CompleteLocalUser>()
    localUsers.forEach((user) => {
      map.set(user.email, user)
    })
    return map
  }

  /**
   * Applies one user's changes. Returns whether the class changed (for the
   * conflicts counter) plus any per-user errors collected without aborting —
   * matching the controller's internal try/catch around history and update.
   */
  async applyUserSync(
    localUser: CompleteLocalUser,
    hotmartUser: HotmartClubUser,
    now: Date,
  ): Promise<{ classChanged: boolean; errors: string[] }> {
    const errors: string[] = []
    let userNeedsUpdate = false
    const userUpdates: UpdateQuery<IUser> = {}
    let classHistory: Parameters<typeof StudentClassHistory.create>[0] | null = null

    const currentClassId = localUser.combined?.classId || localUser.classId || null
    let classChanged = false

    if (currentClassId !== hotmartUser.class_id) {
      userUpdates['combined.classId'] = hotmartUser.class_id
      userNeedsUpdate = true
      classChanged = true

      try {
        const newClassData = await Class.findOne({ classId: hotmartUser.class_id })
        const newClassName = newClassData?.name || `Turma ${hotmartUser.class_id || 'Indefinida'}`
        const oldClassData = currentClassId ? await Class.findOne({ classId: currentClassId }) : null
        const oldClassName = oldClassData?.name || `Turma ${currentClassId || 'Indefinida'}`

        classHistory = {
          studentId: localUser._id,
          classId: hotmartUser.class_id,
          className: newClassName,
          previousClassId: currentClassId,
          previousClassName: oldClassName,
          dateMoved: now,
          reason: 'Mudança detectada via sincronização completa Hotmart',
          movedBy: 'complete_sync',
        }
      } catch (historyError: unknown) {
        errors.push(`Erro ao criar histórico para ${hotmartUser.email}: ${errorMessage(historyError)}`)
      }
    }

    const currentHotmartId = localUser.hotmart?.hotmartUserId
    const currentStatus = localUser.combined?.status || localUser.hotmart?.status

    if (currentHotmartId !== hotmartUser.user_id) {
      userUpdates['hotmart.hotmartUserId'] = hotmartUser.user_id
      userNeedsUpdate = true
    }

    if (currentStatus !== (hotmartUser.status || 'INACTIVE')) {
      userUpdates['combined.status'] = hotmartUser.status || 'INACTIVE'
      userNeedsUpdate = true
    }

    const currentPurchaseDate = localUser.hotmart?.purchaseDate
    const purchaseDate = hotmartUser.purchase_date ? new Date(hotmartUser.purchase_date * 1000) : null
    if (currentPurchaseDate?.getTime() !== purchaseDate?.getTime()) {
      userUpdates['hotmart.purchaseDate'] = purchaseDate
      userNeedsUpdate = true
    }

    if (userNeedsUpdate) {
      try {
        await User.findByIdAndUpdate(localUser._id, { ...userUpdates, lastSyncAt: now })
        if (classHistory) await StudentClassHistory.create(classHistory)
      } catch (updateError: unknown) {
        errors.push(`Erro ao atualizar utilizador ${hotmartUser.email}: ${errorMessage(updateError)}`)
      }
    }

    return { classChanged, errors }
  }

  async syncCompleteClass(classId: string, studentCount: number, now: Date): Promise<ClassUpsertOutcome> {
    const existingClass = await Class.findOne({ classId })

    if (existingClass) {
      const classUpdates: UpdateQuery<IClass> = { lastSyncAt: now, source: 'hotmart_sync' }
      let needsUpdate = false
      if (existingClass.studentCount !== studentCount) {
        classUpdates.studentCount = studentCount
        needsUpdate = true
      }
      if (needsUpdate) {
        await Class.findByIdAndUpdate(existingClass._id, classUpdates)
        return 'updated'
      }
      return 'unchanged'
    }

    await Class.create({
      classId,
      name: `Turma ${classId}`,
      description: `Turma sincronizada da Hotmart via sincronização completa em ${now.toLocaleDateString('pt-PT')}`,
      source: 'hotmart_sync',
      isActive: true,
      estado: 'ativo',
      studentCount,
      lastSyncAt: now,
      createdAt: now,
      metadata: { autoCreated: true, initialStudentCount: studentCount, syncSource: 'complete_sync' },
    })
    return 'created'
  }

  async completeCompleteSync(ref: SyncRecordRef, stats: SyncStats, errors: string[], now: Date): Promise<void> {
    await SyncHistory.findByIdAndUpdate(ref.id, {
      status: 'completed',
      completedAt: now,
      stats,
      'metadata.currentStep': 'Sincronização completa finalizada!',
      'metadata.progress': 100,
      errorDetails: errors.length > 0 ? errors : undefined,
    })
  }

  async failCompleteSync(ref: SyncRecordRef, message: string, now: Date): Promise<void> {
    await SyncHistory.findByIdAndUpdate(ref.id, {
      status: 'failed',
      completedAt: now,
      'metadata.currentStep': 'Erro na sincronização completa',
      'metadata.progress': 0,
      stats: { total: 0, added: 0, updated: 0, conflicts: 0, errors: 1 },
      errorDetails: [message],
    })
  }
}
