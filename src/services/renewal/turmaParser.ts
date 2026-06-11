// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/turmaParser.ts
// Parser de nomes de turma e de ofertas de renovação (OGI / Ser Riquinho).
//
// A Hotmart NÃO expõe data de expiração nem o nome da turma na API — o nome
// é dado por nós no Backoffice. O nome carrega tudo o que precisamos:
//
//   "Turma 10 [renov] + REITs | 2505"
//                ▲                ▲
//                |                └─ período YYMM (2505 = maio 2025)
//                └─ nível de renovação (renov = 1, 2a renov = 2)
//
// A expiração é CALCULADA em runtime: período + 12 meses, último dia do mês.
//   2505 → acesso OGI termina a 31 de maio de 2026.
// ════════════════════════════════════════════════════════════

export interface ParsedTurma {
  raw: string
  turmaNumber: number | null // primeira turma (conveniência); ver turmaNumbers
  turmaNumbers: number[] // ≥1 quando a turma cobre várias (ex: "Turmas 1 a 5")
  isRenov: boolean
  renovLevel: number // 0 = original, 1 = renov, 2 = 2a renov, ...
  periodYYMM: string | null // ex: "2505"
  periodStart: Date | null // 1º dia do mês do período (UTC)
  accessYears: number // 1 por defeito; 2 quando o nome tem "[2 anos]"
  accessEndOgi: Date | null // último dia do mês, accessYears anos depois (UTC)
  accessEndYYMM: string | null // YYMM da expiração (p/ matching da renovação)
  hasTurma: boolean // conseguiu extrair ≥1 número de turma (preciso p/ matching)
  hasExpiry: boolean // conseguiu calcular expiração (período válido)
  valid: boolean // hasTurma && hasExpiry
}

export interface ParsedOffer {
  raw: string
  isRenewal: boolean
  turmaNumbers: number[]
  periodYYMM: string | null
  periodStart: Date | null
  valid: boolean
}

const MONTH_OK = (mm: number) => mm >= 1 && mm <= 12

/** Converte "YYMM" (ex "2505") em { start, accessEnd, endYYMM }. Assume 20YY. */
function periodFromYYMM(
  yymm: string,
  accessYears: number = 1
): { start: Date; accessEnd: Date; endYYMM: string } | null {
  if (!/^\d{4}$/.test(yymm)) return null
  const yy = Number(yymm.slice(0, 2))
  const mm = Number(yymm.slice(2, 4))
  if (!MONTH_OK(mm)) return null

  const year = 2000 + yy
  // 1º dia do mês do período
  const start = new Date(Date.UTC(year, mm - 1, 1))
  // último instante do mesmo mês, accessYears anos depois (12 ou 24 meses)
  // Date.UTC(year+accessYears, mm, 0, ...) → fim do último dia do mês `mm`
  const accessEnd = new Date(Date.UTC(year + accessYears, mm, 0, 23, 59, 59, 999))
  const endYYMM = `${String((yy + accessYears) % 100).padStart(2, '0')}${String(mm).padStart(2, '0')}`
  return { start, accessEnd, endYYMM }
}

/** "[2 anos]" / "[2anos]" no nome → 2 anos de acesso; caso contrário 1. */
function extractAccessYears(name: string): number {
  return /2\s*anos?/i.test(name) ? 2 : 1
}

/**
 * Extrai o último código YYMM válido de uma string.
 * Aceita prefixo "L" (ofertas: "| L2606 |") e ignora grupos que não sejam
 * um mês válido (ex: preço "| 447" não é 4 dígitos; um ano solto sem mês falha).
 */
function extractPeriodYYMM(name: string): string | null {
  const matches = [...name.matchAll(/L?(\d{4})/gi)].map((m) => m[1])
  // preferir o último código cujo MM é um mês válido
  for (let i = matches.length - 1; i >= 0; i--) {
    const mm = Number(matches[i].slice(2, 4))
    if (MONTH_OK(mm)) return matches[i]
  }
  return null
}

/** Extrai o nível de renovação de uma etiqueta "[...renov...]". */
function extractRenovLevel(name: string): number {
  const tag = name.match(/\[([^\]]*renov[^\]]*)\]/i)
  if (!tag) return 0
  const nth = tag[1].match(/(\d+)\s*a\b/i) // "2a renov", "3a renov"
  if (nth) return Number(nth[1])
  return 1 // "[renov]" simples
}

/**
 * Extrai os números de turma do bloco que segue "turma(s)".
 * Suporta um só ("Turma 10"), lista ("Turmas 1, 2 e 3") e range ("Turmas 1 a 5").
 * Devolve [] quando não há número (ex: "Equipa", "Turma antigos alunos").
 */
function extractTurmaNumbers(name: string): number[] {
  // bloco depois de "turma(s)" até ao primeiro "|" ou "[" (etiquetas/período)
  const block = name.match(/turmas?\s+([^|\[]+)/i)?.[1] ?? ''

  // range "1 a 5" / "1 até 5" / "1-5"
  const range = block.match(/(\d+)\s*(?:a|até|-)\s*(\d+)/i)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    if (hi >= lo && hi - lo <= 50) {
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    }
  }

  // lista "1, 2 e 3" (ou número único)
  const nums = [...block.matchAll(/\d+/g)].map((m) => Number(m[0]))
  return nums
}

/**
 * Faz parse do nome da turma do aluno (user.hotmart.enrolledClasses[].className).
 */
export function parseTurmaName(className: string): ParsedTurma {
  const raw = (className || '').trim()

  const turmaNumbers = extractTurmaNumbers(raw)
  const renovLevel = extractRenovLevel(raw)
  const accessYears = extractAccessYears(raw)
  const periodYYMM = extractPeriodYYMM(raw)
  const period = periodYYMM ? periodFromYYMM(periodYYMM, accessYears) : null

  const hasTurma = turmaNumbers.length > 0
  const hasExpiry = period !== null

  return {
    raw,
    turmaNumber: turmaNumbers[0] ?? null,
    turmaNumbers,
    isRenov: renovLevel > 0,
    renovLevel,
    periodYYMM,
    periodStart: period?.start ?? null,
    accessYears,
    accessEndOgi: period?.accessEnd ?? null,
    accessEndYYMM: period?.endYYMM ?? null,
    hasTurma,
    hasExpiry,
    valid: hasTurma && hasExpiry,
  }
}

/**
 * Faz parse do nome de uma oferta da Hotmart.
 * Renovação: "Renovação turma 1, 2 e 3 | 2605" → [1,2,3], "2605"
 * Nova:      "OGI Turma 19 | L2606 | 447"      → isRenewal false, [19], "2606"
 */
export function parseOfferName(offerName: string): ParsedOffer {
  const raw = (offerName || '').trim()
  const isRenewal = /renova/i.test(raw)

  const turmaNumbers = extractTurmaNumbers(raw)
  const periodYYMM = extractPeriodYYMM(raw)
  const period = periodYYMM ? periodFromYYMM(periodYYMM) : null

  return {
    raw,
    isRenewal,
    turmaNumbers,
    periodYYMM,
    periodStart: period?.start ?? null,
    valid: turmaNumbers.length > 0 && period !== null,
  }
}
