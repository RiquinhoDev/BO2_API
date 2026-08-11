import type { Request, Response } from 'express'
import { searchDashboard } from '../../src/controllers/dashboard.controller'

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn() }
  response.status.mockReturnValue(response)
  return response as unknown as Response
}

test('short dashboard searches return the canonical envelope with query metadata', async () => {
  const response = responseDouble()
  const next = jest.fn()

  await searchDashboard({ query: { q: 'a' } } as unknown as Request, response, next)

  expect(response.json).toHaveBeenCalledWith({
    success: true,
    data: [],
    meta: { query: 'a', count: 0 },
  })
  expect(next).not.toHaveBeenCalled()
})
