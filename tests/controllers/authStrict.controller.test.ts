import type { Request, Response } from 'express'
import { changePassword, verify } from '../../src/controllers/auth.controller'

function response() {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  return { json, status }
}

test.each([
  ['verify', verify, {}],
  [
    'change password',
    changePassword,
    { body: { currentPassword: 'old-password', newPassword: 'new-password' } },
  ],
])('%s rejects a missing authenticated principal', async (_name, handler, request) => {
  const res = response()

  await handler(request as Request, res as unknown as Response)

  expect(res.status).toHaveBeenCalledWith(401)
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Não autenticado',
  })
})
