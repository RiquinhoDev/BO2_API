import { guruTokenDebugStatus } from '../../src/security/debugRoutes'

test('debug Guru nunca devolve token, tamanho ou preview', () => {
  const secret = 'guru-token-sintetico-que-nunca-pode-sair'
  const payload = guruTokenDebugStatus(secret)

  expect(payload).toEqual({ success: true, debug: { configured: true } })
  expect(JSON.stringify(payload)).not.toContain(secret)
  expect(payload.debug).not.toHaveProperty('preview')
  expect(payload.debug).not.toHaveProperty('tokenLength')
})
