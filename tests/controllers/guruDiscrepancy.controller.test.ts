import type { NextFunction, Response } from 'express'
import { HttpError } from '../../src/security/errorHandling'
import { createGuruDiscrepancyHandlers } from '../../src/controllers/guruDiscrepancy.controller'
import {
  CurseducaProductUnavailableError,
  type GuruDiscrepancyService,
} from '../../src/services/guru/guruDiscrepancy.service'

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response)

const service = (): GuruDiscrepancyService => ({
  mark: jest.fn(async () => ({
    marked: 1,
    created: 2,
    alreadyMarked: 3,
    skipped: 4,
    noUserProduct: 1,
    details: [],
  })),
})

test('preserves the success envelope and adds the Front-required noUserProduct count', async () => {
  const handlers = createGuruDiscrepancyHandlers(service())
  const res = response()
  const next: NextFunction = jest.fn()

  await handlers.markDiscrepanciesForInactivation(
    { params: {}, query: {}, body: { emails: ['alice@example.test'] } },
    res,
    next,
  )

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    message: '3 UserProduct(s) marcado(s) para inativação (1 marcados, 2 criados)',
    marked: 1,
    created: 2,
    alreadyMarked: 3,
    skipped: 4,
    noUserProduct: 1,
    total: 3,
    details: [],
  })
  expect(next).not.toHaveBeenCalled()
})

test.each([
  [new CurseducaProductUnavailableError(), 'Produto CursEduca não encontrado'],
  [new Error('mongo token=secret'), 'Erro ao marcar discrepâncias'],
])('forwards failures to SEC-10 without a local 500 response', async (failure, publicMessage) => {
  const domain = service()
  jest.mocked(domain.mark).mockRejectedValueOnce(failure)
  const handlers = createGuruDiscrepancyHandlers(domain)
  const res = response()
  const next: NextFunction = jest.fn()

  await handlers.markDiscrepanciesForInactivation(
    { params: {}, query: {}, body: {} },
    res,
    next,
  )

  expect(res.status).not.toHaveBeenCalled()
  const error: unknown = (next as jest.Mock).mock.calls[0][0]
  expect(error).toBeInstanceOf(HttpError)
  if (!(error instanceof HttpError)) throw new Error('expected HttpError')
  expect(error).toMatchObject({
    status: 500,
    code: 'GURU_MARK_DISCREPANCIES_FAILED',
    publicMessage,
  })
  expect(error.publicMessage).not.toContain('secret')
})