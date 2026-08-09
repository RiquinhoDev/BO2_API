import type { Request, Response } from 'express'
import { executeHotmartProgressSync } from '../../services/hotmart/hotmartProgressSync.service'

export async function syncProgressOnly(_req: Request, res: Response): Promise<void> {
  const result = await executeHotmartProgressSync()
  res.status(result.status).json(result.body)
}
