import express, { Router } from 'express'
import request from 'supertest'
import {
  appForCentralError,
  expectCentralError,
  type CentralErrorRoute,
} from '../support/centralErrorContract'

const secret = new Error('secret alice@example.test token=hidden')
const offline = '?__bo2_offline_loopback=1'

describe('SEC-10 central error contract harness', () => {
  const routes: readonly [string, CentralErrorRoute, string][] = [
    [
      'an async handler',
      { kind: 'handler', method: 'get', path: '/target', handler: () => { throw secret } },
      '/target',
    ],
    [
      'an Express router',
      {
        kind: 'router',
        mountPath: '/target',
        router: (() => {
          const router = Router()
          router.get('/', () => { throw secret })
          return router
        })(),
      },
      '/target/',
    ],
  ]

  it.each(routes)('mounts %s behind the central error boundary', async (_name, route, path) => {
    const response = await request(appForCentralError(route)).get(path + offline)

    expectCentralError(response, {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    })
  })

  it('uses the supplied deterministic correlation ID', async () => {
    const response = await request(appForCentralError({
      kind: 'handler',
      handler: () => { throw secret },
    }, 'sec10-deterministic-request')).get('/target' + offline)

    expectCentralError(response, {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
      correlationId: 'sec10-deterministic-request',
    })
  })
})
