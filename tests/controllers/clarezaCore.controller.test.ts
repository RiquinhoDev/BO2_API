import type { NextFunction, Request, Response } from 'express'

import { createClarezaCoreController } from '../../src/controllers/clarezaCore.controller'
import { CoreGenerationUnavailableError } from '../../src/services/clareza/core/coreRadarProjection'

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() } as unknown as Response
  ;(response.status as jest.Mock).mockReturnValue(response)
  return response
}

describe('Clareza published core controller', () => {
  it('serves Radar and portfolio analysis with public cache policies', async () => {
    const dependencies = {
      radar: jest.fn().mockResolvedValue({ generationId: 'g1', stocks: [] }),
      carteira: jest.fn(),
      portfolioAnalysis: jest.fn().mockResolvedValue({ generationId: 'g1', results: {}, missing: [] }),
      search: jest.fn().mockResolvedValue({ query: 'AAPL', count: 1, results: [] }),
      raiox: jest.fn().mockResolvedValue({ generationId: 'g1', ticker: 'AAPL' }),
      raioxSearch: jest.fn().mockResolvedValue({ query: 'APP', count: 1, results: [] }),
      comparador: jest.fn().mockResolvedValue({ generationId: 'g1', count: 1, companies: [] }),
      comparadorSearch: jest.fn().mockResolvedValue({ query: 'APP', count: 1, results: [] }),
      earnings: jest.fn().mockResolvedValue({ generationId: 'g1', earnings: [] }),
      top10: jest.fn().mockResolvedValue({ generationId: 'g1', stocks: {} }),
    }
    const controller = createClarezaCoreController(dependencies)
    const radarResponse = responseDouble()
    const analysisResponse = responseDouble()

    await controller.radar({} as Request, radarResponse, jest.fn())
    await controller.portfolioAnalysis({ query: { symbols: 'AAPL' } } as unknown as Request, analysisResponse, jest.fn())

    expect(radarResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600')
    expect(radarResponse.json).toHaveBeenCalledWith({ generationId: 'g1', stocks: [] })
    expect(dependencies.portfolioAnalysis).toHaveBeenCalledWith('AAPL')
    expect(analysisResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600')
    const searchResponse = responseDouble()
    await controller.search({ query: { q: 'aapl' } } as unknown as Request, searchResponse, jest.fn())
    expect(dependencies.search).toHaveBeenCalledWith('aapl')
    expect(searchResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=600')
    const raioxResponse = responseDouble()
    await controller.raiox({ query: { symbol: 'aapl' } } as unknown as Request, raioxResponse, jest.fn())
    expect(dependencies.raiox).toHaveBeenCalledWith('aapl')
    expect(raioxResponse.json).toHaveBeenCalledWith({ generationId: 'g1', ticker: 'AAPL' })
  })

  it('maps missing generations to 503 and invalid symbols to 400', async () => {
    const next = jest.fn() as NextFunction
    const unavailable = createClarezaCoreController({
      radar: jest.fn().mockRejectedValue(new CoreGenerationUnavailableError()),
      carteira: jest.fn(), portfolioAnalysis: jest.fn(),
      search: jest.fn(),
      raiox: jest.fn(), raioxSearch: jest.fn(),
      comparador: jest.fn(), comparadorSearch: jest.fn(),
      earnings: jest.fn(),
      top10: jest.fn(),
    })
    const invalid = createClarezaCoreController({
      radar: jest.fn(), carteira: jest.fn(),
      portfolioAnalysis: jest.fn().mockRejectedValue(new RangeError('invalid')),
      search: jest.fn(),
      raiox: jest.fn(), raioxSearch: jest.fn(),
      comparador: jest.fn(), comparadorSearch: jest.fn(),
      earnings: jest.fn(),
      top10: jest.fn(),
    })
    const unavailableResponse = responseDouble()
    const invalidResponse = responseDouble()

    await unavailable.radar({} as Request, unavailableResponse, next)
    await invalid.portfolioAnalysis({ query: {} } as Request, invalidResponse, next)

    expect(unavailableResponse.status).toHaveBeenCalledWith(503)
    expect(invalidResponse.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })
})
