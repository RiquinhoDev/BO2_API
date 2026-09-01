import type { NextFunction, Request, Response } from 'express'
import { getSchedulerStatus } from '../../src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller'
import syncSchedulerService from '../../src/services/cron/scheduler'

test('scheduler status reports the real registry state when the global switch skipped startup', async () => {
  jest.spyOn(syncSchedulerService, 'getActiveJobs').mockResolvedValue([])
  jest.spyOn(syncSchedulerService, 'isSchedulerActive').mockReturnValue(false)
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })

  await getSchedulerStatus(
    {} as Request,
    { status } as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(status).toHaveBeenCalledWith(200)
  expect(json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: expect.objectContaining({ schedulerRunning: false }),
  }))
})
