import type { NextFunction, RequestHandler, Response } from 'express'

import TagRule from '../../models/acTags/TagRule'
import type { ActiveCampaignTagRuleDeleteInput } from '../../security/activeCampaignDestructiveInput'
import { internalError } from '../../security/errorHandling'
import type { ValidatedRequest } from '../../security/validatedInput'
import logger from '../../utils/logger'


export const getAllTagRules: RequestHandler = async (_req, res, next) => {
  try {
    logger.info('🏷️ Buscando tag rules...')

    const rules = await TagRule.find()
      .populate('courseId', 'name code')  // ✅ Adicionar "code"
      .sort({ priority: -1 })

    logger.info(`✅ ${rules.length} regras encontradas`)

    res.json({
      success: true,
      count: rules.length,
      data: rules  // ✅ MUDAR DE "rules" PARA "data"
    })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao buscar tag rules:', error)
    next(internalError('Erro ao buscar regras', 'AC_LEGACY_TAG_RULE_LIST_FAILED', error))
    return
  }
}
/**
 * POST /api/tag-rules
 */
export const createTagRule: RequestHandler = async (req, res, next) => {
  try {
    logger.info('➕ Criando tag rule:', req.body)

    const rule = new TagRule(req.body)
    await rule.save()

    logger.info(`✅ Regra criada: ${rule._id}`)

    res.json({ success: true, rule })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao criar tag rule:', error)
    next(internalError('Erro ao criar regra', 'AC_LEGACY_TAG_RULE_CREATE_FAILED', error))
    return
  }
}

/**
 * PUT /api/tag-rules/:id
 */
export const updateTagRule: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    logger.info(`🔄 Atualizando tag rule: ${id}`)

    const rule = await TagRule.findByIdAndUpdate(id, req.body, { new: true })

    if (!rule) {
      res.status(404).json({ success: false, error: 'Regra não encontrada' })
      return
    }

    logger.info(`✅ Regra atualizada: ${rule._id}`)

    res.json({ success: true, rule })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao atualizar tag rule:', error)
    next(internalError('Erro ao atualizar regra', 'AC_LEGACY_TAG_RULE_UPDATE_FAILED', error))
    return
  }
}

/**
 * DELETE /api/tag-rules/:id
 */
export const deleteTagRule = async (
  input: ActiveCampaignTagRuleDeleteInput,
  _req: ValidatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = input.params
    logger.info(`🗑️ Deletando tag rule: ${id}`)

    const rule = await TagRule.findByIdAndDelete(id)

    if (!rule) {
      res.status(404).json({ success: false, error: 'Regra não encontrada' })
      return
    }

    logger.info(`✅ Regra deletada: ${id}`)

    res.json({ success: true, message: 'Regra deletada com sucesso' })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao deletar tag rule:', error)
    next(internalError('Erro ao deletar regra', 'AC_LEGACY_TAG_RULE_DELETE_FAILED', error))
    return
  }
}
