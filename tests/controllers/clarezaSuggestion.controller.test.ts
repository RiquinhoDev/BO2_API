import type { NextFunction, Request, Response } from 'express'

import { createClarezaSuggestionController } from '../../src/controllers/clarezaSuggestion.controller'
import { CoreSuggestionValidationError } from '../../src/services/clareza/core/coreSuggestionService'

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn() } as unknown as Response
  ;(response.status as jest.Mock).mockReturnValue(response)
  return response
}

describe('Clareza suggestion controller', () => {
  it('accepts a new idempotent suggestion using the HTML contract', async () => {
    const submit = jest.fn().mockResolvedValue({ outcome: 'accepted', record: { count: 3 } })
    const handler = createClarezaSuggestionController({ submit })
    const response = responseDouble()
    const next = jest.fn() as NextFunction

    await handler({ body: { q: 'Nvidia Portugal', submissionId: 'submission-id-0001' } } as Request, response, next)

    expect(submit).toHaveBeenCalledWith('Nvidia Portugal', 'submission-id-0001')
    expect(response.status).toHaveBeenCalledWith(202)
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { outcome: 'accepted', record: { count: 3 } },
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns a stable 400 for invalid public input', async () => {
    const submit = jest.fn().mockRejectedValue(new CoreSuggestionValidationError('invalid'))
    const handler = createClarezaSuggestionController({ submit })
    const response = responseDouble()

    await handler({ body: {} } as Request, response, jest.fn())

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith({ error: 'Sugestão inválida.' })
  })
})
