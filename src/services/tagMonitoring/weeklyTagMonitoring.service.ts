import {
  WeeklyNativeTagSnapshot,
  CriticalTag,
  WeeklyTagMonitoringConfig,
} from '../../models/tagMonitoring'
import { IWeeklyNativeTagSnapshot, TagChanges } from '../../models/tagMonitoring/WeeklyNativeTagSnapshot'
import activeCampaignService from '../activeCampaign/activeCampaignService'
import { classifyTags } from '../activeCampaign/nativeTagProtection.service'
import tagNotificationService, { StudentChange } from './tagNotification.service'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import logger from '../../utils/logger'
import { getStudentsByPriority } from './weekly/studentsByPriority'
import { errorMessage } from '../syncUtilizadoresServices/universalSync/fieldUtils'

interface SnapshotResult {
  success: boolean
  totalStudents: number
  snapshotsCreated: number
  changesDetected: number
  notificationsCreated: number
  duration: string
  errors: number
  mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
}

interface LastWeekStats {
  weekNumber: number
  year: number
  snapshots: number
}

interface SnapshotStats {
  totalSnapshots: number
  uniqueStudents: number
  lastWeek: LastWeekStats
}

interface CriticalChange {
  tagName: string
  changeType: 'ADDED' | 'REMOVED'
  students: StudentChange[]
}

class WeeklyTagMonitoringService {
  private readonly BATCH_SIZE = 50
  private readonly BATCH_DELAY_MS = 1000

  async performWeeklySnapshot(): Promise<SnapshotResult> {
    const startTime = Date.now()
    logger.info('═══════════════════════════════════════════════════════════')
    logger.info('🚀 Iniciando Snapshot Semanal de Tags Nativas')
    logger.info('═══════════════════════════════════════════════════════════')

    try {
      // 1. Buscar configuração
      const config = await WeeklyTagMonitoringConfig.getConfig()
      if (!config.enabled) {
        logger.warn('⚠️  Sistema de monitorização desativado')
        return this.createEmptyResult('STUDENTS_ONLY')
      }

      const mode = config.scope
      logger.info(`📋 Modo: ${mode}`)

      // 2. Buscar emails para processar
      const emailsToProcess = await this.getEmailsToProcess(mode)
      logger.info(`👥 Total de contactos para processar: ${emailsToProcess.length}`)

      if (emailsToProcess.length === 0) {
        logger.warn('⚠️  Nenhum contacto para processar')
        return this.createEmptyResult(mode)
      }

      // 3. Buscar tags críticas ativas
      const criticalTags = await CriticalTag.findActiveTags()
      logger.info(`🏷️  Tags críticas ativas: ${criticalTags.length}`)

      // 4. Processar snapshots em batches
      const {
        snapshotsCreated,
        changes,
        errors,
      } = await this.processSnapshotsBatch(emailsToProcess, criticalTags.map((t) => t.tagName))

      // 5. Criar notificações agrupadas
      const notificationsCreated = await this.createNotifications(changes)

      // 6. Cleanup de snapshots antigos
      await this.cleanupOldSnapshots()

      const duration = this.formatDuration(Date.now() - startTime)
      logger.info('═══════════════════════════════════════════════════════════')
      logger.info('✅ Snapshot Semanal Concluído!')
      logger.info(`⏱️  Duração: ${duration}`)
      logger.info(`📊 Snapshots criados: ${snapshotsCreated}`)
      logger.info(`📈 Mudanças detectadas: ${changes.length}`)
      logger.info(`🔔 Notificações criadas: ${notificationsCreated}`)
      logger.info(`❌ Erros: ${errors}`)
      logger.info('═══════════════════════════════════════════════════════════')

      return {
        success: true,
        totalStudents: emailsToProcess.length,
        snapshotsCreated,
        changesDetected: changes.length,
        notificationsCreated,
        duration,
        errors,
        mode,
      }
    } catch (error: unknown) {
      logger.error('❌ Erro fatal no snapshot semanal:', error)
      throw error
    }
  }

  private async getEmailsToProcess(mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS'): Promise<string[]> {
    if (mode === 'STUDENTS_ONLY') {
      // Buscar TODOS os utilizadores com produtos (ACTIVE ou INACTIVE)
      // Alteração: removido filtro { status: 'ACTIVE' }
      const userProducts = await UserProduct.find()
        .select('userId')
        .lean()

      const userIds = [...new Set(userProducts.map((up) => up.userId.toString()))]

      const users = await User.find({ _id: { $in: userIds } })
        .select('email')
        .lean()

      logger.info(`📊 STUDENTS_ONLY: ${users.length} alunos encontrados (ACTIVE + INACTIVE)`)
      return users.map((u) => u.email).filter(Boolean)
    } else {
      // ALL_CONTACTS: Buscar todos os contactos da ActiveCampaign
      try {
        const allContacts = await activeCampaignService.getAllContacts()
        logger.info(`📊 ALL_CONTACTS: ${allContacts.length} contactos da AC`)
        return allContacts.map((contact) => contact.email).filter(Boolean)
      } catch (error) {
        logger.error('Erro ao buscar contactos da AC, fallback para STUDENTS_ONLY', error)
        // Fallback para STUDENTS_ONLY em caso de erro
        return this.getEmailsToProcess('STUDENTS_ONLY')
      }
    }
  }

  private async processSnapshotsBatch(
    emails: string[],
    criticalTagNames: string[]
  ): Promise<{
    snapshotsCreated: number
    changes: CriticalChange[]
    errors: number
  }> {
    let snapshotsCreated = 0
    let errors = 0
    const changesMap = new Map<string, StudentChange[]>() // Formato: "tagName|ADDED" => students[]

    const currentDate = new Date()
    const weekNumber = this.getWeekNumber(currentDate)
    const year = currentDate.getFullYear()

    logger.info(`📅 Semana ${weekNumber}/${year}`)

    for (let i = 0; i < emails.length; i += this.BATCH_SIZE) {
      const batch = emails.slice(i, i + this.BATCH_SIZE)

      for (const email of batch) {
        try {
          // Capturar snapshot individual
          const result = await this.captureStudentSnapshot(email, weekNumber, year)

          if (!result.success) {
            errors++
            continue
          }
          if (!result.snapshot) continue

          if (result.created) snapshotsCreated++

          // Detectar mudanças críticas
          if (result.changes) {
            await this.detectCriticalChanges(
              email,
              result.changes,
              result.snapshot,
              criticalTagNames,
              changesMap
            )
          }
        } catch (error: unknown) {
          errors++
          logger.error(`Erro ao processar ${email}:`, errorMessage(error))
        }
      }

      // Progresso
      if ((i + this.BATCH_SIZE) % 500 === 0 || i + this.BATCH_SIZE >= emails.length) {
        const processed = Math.min(i + this.BATCH_SIZE, emails.length)
        logger.info(`📊 Progresso: ${processed}/${emails.length} (${((processed / emails.length) * 100).toFixed(1)}%)`)
      }

      // Rate limiting: pause entre batches
      if (i + this.BATCH_SIZE < emails.length) {
        await new Promise((resolve) => setTimeout(resolve, this.BATCH_DELAY_MS))
      }
    }

    // Converter mapa em array de mudanças
    const changes: CriticalChange[] = []
    changesMap.forEach((students, key) => {
      const [tagName, changeType] = key.split('|')
      changes.push({
        tagName,
        changeType: changeType as 'ADDED' | 'REMOVED',
        students,
      })
    })

    return { snapshotsCreated, changes, errors }
  }

  async captureStudentSnapshot(
    email: string,
    weekNumber?: number,
    year?: number
  ): Promise<{
    success: boolean
    snapshot?: IWeeklyNativeTagSnapshot
    created?: boolean
    changes?: TagChanges
  }> {
    try {
      const normalizedEmail = email.trim().toLowerCase()

      // Buscar tags da ActiveCampaign
      const allTags = await activeCampaignService.getContactTagsByEmail(email)

      if (!allTags || allTags.length === 0) {
        logger.debug(`${email} não tem tags na AC`)
      }

      // Classificar tags (BO vs Nativas)
      const { nativeTags } = classifyTags(allTags || [])

      if (nativeTags.length === 0) {
        logger.debug(`${email} não tem tags nativas`)
      }

      // Buscar userId
      const user = await User.findOne({ email: normalizedEmail }).select('_id')
      if (!user) {
        logger.warn(`Utilizador não encontrado na BD: ${normalizedEmail}`)
        return { success: false }
      }

      // Calcular semana e ano
      const currentDate = new Date()
      const currentWeekNumber = weekNumber || this.getWeekNumber(currentDate)
      const currentYear = year || currentDate.getFullYear()

      // Criar ou actualizar o snapshot da identidade semanal de forma convergente.
      const snapshotResult = await WeeklyNativeTagSnapshot.findOneAndUpdate(
        {
          email: normalizedEmail,
          weekNumber: currentWeekNumber,
          year: currentYear,
        },
        {
          $set: {
            email: normalizedEmail,
            userId: user._id,
            nativeTags,
            capturedAt: currentDate,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          includeResultMetadata: true,
        },
      )
      const snapshot = snapshotResult?.value

      if (!snapshot) {
        logger.error(`Snapshot semanal não devolvido para ${normalizedEmail}`)
        return { success: false }
      }

      // Buscar snapshot anterior
      const previousSnapshot = await WeeklyNativeTagSnapshot.findPreviousSnapshot(
        normalizedEmail,
        currentWeekNumber,
        currentYear
      )

      // Comparar com anterior
      let changes: TagChanges | undefined
      if (previousSnapshot) {
        changes = snapshot.compareWith(previousSnapshot)
      }

      return {
        success: true,
        snapshot,
        created: Boolean(snapshotResult.lastErrorObject?.upserted),
        changes,
      }
    } catch (error: unknown) {
      logger.error(`Erro ao capturar snapshot de ${email}:`, errorMessage(error))
      return { success: false }
    }
  }

  private async detectCriticalChanges(
    email: string,
    changes: TagChanges,
    snapshot: IWeeklyNativeTagSnapshot,
    criticalTagNames: string[],
    changesMap: Map<string, StudentChange[]>
  ): Promise<void> {
    const criticalSet = new Set(criticalTagNames)

    // Verificar tags adicionadas
    for (const tag of changes.added) {
      if (criticalSet.has(tag)) {
        const key = `${tag}|ADDED`
        const studentChange = await this.buildStudentChange(email, snapshot)
        if (studentChange) {
          if (!changesMap.has(key)) changesMap.set(key, [])
          changesMap.get(key)!.push(studentChange)
        }
      }
    }

    // Verificar tags removidas
    for (const tag of changes.removed) {
      if (criticalSet.has(tag)) {
        const key = `${tag}|REMOVED`
        const studentChange = await this.buildStudentChange(email, snapshot)
        if (studentChange) {
          if (!changesMap.has(key)) changesMap.set(key, [])
          changesMap.get(key)!.push(studentChange)
        }
      }
    }
  }

  private async buildStudentChange(
    email: string,
    snapshot: IWeeklyNativeTagSnapshot
  ): Promise<StudentChange | null> {
    try {
      const user = await User.findOne({ email }).select('name').lean()
      if (!user) return null

      // Buscar produto principal do aluno
      const userProduct = await UserProduct.findOne({ userId: user._id, status: 'ACTIVE' })
        .populate<{ productId: { name?: string } }>('productId')
        .lean()

      const productName = userProduct?.productId?.name || 'N/A'
      const className = userProduct?.classes?.[0]?.className || undefined

      return {
        email,
        userName: user.name || email,
        product: productName,
        class: className,
        currentTags: snapshot.nativeTags,
      }
    } catch (error) {
      logger.error(`Erro ao construir StudentChange para ${email}:`, error)
      return null
    }
  }

  private async createNotifications(changes: CriticalChange[]): Promise<number> {
    if (changes.length === 0) return 0

    let notificationsCreated = 0
    const currentDate = new Date()
    const weekNumber = this.getWeekNumber(currentDate)
    const year = currentDate.getFullYear()

    for (const change of changes) {
      try {
        const result = await tagNotificationService.createGroupedNotificationWithStatus(
          change.tagName,
          change.changeType,
          weekNumber,
          year,
          change.students
        )
        if (result.created) notificationsCreated++
      } catch (error) {
        logger.error(`Erro ao criar notificação para ${change.tagName} ${change.changeType}:`, error)
      }
    }

    return notificationsCreated
  }

  async cleanupOldSnapshots(): Promise<number> {
    try {
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

      const result = await WeeklyNativeTagSnapshot.deleteMany({
        capturedAt: { $lt: sixMonthsAgo },
      })

      logger.info(`🗑️  Snapshots antigos removidos: ${result.deletedCount}`)
      return result.deletedCount || 0
    } catch (error) {
      logger.error('Erro ao limpar snapshots antigos:', error)
      return 0
    }
  }

  async getSnapshotStats(): Promise<SnapshotStats> {
    try {
      const [totalSnapshots, uniqueStudents, lastWeek] = await Promise.all([
        WeeklyNativeTagSnapshot.countDocuments(),
        WeeklyNativeTagSnapshot.distinct('email'),
        this.getLastWeekStats(),
      ])

      return {
        totalSnapshots,
        uniqueStudents: uniqueStudents.length,
        lastWeek,
      }
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error)
      throw error
    }
  }

  private async getLastWeekStats(): Promise<LastWeekStats> {
    const currentDate = new Date()
    const weekNumber = this.getWeekNumber(currentDate)
    const year = currentDate.getFullYear()
    const snapshots = await WeeklyNativeTagSnapshot.countDocuments({ weekNumber, year })
    return {
      weekNumber,
      year,
      snapshots,
    }
  }
  /**
   * Calcula número da semana do ano (ISO 8601)
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }
  /**
   * Formata duração em formato legível
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes === 0) {
      return `${seconds}s`
    }
    return `${minutes}m ${remainingSeconds}s`
  }
  /**
   * Cria resultado vazio para casos de erro/desativado
   */
  private createEmptyResult(mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS'): SnapshotResult {
    return {
      success: false,
      totalStudents: 0,
      snapshotsCreated: 0,
      changesDetected: 0,
      notificationsCreated: 0,
      duration: '0s',
      errors: 0,
      mode,
    }
  }
  /**
   * Busca alunos que possuem tags de determinadas prioridades
   * GET /api/tag-monitoring/students-by-priority
   */
  async getStudentsByPriority(params: Parameters<typeof getStudentsByPriority>[0]) {
    return getStudentsByPriority(params)
  }
}
export default new WeeklyTagMonitoringService()
