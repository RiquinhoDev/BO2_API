const KNOWN_DESCRIPTIONS = new Map<string, string>([
  ['0 2 * * *', 'Todos os dias às 02:00'],
  ['0 0 * * 0', 'Todos os domingos à meia-noite'],
  ['0 0 1 * *', 'No dia 1 de cada mês à meia-noite'],
  ['*/15 * * * *', 'A cada 15 minutos'],
  ['0 */2 * * *', 'A cada 2 horas'],
])

const MONTH_NAMES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

const DAY_NAMES = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
]

export function cronToHumanReadable(expression: string): string {
  const normalized = expression.trim().replace(/\s+/g, ' ')
  const known = KNOWN_DESCRIPTIONS.get(normalized)
  if (known) return known

  const parts = normalized.split(' ')
  if (parts.length !== 5) return 'Expressão inválida'

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  let description = 'Executar'

  if (minute === '*') {
    description += ' a cada minuto'
  } else if (minute.includes('/')) {
    description += ` a cada ${minute.split('/')[1]} minutos`
  } else {
    description += ` aos ${minute} minutos`
  }

  if (hour !== '*') {
    if (hour.includes('/')) {
      description += ` a cada ${hour.split('/')[1]} horas`
    } else {
      description += ` da(s) ${hour}h`
    }
  }

  if (dayOfMonth !== '*') description += ` no dia ${dayOfMonth}`

  if (month !== '*') {
    const monthName = MONTH_NAMES[Number(month) - 1]
    description += monthName ? ` em ${monthName}` : ` no mês ${month}`
  }

  if (dayOfWeek !== '*') {
    const dayName = DAY_NAMES[Number(dayOfWeek)]
    description += dayName ? ` (${dayName})` : ` no dia da semana ${dayOfWeek}`
  }

  return description
}
