import type { NextFunction, Request, Response } from 'express'
import axios from 'axios'
import User from '../../src/models/user'
import { HttpError } from '../../src/security/errorHandling'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: jest.fn((error: unknown) =>
      typeof error === 'object' && error !== null && 'isAxiosError' in error,
    ),
  },
}))
jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  getGuruUserToken: jest.fn(() => 'offline-guru-token'),
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}))

import {
  diagnosSubscription,
  getSubscriptionStatus,
  ssoMyOrders,
} from '../../src/controllers/guru.sso.controller'

const postSso = axios.post as jest.Mock
const findUser = User.findOne as jest.Mock

function request(query: Request['query'] = {}): Request {
  return { query } as Request
}

function response(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  } as unknown as Response
}

function activeGuruUser() {
  return { email: 'alice@example.test', guru: { status: 'active' } }
}

function expectForwarded(next: NextFunction, code: string) {
  expect(next).toHaveBeenCalledTimes(1)
  const [error] = (next as jest.Mock).mock.calls[0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code })
  expect(error.publicMessage).not.toContain('secret')
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => jest.restoreAllMocks())

test('missing SSO URL forwards an opaque typed error', async () => {
  findUser.mockResolvedValueOnce(activeGuruUser())
  postSso.mockResolvedValueOnce({ data: { internal: 'token=secret' } })
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(ssoMyOrders, undefined, [request({ email: 'alice@example.test' }), res, next])

  expect(res.status).not.toHaveBeenCalled()
  expectForwarded(next, 'GURU_SSO_LINK_FAILED')
})

test('Guru authentication failure forwards an opaque typed error', async () => {
  findUser.mockResolvedValueOnce(activeGuruUser())
  postSso.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401, data: 'token=secret' } })
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(ssoMyOrders, undefined, [request({ email: 'alice@example.test' }), res, next])

  expect(res.status).not.toHaveBeenCalled()
  expectForwarded(next, 'GURU_SSO_AUTH_FAILED')
})

test('unexpected SSO failure forwards an opaque typed error', async () => {
  findUser.mockResolvedValueOnce(activeGuruUser())
  postSso.mockRejectedValueOnce(new Error('guru token=secret alice@example.test'))
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(ssoMyOrders, undefined, [request({ email: 'alice@example.test' }), res, next])

  expect(res.status).not.toHaveBeenCalled()
  expectForwarded(next, 'GURU_SSO_FAILED')
})

test('status lookup failure forwards an opaque typed error', async () => {
  findUser.mockReturnValueOnce({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('mongo token=secret')) }),
  })
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(getSubscriptionStatus, undefined, [request({ email: 'alice@example.test' }), res, next])

  expect(res.status).not.toHaveBeenCalled()
  expectForwarded(next, 'GURU_SUBSCRIPTION_STATUS_FAILED')
})

test('diagnostic lookup failure forwards an opaque typed error', async () => {
  findUser.mockReturnValueOnce({ lean: jest.fn().mockRejectedValue(new Error('mongo token=secret')) })
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(diagnosSubscription, undefined, [request({ email: 'alice@example.test' }), res, next])

  expect(res.status).not.toHaveBeenCalled()
  expectForwarded(next, 'GURU_SUBSCRIPTION_DIAGNOSIS_FAILED')
})

test.each([
  [{ isAxiosError: true, response: { status: 404 } }, 404, 'Email não encontrado na plataforma Guru'],
  [{ isAxiosError: true, code: 'ECONNABORTED' }, 504, 'Timeout na comunicação com a plataforma Guru'],
] as const)('preserves the functional Guru failure contract', async (failure, status, message) => {
  findUser.mockResolvedValueOnce(activeGuruUser())
  postSso.mockRejectedValueOnce(failure)
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(ssoMyOrders, undefined, [request({ email: 'alice@example.test' }), res, next])

  expect(res.status).toHaveBeenCalledWith(status)
  expect(res.json).toHaveBeenCalledWith({ success: false, message })
  expect(next).not.toHaveBeenCalled()
})

test('successful SSO preserves the 302 redirect', async () => {
  findUser.mockResolvedValueOnce(activeGuruUser())
  postSso.mockResolvedValueOnce({ data: { redirect_url: 'https://example.test/orders' } })
  const res = response()

  await Reflect.apply(ssoMyOrders, undefined, [request({ email: 'alice@example.test' }), res, jest.fn()])

  expect(res.redirect).toHaveBeenCalledWith(302, 'https://example.test/orders')
})
