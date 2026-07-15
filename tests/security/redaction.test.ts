import { redactSensitiveData } from '../../src/observability/redaction'

test.each([
  ['contacto alice@example.test', 'contacto [REDACTED_EMAIL]'],
  ['contacto alice%40example.test', 'contacto [REDACTED_EMAIL]'],
  ['Authorization: Bearer abc.def.ghi', 'Authorization: Bearer [REDACTED]'],
  ['token=segredo-interno', 'token=[REDACTED]'],
])('redige o vetor sensível %s', (input, expected) => {
  expect(redactSensitiveData(input)).toBe(expected)
})

test('remove query strings e PII de paths conhecidos sem alterar o original', () => {
  const input = {
    url: '/users/by-email/alice%40example.test?token=segredo',
    context: '/ac/contact/alice@example.test/tags?debug=true',
    authorization: 'Bearer abc.def',
    nested: { password: 'segredo', note: 'email alice@example.test' },
  }

  expect(redactSensitiveData(input)).toEqual({
    url: '/users/by-email/[REDACTED]',
    context: '/ac/contact/[REDACTED]/tags',
    nested: { note: 'email [REDACTED_EMAIL]' },
  })
  expect(input.authorization).toBe('Bearer abc.def')
  expect(input.nested.password).toBe('segredo')
})

test('preserva templates de rota que já não contêm PII', () => {
  expect(redactSensitiveData({ route: '/users/by-email/:email' })).toEqual({
    route: '/users/by-email/:email',
  })
})

test('preserva detalhe útil de Error apenas depois de o redigir', () => {
  const result = redactSensitiveData({
    error: new Error('falha para alice@example.test token=segredo'),
  })

  expect(result.error).toEqual(
    expect.objectContaining({
      name: 'Error',
      message: 'falha para [REDACTED_EMAIL] token=[REDACTED]',
      stack: expect.stringContaining('falha para [REDACTED_EMAIL] token=[REDACTED]'),
    }),
  )
})
