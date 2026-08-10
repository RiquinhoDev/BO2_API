import { cronToHumanReadable } from '../../src/utils/cronDescription'

test.each([
  ['0 2 * * *', 'Todos os dias às 02:00'],
  ['0 0 * * 0', 'Todos os domingos à meia-noite'],
  ['0 0 1 * *', 'No dia 1 de cada mês à meia-noite'],
  ['*/15 * * * *', 'A cada 15 minutos'],
  ['0 */2 * * *', 'A cada 2 horas'],
  ['invalid', 'Expressão inválida'],
])('describes %s without depending on scheduler state', (expression, expected) => {
  expect(cronToHumanReadable(expression)).toBe(expected)
})
