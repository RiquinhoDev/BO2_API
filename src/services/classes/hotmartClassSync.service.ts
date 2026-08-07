import logger from '../../utils/logger'
import { HotmartNotConfiguredError, type HotmartClubClient, type HotmartClubUser } from './hotmartClubClient'
import type { Sleeper } from './sleeper'

export interface Clock {
  now(): Date
}

export interface SyncRecordRef {
  id: unknown
}

export interface SyncStats {
  total: number
  added: number
  updated: number
  conflicts: number
  errors: number
}

export interface LocalUserBasic {
  _id: unknown
  email?: string
  classId?: string
  combined?: { classId?: string; status?: string }
}

export interface CompleteLocalUser {
  _id: unknown
  email: string
  classId?: string
  combined?: { classId?: string; status?: string }
  hotmart?: { hotmartUserId?: string; status?: string; purchaseDate?: Date }
}

export type ClassUpsertOutcome = 'created' | 'updated' | 'unchanged'

/**
 * Writer port for the vertical: the service depends on this interface, and
 * MongooseHotmartClassSyncWriter implements it. Every method owns Mongoose I/O.
 */
export interface HotmartClassSyncWriter {
  startClassSync(now: Date): Promise<SyncRecordRef>
  updateSyncStep(ref: SyncRecordRef, step: string, progress: number): Promise<void>
  upsertSyncedClass(classId: string, studentCount: number, now: Date): Promise<ClassUpsertOutcome>
  recountClassStudents(classId: string, now: Date): Promise<void>
  completeClassSync(ref: SyncRecordRef, stats: SyncStats, errors: string[], now: Date): Promise<void>
  failClassSync(ref: SyncRecordRef, message: string, now: Date): Promise<void>
  loadLocalUsersBasic(): Promise<LocalUserBasic[]>
  moveUserAndLogHistory(localUser: LocalUserBasic, newClassId: string | null, now: Date): Promise<void>
  startCompleteSync(now: Date): Promise<SyncRecordRef>
  loadLocalUsersForCompleteSync(): Promise<Map<string, CompleteLocalUser>>
  applyUserSync(
    localUser: CompleteLocalUser,
    hotmartUser: HotmartClubUser,
    now: Date,
  ): Promise<{ classChanged: boolean; errors: string[] }>
  syncCompleteClass(classId: string, studentCount: number, now: Date): Promise<ClassUpsertOutcome>
  completeCompleteSync(ref: SyncRecordRef, stats: SyncStats, errors: string[], now: Date): Promise<void>
  failCompleteSync(ref: SyncRecordRef, message: string, now: Date): Promise<void>
}

const PAGE_DELAY_MS = 200

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface ClassSyncStats {
  totalProcessed: number
  newClassesCreated: number
  existingClassesUpdated: number
  classesInactivated: number
  studentsUpdated: number
  errors: string[]
}

export interface SyncClassesResult {
  stats: ClassSyncStats
  classIds: string[]
  timestamp: string
}

export interface CheckHistoryResult {
  stats: {
    pagesProcessed: number
    usersProcessed: number
    changesDetected: number
    localUsersTotal: number
    errors: number
  }
  errors: string[] | undefined
}

export interface CompleteSyncResult {
  stats: { total: number; added: number; updated: number; conflicts: number; errors: number }
  syncId: unknown
  timestamp: string
}

export class HotmartClassSyncService {
  constructor(
    private readonly writer: HotmartClassSyncWriter,
    private readonly client: HotmartClubClient,
    private readonly sleeper: Sleeper,
    private readonly clock: Clock,
  ) {}

  async syncClasses(): Promise<SyncClassesResult> {
    if (!this.client.isConfigured()) throw this.notConfigured()

    let ref: SyncRecordRef | null = null
    try {
      ref = await this.writer.startClassSync(this.clock.now())
      const accessToken = await this.client.getAccessToken()

      const uniqueClassIds = new Set<string>()
      const classStudentCount: Record<string, number> = {}
      let nextPageToken: string | null = null
      let pageCount = 0

      do {
        pageCount++
        await this.writer.updateSyncStep(ref, `Buscando turmas - Página ${pageCount}`, pageCount * 10)

        const page = await this.client.fetchUsersPage(accessToken, nextPageToken)
        page.users.forEach((user) => {
          if (user.class_id && user.class_id.trim()) {
            const classId = user.class_id.trim()
            uniqueClassIds.add(classId)
            classStudentCount[classId] = (classStudentCount[classId] || 0) + 1
          }
        })

        nextPageToken = page.nextPageToken
        await this.sleeper.wait(PAGE_DELAY_MS)
      } while (nextPageToken)

      let totalProcessed = 0
      let newClassesCreated = 0
      let existingClassesUpdated = 0
      const errors: string[] = []

      for (const classId of uniqueClassIds) {
        try {
          const outcome = await this.writer.upsertSyncedClass(classId, classStudentCount[classId] || 0, this.clock.now())
          this.tally(outcome, () => newClassesCreated++, () => existingClassesUpdated++)
          totalProcessed++
        } catch (classError: unknown) {
          errors.push(`Erro ao processar turma ${classId}: ${errorMessage(classError)}`)
        }
      }

      await this.writer.updateSyncStep(ref, 'Verificando turmas inativas...', 85)
      await this.writer.updateSyncStep(ref, 'Atualizando contadores finais...', 95)

      for (const classId of uniqueClassIds) {
        try {
          await this.writer.recountClassStudents(classId, this.clock.now())
        } catch (countError: unknown) {
          logger.warn('Erro ao atualizar contador da turma', { classId, error: errorMessage(countError) })
        }
      }

      const stats: ClassSyncStats = {
        totalProcessed,
        newClassesCreated,
        existingClassesUpdated,
        classesInactivated: 0,
        studentsUpdated: 0,
        errors,
      }

      await this.writer.completeClassSync(
        ref,
        { total: totalProcessed, added: newClassesCreated, updated: existingClassesUpdated, conflicts: 0, errors: errors.length },
        errors,
        this.clock.now(),
      )

      return { stats, classIds: Array.from(uniqueClassIds), timestamp: this.clock.now().toISOString() }
    } catch (error: unknown) {
      if (ref) await this.writer.failClassSync(ref, errorMessage(error), this.clock.now())
      throw error
    }
  }

  async checkHistory(): Promise<CheckHistoryResult> {
    if (!this.client.isConfigured()) throw this.notConfigured()

    const accessToken = await this.client.getAccessToken()
    const localUsers = await this.writer.loadLocalUsersBasic()

    let changesDetected = 0
    let usersProcessed = 0
    let pagesProcessed = 0
    const errors: string[] = []
    let nextPageToken: string | null = null

    do {
      pagesProcessed++
      try {
        const page = await this.client.fetchUsersPage(accessToken, nextPageToken)
        const items = page.users

        if (Array.isArray(items) && items.length > 0) {
          for (const hotmartUser of items) {
            try {
              usersProcessed++
              const hotmartEmail = hotmartUser.email
              if (!hotmartEmail) continue

              const localUser = localUsers.find(
                (user) => user.email && user.email.toLowerCase() === hotmartEmail.toLowerCase(),
              )

              if (localUser) {
                const currentClassId = localUser.combined?.classId || localUser.classId || null
                const newClassId = hotmartUser.class_id || null
                if (currentClassId !== newClassId) {
                  changesDetected++
                  await this.writer.moveUserAndLogHistory(localUser, newClassId, this.clock.now())
                }
              }
            } catch (userError: unknown) {
              errors.push(`Erro ao processar utilizador ${hotmartUser.email || 'desconhecido'}: ${errorMessage(userError)}`)
            }
          }
        }

        nextPageToken = page.nextPageToken
        if (nextPageToken) await this.sleeper.wait(PAGE_DELAY_MS)
      } catch (pageError: unknown) {
        errors.push(`Erro ao processar página ${pagesProcessed}: ${errorMessage(pageError)}`)
        nextPageToken = null
      }
    } while (nextPageToken)

    return {
      stats: {
        pagesProcessed,
        usersProcessed,
        changesDetected,
        localUsersTotal: localUsers.length,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    }
  }

  async completeSync(): Promise<CompleteSyncResult> {
    if (!this.client.isConfigured()) throw this.notConfigured()

    let ref: SyncRecordRef | null = null
    try {
      ref = await this.writer.startCompleteSync(this.clock.now())

      await this.writer.updateSyncStep(ref, 'Obtendo token de acesso...', 5)
      const accessToken = await this.client.getAccessToken()

      await this.writer.updateSyncStep(ref, 'Carregando utilizadores locais...', 10)
      const localUserMap = await this.writer.loadLocalUsersForCompleteSync()

      let totalProcessed = 0
      let pagesProcessed = 0
      let classChangesDetected = 0
      const uniqueClassIds = new Set<string>()
      const classStudentCount: Record<string, number> = {}
      const errors: string[] = []
      let nextPageToken: string | null = null

      do {
        pagesProcessed++
        await this.writer.updateSyncStep(ref, `Processando página ${pagesProcessed}...`, 15 + pagesProcessed * 2)

        try {
          const page = await this.client.fetchUsersPage(accessToken, nextPageToken)
          for (const hotmartUser of page.users) {
            if (!hotmartUser.email) continue
            totalProcessed++

            if (hotmartUser.class_id) {
              uniqueClassIds.add(hotmartUser.class_id)
              classStudentCount[hotmartUser.class_id] = (classStudentCount[hotmartUser.class_id] || 0) + 1
            }

            const localUser = localUserMap.get(hotmartUser.email)
            if (localUser) {
              const result = await this.writer.applyUserSync(localUser, hotmartUser, this.clock.now())
              if (result.classChanged) classChangesDetected++
              errors.push(...result.errors)
            }
          }

          nextPageToken = page.nextPageToken
          await this.sleeper.wait(PAGE_DELAY_MS)
        } catch (pageError: unknown) {
          errors.push(`Erro na página ${pagesProcessed}: ${errorMessage(pageError)}`)
          break
        }
      } while (nextPageToken && pagesProcessed < 1000)

      await this.writer.updateSyncStep(ref, 'Sincronizando turmas...', 80)

      let newClassesCreated = 0
      let existingClassesUpdated = 0
      for (const classId of uniqueClassIds) {
        try {
          const outcome = await this.writer.syncCompleteClass(classId, classStudentCount[classId] || 0, this.clock.now())
          this.tally(outcome, () => newClassesCreated++, () => existingClassesUpdated++)
        } catch (classError: unknown) {
          errors.push(`Erro ao processar turma ${classId}: ${errorMessage(classError)}`)
        }
      }

      const stats = {
        total: totalProcessed,
        added: newClassesCreated,
        updated: existingClassesUpdated,
        conflicts: classChangesDetected,
        errors: errors.length,
      }

      await this.writer.completeCompleteSync(ref, stats, errors, this.clock.now())

      return { stats, syncId: ref.id, timestamp: this.clock.now().toISOString() }
    } catch (error: unknown) {
      if (ref) await this.writer.failCompleteSync(ref, errorMessage(error), this.clock.now())
      throw error
    }
  }

  private tally(outcome: ClassUpsertOutcome, onCreated: () => void, onUpdated: () => void): void {
    if (outcome === 'created') onCreated()
    else if (outcome === 'updated') onUpdated()
  }

  private notConfigured(): Error {
    return new HotmartNotConfiguredError()
  }
}
