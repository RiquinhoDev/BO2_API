// =====================================================
// 📁 src/controllers/webhooks.controller.ts
// Webhooks do Active Campaign
// =====================================================

import logger from '../utils/logger'
import { NextFunction, Request, Response } from 'express'
import { internalError } from '../security/errorHandling'
import User from '../models/user'

/**
 * Webhook: Email Opened
 * Disparado quando um aluno abre um email
 */
export const emailOpened = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contact, date_time } = req.body
    
    if (!contact?.email) {
      return res.status(400).json({ success: false, message: 'Email inválido' })
    }
    
    const user = await User.findOne({ email: contact.email })
    if (!user) {
      return res.status(404).json({ success: false, message: 'User não encontrado' })
    }
    
    logger.info(`📧 Email aberto: ${contact.email} em ${date_time}`)
    
    res.json({ success: true, message: 'Email opened registered' })
  } catch (error: unknown) {
    next(internalError('Erro ao registar abertura de email', 'AC_WEBHOOK_EMAIL_OPENED_FAILED', error))
  }
}

/**
 * Webhook: Link Clicked
 * Disparado quando um aluno clica num link do email
 */
export const linkClicked = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contact, link } = req.body
    
    if (!contact?.email) {
      return res.status(400).json({ success: false, message: 'Email inválido' })
    }
    
    logger.info(`🖱️  Link clicado: ${contact.email} - ${link}`)
    
    res.json({ success: true, message: 'Link click registered' })
  } catch (error: unknown) {
    next(internalError('Erro ao registar clique em link', 'AC_WEBHOOK_LINK_CLICKED_FAILED', error))
  }
}
