import { CriticalTag, WeeklyNativeTagSnapshot } from '../../models/tagMonitoring'
import { ICriticalTag } from '../../models/tagMonitoring/CriticalTag'
import logger from '../../utils/logger'

/**
 * Serviço de Gestão de Tags Críticas
 * Responsável por CRUD de tags críticas para monitorização
 */
class CriticalTagManagementService {
  /**
   * Adiciona uma tag à lista de tags críticas
   */
  async addCriticalTag(tagName: string, userId: string, description?: string): Promise<ICriticalTag> {
    try {
      // Verificar se já existe
      const existing = await CriticalTag.findOne({ tagName })
      if (existing) {
        if (existing.isActive) {
          throw new Error(`Tag "${tagName}" já está marcada como crítica`)
        }
        // Se existir mas estiver inativa, reativar
        existing.isActive = true
        existing.createdBy = userId as any
        if (description) existing.description = description
        await existing.save()

        logger.info(`Tag crítica reativada: ${tagName}`)
        return existing
      }

      // Criar nova tag crítica
      const criticalTag = await CriticalTag.create({
        tagName: tagName.trim(),
        isActive: true,
        createdBy: userId,
        description: description?.trim(),
      })

      logger.info(`Tag crítica adicionada: ${tagName} por ${userId}`)
      return criticalTag
    } catch (error) {
      logger.error('Erro ao adicionar tag crítica', { tagName, error })
      throw error
    }
  }

  /**
   * Remove uma tag crítica (soft delete - marca como inativa)
   */
  async removeCriticalTag(tagId: string): Promise<void> {
    try {
      const tag = await CriticalTag.findById(tagId)
      if (!tag) {
        throw new Error('Tag crítica não encontrada')
      }

      tag.isActive = false
      await tag.save()

      logger.info(`Tag crítica removida: ${tag.tagName}`)
    } catch (error) {
      logger.error('Erro ao remover tag crítica', { tagId, error })
      throw error
    }
  }

  /**
   * Remove permanentemente uma tag crítica
   */
  async deleteCriticalTag(tagId: string): Promise<void> {
    try {
      const tag = await CriticalTag.findByIdAndDelete(tagId)
      if (!tag) {
        throw new Error('Tag crítica não encontrada')
      }

      logger.info(`Tag crítica deletada permanentemente: ${tag.tagName}`)
    } catch (error) {
      logger.error('Erro ao deletar tag crítica', { tagId, error })
      throw error
    }
  }

  /**
   * Lista todas as tags críticas
   */
  async getCriticalTags(onlyActive: boolean = false): Promise<ICriticalTag[]> {
    try {
      const query = onlyActive ? { isActive: true } : {}
      const tags = await CriticalTag.find(query).sort({ tagName: 1 })
      return tags
    } catch (error) {
      logger.error('Erro ao listar tags críticas', { error })
      throw error
    }
  }

  /**
   * Alterna o estado ativo/inativo de uma tag crítica
   */
  async toggleCriticalTag(tagId: string): Promise<ICriticalTag> {
    try {
      const tag = await CriticalTag.findById(tagId)
      if (!tag) {
        throw new Error('Tag crítica não encontrada')
      }

      await tag.toggle()
      logger.info(`Tag crítica ${tag.isActive ? 'ativada' : 'desativada'}: ${tag.tagName}`)

      return tag
    } catch (error) {
      logger.error('Erro ao alternar tag crítica', { tagId, error })
      throw error
    }
  }

  /**
   * Descobre tags nativas disponíveis nos snapshots recentes
   * Para permitir que admin selecione quais marcar como críticas
   */
  async discoverNativeTagsFromSnapshots(weeksBack: number = 4): Promise<string[]> {
    try {
      // Buscar snapshots das últimas N semanas
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - weeksBack * 7)

      const snapshots = await WeeklyNativeTagSnapshot.find({
        capturedAt: { $gte: cutoffDate },
      }).select('nativeTags')

      // Agregar todas as tags únicas
      const tagsSet = new Set<string>()
      snapshots.forEach((snapshot) => {
        snapshot.nativeTags.forEach((tag) => tagsSet.add(tag))
      })

      const uniqueTags = Array.from(tagsSet).sort()
      logger.info(`Descobertas ${uniqueTags.length} tags nativas únicas nas últimas ${weeksBack} semanas`)

      return uniqueTags
    } catch (error) {
      logger.error('Erro ao descobrir tags nativas', { error })
      throw error
    }
  }

  /**
   * Verifica se uma tag está marcada como crítica
   */
  async isCriticalTag(tagName: string): Promise<boolean> {
    try {
      const tag = await CriticalTag.findOne({ tagName, isActive: true })
      return !!tag
    } catch (error) {
      logger.error('Erro ao verificar tag crítica', { tagName, error })
      return false
    }
  }

  /**
   * Busca uma tag crítica pelo nome
   */
  async findByTagName(tagName: string): Promise<ICriticalTag | null> {
    try {
      return await CriticalTag.findOne({ tagName })
    } catch (error) {
      logger.error('Erro ao buscar tag crítica por nome', { tagName, error })
      throw error
    }
  }

  /**
   * Estatísticas de tags críticas
   */
  async getStats(): Promise<{
    total: number
    active: number
    inactive: number
  }> {
    try {
      const [total, active] = await Promise.all([
        CriticalTag.countDocuments(),
        CriticalTag.countDocuments({ isActive: true }),
      ])

      return {
        total,
        active,
        inactive: total - active,
      }
    } catch (error) {
      logger.error('Erro ao obter estatísticas de tags críticas', { error })
      throw error
    }
  }
}

export default new CriticalTagManagementService()
