 // src/middleware/errorHandler.ts - Middleware de tratamento de erros
 import { Request, Response, NextFunction } from 'express'
 import { ResponseHelper } from '../utils/responseHelpers'
 
 export interface AppError extends Error {
   statusCode?: number
   isOperational?: boolean
 }
 
 export const errorHandler = (
   err: AppError,
   req: Request,
   res: Response,
   next: NextFunction
 ) => {
   console.error('Error:', err)
 
   // Erro de validação do Mongoose
   if (err.name === 'ValidationError') {
     const errors = Object.values((err as any).errors).map((e: any) => e.message)
     return ResponseHelper.badRequest(res, 'Dados inválidos', errors)
   }
 
   // Erro de cast do Mongoose (ID inválido)
   if (err.name === 'CastError') {
     return ResponseHelper.badRequest(res, 'ID inválido fornecido')
   }
 
   // Erro de duplicação (unique constraint)
   if ((err as any).code === 11000) {
     const field = Object.keys((err as any).keyValue)[0]
     return ResponseHelper.conflict(res, `${field} já existe`)
   }
 
   // Erro customizado
   if (err.isOperational) {
     return ResponseHelper.error(res, err.message, err.statusCode || 500)
   }
 
   // Erro interno do servidor
   return ResponseHelper.error(res, 'Erro interno do servidor', 500)
 }
 