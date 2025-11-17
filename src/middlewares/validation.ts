// src/middleware/validation.ts - Middleware de validação
import { Request, Response, NextFunction } from 'express'
import { body, query, param, validationResult } from 'express-validator'

export const validateSearchStudent = [
  query('email').optional().isEmail().withMessage('Email inválido'),
  query('name').optional().isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
  query('discordId').optional().matches(/^\d{17,19}$/).withMessage('Discord ID deve ter entre 17-19 dígitos'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Dados de pesquisa inválidos',
        errors: errors.array() 
      })
    }
    
    // Verificar se pelo menos um critério foi fornecido
    const { email, name, discordId } = req.query
    if (!email && !name && !discordId) {
      return res.status(400).json({
        message: 'Pelo menos um critério de pesquisa é necessário (email, name, ou discordId)'
      })
    }
    
    next()
  }
]

export const validateEditStudent = [
  param('id').isMongoId().withMessage('ID do estudante inválido'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('name').optional().isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
  body('discordIds').optional().isArray().withMessage('Discord IDs deve ser um array'),
  body('discordIds.*').optional().matches(/^\d{17,19}$/).withMessage('Discord ID deve ter entre 17-19 dígitos'),
  body('classId').optional().isString().withMessage('ID da turma deve ser uma string'),
  body('status').optional().isIn(['ACTIVE', 'BLOCKED', 'BLOCKED_BY_OWNER', 'OVERDUE']).withMessage('Status inválido'),
  body('role').optional().isIn(['STUDENT', 'FREE_STUDENT', 'OWNER', 'ADMIN', 'CONTENT_EDITOR', 'MODERATOR']).withMessage('Papel inválido'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Dados de atualização inválidos',
        errors: errors.array() 
      })
    }
    next()
  }
]

export const validateMoveStudent = [
  body('studentId').isMongoId().withMessage('ID do estudante inválido'),
  body('toClassId').isString().notEmpty().withMessage('ID da turma de destino é obrigatório'),
  body('fromClassId').optional().isString(),
  body('reason').optional().isString().isLength({ max: 500 }).withMessage('Motivo não pode exceder 500 caracteres'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Dados de movimentação inválidos',
        errors: errors.array() 
      })
    }
    next()
  }
]

export const validateMoveMultipleStudents = [
  body('studentIds').isArray({ min: 1 }).withMessage('Pelo menos um estudante deve ser selecionado'),
  body('studentIds.*').isMongoId().withMessage('ID de estudante inválido'),
  body('toClassId').isString().notEmpty().withMessage('ID da turma de destino é obrigatório'),
  body('reason').optional().isString().isLength({ max: 500 }).withMessage('Motivo não pode exceder 500 caracteres'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Dados de movimentação múltipla inválidos',
        errors: errors.array() 
      })
    }
    next()
  }
]