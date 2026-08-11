import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import {
  findHotmartProductBySubdomain,
  getHotmartStatsSnapshot,
  listHotmartProducts,
  listHotmartProductUsers
} from '../../services/hotmart/hotmartCatalog.service'

function forwardHotmartError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}
export async function getHotmartProducts(_req: Request, res: Response, next: NextFunction) {
  try {
    const products = await listHotmartProducts()
    res.json(successResponse(products, { count: products.length, _v2Enabled: true }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao buscar produtos Hotmart', 'HOTMART_PRODUCT_LIST_FAILED')
  }
}

export async function getHotmartProductBySubdomain(req: Request<{ subdomain: string }>, res: Response, next: NextFunction) {
  try {
    const { subdomain } = req.params
    const product = await findHotmartProductBySubdomain(subdomain)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}`
      })
    }

    return res.json(successResponse(product, { _v2Enabled: true }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao buscar produto Hotmart', 'HOTMART_PRODUCT_READ_FAILED')
  }
}

export async function getHotmartProductUsers(req: Request<{ subdomain: string }>, res: Response, next: NextFunction) {
  try {
    const { subdomain } = req.params
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const minProgress = typeof req.query.minProgress === 'string'
      ? req.query.minProgress
      : undefined
    const users = await listHotmartProductUsers(subdomain, { status, minProgress })

    if (!users) {
      return res.status(404).json({
        success: false,
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}`
      })
    }

    return res.json(successResponse(users, {
      count: users.length,
      filters: { status, minProgress },
      _v2Enabled: true
    }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao buscar utilizadores Hotmart', 'HOTMART_PRODUCT_USERS_READ_FAILED')
  }
}

export async function getHotmartStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const { stats, summary } = await getHotmartStatsSnapshot()
    res.json(successResponse(stats, { summary, _v2Enabled: true }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao buscar estatísticas Hotmart', 'HOTMART_STATS_READ_FAILED')
  }
}
