import type { Request, Response } from 'express'
import {
  findHotmartProductBySubdomain,
  getHotmartStatsSnapshot,
  listHotmartProducts,
  listHotmartProductUsers
} from '../../services/hotmart/hotmartCatalog.service'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function getHotmartProducts(_req: Request, res: Response) {
  try {
    const products = await listHotmartProducts()
    res.json({ success: true, data: products, count: products.length, _v2Enabled: true })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

export async function getHotmartProductBySubdomain(req: Request<{ subdomain: string }>, res: Response) {
  try {
    const { subdomain } = req.params
    const product = await findHotmartProductBySubdomain(subdomain)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}`
      })
    }

    return res.json({ success: true, data: product, _v2Enabled: true })
  } catch (error: unknown) {
    return res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

export async function getHotmartProductUsers(req: Request<{ subdomain: string }>, res: Response) {
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

    return res.json({
      success: true,
      data: users,
      count: users.length,
      filters: { status, minProgress },
      _v2Enabled: true
    })
  } catch (error: unknown) {
    return res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

export async function getHotmartStats(_req: Request, res: Response) {
  try {
    const { stats, summary } = await getHotmartStatsSnapshot()
    res.json({ success: true, data: stats, summary, _v2Enabled: true })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}
