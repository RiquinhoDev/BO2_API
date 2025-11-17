// src/middleware/asyncHandler.ts - Wrapper para funções async
import { Request, Response, NextFunction } from 'express'
  
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}