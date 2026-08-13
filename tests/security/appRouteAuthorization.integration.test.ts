import type { Request, RequestHandler, Response } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'

function authenticatedAs(role: string): RequestHandler {
  return (req, _res, next) => {
    req.user = {
      id: `${role.toLowerCase()}-id`,
      email: `${role.toLowerCase()}@example.test`,
      role,
      permissions: [],
    }
    next()
  }
}

describe('createApp route authorization integration', () => {
  test('blocks ADMIN from a cataloged SUPER_ADMIN route before the handler', async () => {
    const handler = jest.fn((_req: Request, res: Response) => (
      res.status(200).json({ ok: true })
    ))
    const app = createApp({
      authEnforce: true,
      authenticateRequest: authenticatedAs('ADMIN'),
      allowedOrigins: [],
      registerRoutes: (application) => {
        application.post('/api/users/bulkDelete', handler)
      },
    })

    await request(app)
      .post('/api/users/bulkDelete?__bo2_offline_loopback=1')
      .expect(403)

    expect(handler).not.toHaveBeenCalled()
  })
})
