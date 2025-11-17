// =====================================================
// 📁 src/controllers/webhooks.controller.ts
// Webhooks do Active Campaign
// =====================================================

import { Request, Response } from 'express'
import User from '../models/user'

/**
 * Webhook: Email Opened
 * Disparado quando um aluno abre um email
 */
export const emailOpened = async (req: Request, res: Response) => {
  try {
    const { contact, date_time } = req.body
    
    if (!contact?.email) {
      return res.status(400).json({ success: false, message: 'Email inválido' })
    }
    
    const user = await User.findOne({ email: contact.email })
    if (!user) {
      return res.status(404).json({ success: false, message: 'User não encontrado' })
    }
    
    console.log(`📧 Email aberto: ${contact.email} em ${date_time}`)
    
    res.json({ success: true, message: 'Email opened registered' })
  } catch (error: any) {
    console.error('❌ Erro no webhook email-opened:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Webhook: Link Clicked
 * Disparado quando um aluno clica num link do email
 */
export const linkClicked = async (req: Request, res: Response) => {
  try {
    const { contact, link } = req.body
    
    if (!contact?.email) {
      return res.status(400).json({ success: false, message: 'Email inválido' })
    }
    
    console.log(`🖱️  Link clicado: ${contact.email} - ${link}`)
    
    res.json({ success: true, message: 'Link click registered' })
  } catch (error: any) {
    console.error('❌ Erro no webhook link-clicked:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Webhook: Test
 * Endpoint de teste para validar configuração
 */
export const testWebhook = async (req: Request, res: Response) => {
  console.log('🧪 Webhook de teste recebido:', req.body)
  res.json({ success: true, message: 'Test webhook received', data: req.body })
}
