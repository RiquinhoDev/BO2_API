import type { Request, Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { executeHotmartProgressSync } from '../../services/hotmart/hotmartProgressSync.service'

export async function syncProgressOnly(_req: Request, res: Response): Promise<void> {
  const result = await executeHotmartProgressSync()
  if (result.status !== 200) {
    res.status(result.status).json(result.body)
    return
  }
  res.status(200).json(successResponse(result.body.stats ?? null, { message: result.body.message }))
}
