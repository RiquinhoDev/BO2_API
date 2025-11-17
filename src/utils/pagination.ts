import { PAGINATION } from "../config/constants"

// src/utils/pagination.ts - Utilitário para paginação
export interface PaginationOptions {
    page?: number
    limit?: number
    maxLimit?: number
  }
  
  export class PaginationHelper {
    static normalize(options: PaginationOptions) {
      const page = Math.max(1, Number(options.page) || PAGINATION.DEFAULT_PAGE)
      const limit = Math.min(
        options.maxLimit || PAGINATION.MAX_LIMIT,
        Math.max(PAGINATION.MIN_LIMIT, Number(options.limit) || PAGINATION.DEFAULT_LIMIT)
      )
      const skip = (page - 1) * limit
  
      return { page, limit, skip }
    }
  
    static getMetadata(page: number, limit: number, total: number) {
      const pages = Math.ceil(total / limit)
      
      return {
        page,
        limit,
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      }
    }
  }