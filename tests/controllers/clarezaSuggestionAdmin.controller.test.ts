import type { NextFunction, Request, Response } from 'express'

import { createClarezaSuggestionAdminController } from '../../src/controllers/clarezaSuggestionAdmin.controller'

function responseDouble() {
  const response = {
    status: jest.fn(), json: jest.fn(), setHeader: jest.fn(), write: jest.fn(), end: jest.fn(),
  } as unknown as Response
  ;(response.status as jest.Mock).mockReturnValue(response)
  return response
}

describe('Clareza suggestion administration controller', () => {
  it('returns bounded paginated demand in the canonical envelope', async () => {
    const list = jest.fn().mockResolvedValue({ page: 2, pageSize: 25, total: 1, items: [] })
    const controller = createClarezaSuggestionAdminController({ list, exportCsv: jest.fn() })
    const response = responseDouble()

    await controller.list({ query: { page: '2', pageSize: '25' } } as unknown as Request, response, jest.fn())

    expect(list).toHaveBeenCalledWith(2, 25)
    expect(response.json).toHaveBeenCalledWith({
      success: true, data: { page: 2, pageSize: 25, total: 1, items: [] },
    })
  })

  it('exports a bounded attachment and rejects malformed numbers before service access', async () => {
    const exportCsv = jest.fn().mockResolvedValue('"query"\n"VWCE.DE"')
    const list = jest.fn()
    const controller = createClarezaSuggestionAdminController({ list, exportCsv })
    const response = responseDouble()

    await controller.exportCsv({ query: { limit: '250' } } as unknown as Request, response, jest.fn())
    expect(exportCsv).toHaveBeenCalledWith(250)
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8')
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition', 'attachment; filename="clareza-suggestions.csv"',
    )
    expect(response.write).toHaveBeenCalledWith('"query"\n"VWCE.DE"')
    expect(response.end).toHaveBeenCalledWith()

    const invalidResponse = responseDouble()
    await controller.list({ query: { page: '1.5' } } as unknown as Request, invalidResponse, jest.fn())
    expect(list).not.toHaveBeenCalled()
    expect(invalidResponse.status).toHaveBeenCalledWith(400)
  })

  it('forwards unexpected storage errors through the central error boundary', async () => {
    const controller = createClarezaSuggestionAdminController({
      list: jest.fn().mockRejectedValue(new Error('database unavailable')),
      exportCsv: jest.fn(),
    })
    const next = jest.fn() as NextFunction

    await controller.list({ query: {} } as Request, responseDouble(), next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLAREZA_SUGGESTION_ADMIN_FAILED' }))
  })
})
