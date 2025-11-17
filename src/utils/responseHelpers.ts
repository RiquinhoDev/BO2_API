// src/utils/responseHelpers.ts - Helpers para respostas da API
  import { Response } from 'express'
  
  export interface ApiResponse<T = any> {
    success: boolean
    message: string
    data?: T
    error?: string
    details?: any
    pagination?: {
      page: number
      limit: number
      total: number
      pages: number
      hasNext?: boolean
      hasPrev?: boolean
    }
  }
  
  export class ResponseHelper {
    static success<T>(res: Response, data: T, message = 'Operação realizada com sucesso', statusCode = 200) {
      const response: ApiResponse<T> = {
        success: true,
        message,
        data
      }
      return res.status(statusCode).json(response)
    }
  
    static error(res: Response, message: string, statusCode = 500, details?: any) {
      const response: ApiResponse = {
        success: false,
        message,
        error: message,
        details
      }
      return res.status(statusCode).json(response)
    }
  
    static notFound(res: Response, resource = 'Recurso') {
      return this.error(res, `${resource} não encontrado`, 404)
    }
  
    static badRequest(res: Response, message: string, details?: any) {
      return this.error(res, message, 400, details)
    }
  
    static conflict(res: Response, message: string) {
      return this.error(res, message, 409)
    }
  
    static paginated<T>(
      res: Response, 
      data: T[], 
      pagination: { page: number; limit: number; total: number },
      message = 'Dados recuperados com sucesso'
    ) {
      const pages = Math.ceil(pagination.total / pagination.limit)
      const response: ApiResponse<T[]> = {
        success: true,
        message,
        data,
        pagination: {
          ...pagination,
          pages,
          hasNext: pagination.page < pages,
          hasPrev: pagination.page > 1
        }
      }
      return res.status(200).json(response)
    }
  }