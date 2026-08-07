import type { DiscordInactivationDelegator } from './discordInactivationDelegator'

export interface Clock {
  now(): Date
}

/** Canonical class-write port; the runtime wires it to classMutations upsertClass. */
export interface ClassUpsertPort {
  upsert(input: {
    classId: string
    name: string
    description?: string
    isActive?: boolean
    estado?: 'ativo' | 'inativo'
    source?: string
  }): Promise<{ class: unknown; isNew: boolean; timestamp: string }>
}

export interface InactivationResult {
  classId: string
  success?: false
  error?: string
  studentId?: unknown
  email?: string
  name?: string
  status?: 'success' | 'error'
  className?: string
}

export interface InactivationListView {
  _id: unknown
  name: string
  classNames: string[]
  createdAt: Date
  status: 'COMPLETED'
  studentCount: number
  executedDate: Date
  performedBy?: string
  platforms: string[]
}

export interface ClassSummaryForUpsert {
  name?: string
  description?: string
  source?: string
}

export interface InactivationOptions {
  userId?: string
  description?: string
  platforms: string[]
}

export interface ListFilters {
  status?: unknown
  limit: number
  offset: number
}

export type ClassStatusOutcome =
  | 'not_found'
  | { existingClass: ClassSummaryForUpsert; affectedStudents: number; reactivatedStudents: number }

export interface ClassInactivationWriter {
  inactivateClassStudents(
    classIds: string[],
    options: InactivationOptions,
    now: Date,
  ): Promise<{ results: InactivationResult[]; totalInactivated: number }>
  findClassForUpsert(classId: string): Promise<ClassSummaryForUpsert | null>
  listInactivations(filters: ListFilters): Promise<{ lists: InactivationListView[]; total: number }>
  revertInactivationRecord(id: string, options: { reason?: string; userId?: string }): Promise<'not_found' | 'ok'>
  applyClassStatus(
    classId: string,
    isActive: boolean,
    options: { reason?: string; userId?: string },
    now: Date,
  ): Promise<ClassStatusOutcome>
}

export interface CreateListInput {
  name?: string
  classIds: string[]
  description?: string
  userId?: string
  platforms?: string[]
}

export interface CreateListResult {
  list: {
    _id: string
    name: string
    classIds: string[]
    totalInactivated: number
    totalDiscordUpdates: number
    students: InactivationResult[]
    createdAt: Date
  }
  classUpdates: { successful: number; failed: number; total: number }
  timestamp: string
}

export interface UpdateStatusResult {
  affectedStudents: number
  reactivatedStudents: number
  class: unknown
  message: string
  action: 'reactivated' | 'deactivated'
  timestamp: string
}

export class ClassInactivationService {
  constructor(
    private readonly writer: ClassInactivationWriter,
    private readonly discord: DiscordInactivationDelegator,
    private readonly classUpsert: ClassUpsertPort,
    private readonly clock: Clock,
  ) {}

  async createList(input: CreateListInput): Promise<CreateListResult> {
    const platforms = input.platforms ?? ['all']
    const now = this.clock.now()

    const { results, totalInactivated } = await this.writer.inactivateClassStudents(
      input.classIds,
      { userId: input.userId, description: input.description, platforms },
      now,
    )

    const totalDiscordUpdates = await this.discord.delegate(input.classIds, 'discord-inactivation-bulk')

    const list = {
      _id: now.getTime().toString(),
      name: input.name || `Inativação ${now.toLocaleDateString('pt-PT')}`,
      classIds: input.classIds,
      totalInactivated,
      totalDiscordUpdates,
      students: results,
      createdAt: now,
    }

    const classUpdatePromises = input.classIds.map(async (classId) => {
      try {
        const existingClass = await this.writer.findClassForUpsert(classId)
        if (!existingClass) return { classId, success: false }
        await this.classUpsert.upsert({
          classId,
          name: existingClass.name || classId,
          description: existingClass.description || '',
          isActive: false,
          estado: 'inativo',
          source: existingClass.source || 'manual',
        })
        return { classId, success: true }
      } catch {
        return { classId, success: false }
      }
    })

    const settled = await Promise.allSettled(classUpdatePromises)
    const successful = settled.filter((r) => r.status === 'fulfilled' && r.value.success).length

    return {
      list,
      classUpdates: {
        successful,
        failed: input.classIds.length - successful,
        total: input.classIds.length,
      },
      timestamp: this.clock.now().toISOString(),
    }
  }

  async listInactivations(filters: ListFilters): Promise<{
    lists: InactivationListView[]
    total: number
    timestamp: string
  }> {
    const { lists, total } = await this.writer.listInactivations(filters)
    return { lists, total, timestamp: this.clock.now().toISOString() }
  }

  async revert(
    id: string,
    options: { reason?: string; userId?: string },
  ): Promise<'not_found' | { timestamp: string }> {
    const outcome = await this.writer.revertInactivationRecord(id, options)
    if (outcome === 'not_found') return 'not_found'
    return { timestamp: this.clock.now().toISOString() }
  }

  async updateStatus(
    classId: string,
    isActive: boolean,
    options: { reason?: string; userId?: string },
  ): Promise<'not_found' | UpdateStatusResult> {
    const now = this.clock.now()
    const applied = await this.writer.applyClassStatus(classId, isActive, options, now)
    if (applied === 'not_found') return 'not_found'

    // Discord delegation only runs when deactivating (matches the legacy flow).
    if (!isActive) {
      await this.discord.delegate([classId], 'discord-inactivation-single')
    }

    const result = await this.classUpsert.upsert({
      classId,
      name: applied.existingClass.name || classId,
      description: applied.existingClass.description || '',
      isActive,
      estado: isActive ? 'ativo' : 'inativo',
      source: applied.existingClass.source || 'manual',
    })

    const message = isActive
      ? `Turma ativada com sucesso${applied.reactivatedStudents > 0 ? ` (${applied.reactivatedStudents} estudantes reativados)` : ''}`
      : `Turma inativada com sucesso${applied.affectedStudents > 0 ? ` (${applied.affectedStudents} estudantes inativados)` : ''}`

    return {
      affectedStudents: applied.affectedStudents,
      reactivatedStudents: applied.reactivatedStudents,
      class: result.class,
      message,
      action: isActive ? 'reactivated' : 'deactivated',
      timestamp: now.toISOString(),
    }
  }
}
