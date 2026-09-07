// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/reguaDaChefia.ts
// As regras de cálculo do acesso, ditadas pela chefia a 07/09/2026,
// e a régua que o sistema aplicava até aqui, lado a lado para se
// poderem comparar sobre os mesmos dados.
//
// Funções puras: sem mongoose, sem axios, sem relógio próprio.
//
// As seis premissas, tal como foram escritas:
//   1. Todas as compras com exatamente o mesmo email são analisadas
//      em conjunto.
//   2. Apenas contabilizamos quando a Quantidade de cobrança é 1
//      (evita as prestações).
//   3. Cada compra válida acrescenta 12 meses de acesso.
//   4. Se o aluno comprar novamente enquanto ainda tem acesso, o novo
//      ano é acrescentado ao acesso existente.
//   5. Se o acesso anterior já tiver terminado, a nova compra inicia
//      um novo período a partir da nova data.
//   6. Depois de descobrir a data real de término, transforma-a no
//      último dia desse mês.
// ════════════════════════════════════════════════════════════

import { parseTurmaName } from './turmaParser'

// ─────────────────────────────────────────────────────────────
// Datas, sempre em UTC
// ─────────────────────────────────────────────────────────────

export const maisMeses = (d: Date, meses: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, d.getUTCDate()))

export const fimDoMes = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))

export const paraData = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v
  const d = typeof n === 'number' ? new Date(n) : new Date(String(n))
  return Number.isNaN(d.getTime()) ? null : d
}

// ─────────────────────────────────────────────────────────────
// Regras 1 e 2 — que compras contam
// ─────────────────────────────────────────────────────────────

/** Estados em que uma venda deixa de sustentar acesso. */
export const ESTADOS_SEM_ACESSO = new Set(['REFUNDED', 'CHARGEBACK', 'CANCELLED', 'EXPIRED', 'DISPUTE'])

/**
 * Os três produtos que dão acesso ao OGI.
 *
 * O `sales/history` da Hotmart devolve tudo o que o email comprou — e há
 * alunos com "Organiza as tuas Finanças" avulso, "Como começar a investir"
 * e "Transformando a Poupança". Nenhum deles dá acesso ao OGI, e contá-los
 * inflacionaria o acesso em doze meses por compra.
 *
 * A folha da chefia só traz estes três, o que confirma o mesmo âmbito.
 */
export const FAMILIA_OGI = new Set([
  '1733154', // O Grande Investimento
  '3100292', // OGI - Renovação — na verdade a extensão de 97€
  '4346330'  // OGI + Organiza as Tuas Finanças (pacote)
])

/** Uma venda tal como vem do `sales/history` da Hotmart. */
export interface VendaBruta {
  produtoId?: number | string | null
  produto?: string | null
  transacao?: string | null
  estado?: string | null
  /** `purchase.recurrency_number` — a "Quantidade de cobrança" da chefia. */
  recorrencia?: number | null
  prestacoes?: number | null
  modo?: string | null
  oferta?: string | null
  valor?: number | null
  aprovada?: number | string | null
  encomenda?: number | string | null
}

export interface ComprasValidas {
  datas: Date[]
  descartadas: { estado: number; recorrencia: number; semData: number; foraDaFamilia: number }
}

/**
 * Regras 1 e 2: todas as compras do mesmo email, e só a cobrança nº 1.
 *
 * `recurrency_number` vem 1 (ou ausente) numa compra avulsa e 2, 3, 4… nas
 * cobranças seguintes de um plano de prestações. Contá-las todas
 * transformaria um plano de cinco prestações em cinco anos de acesso — é
 * isso que a regra 2 evita.
 *
 * **Ausente conta como 1.** Descartar por omissão apagaria compras boas: a
 * maioria das vendas avulsas nem traz o campo.
 */
export function comprasValidas(
  vendas: VendaBruta[],
  familia: Set<string> = FAMILIA_OGI
): ComprasValidas {
  const descartadas = { estado: 0, recorrencia: 0, semData: 0, foraDaFamilia: 0 }
  const datas: Date[] = []

  for (const v of vendas) {
    const produto = v.produtoId === null || v.produtoId === undefined ? '' : String(v.produtoId)
    if (produto && !familia.has(produto)) {
      descartadas.foraDaFamilia += 1
      continue
    }
    if (ESTADOS_SEM_ACESSO.has(String(v.estado ?? '').toUpperCase())) {
      descartadas.estado += 1
      continue
    }
    const rec = v.recorrencia === null || v.recorrencia === undefined ? 1 : Number(v.recorrencia)
    if (rec !== 1) {
      descartadas.recorrencia += 1
      continue
    }
    const d = paraData(v.aprovada ?? v.encomenda)
    if (!d) {
      descartadas.semData += 1
      continue
    }
    datas.push(d)
  }

  datas.sort((a, b) => a.getTime() - b.getTime())
  return { datas, descartadas }
}

// ─────────────────────────────────────────────────────────────
// Regras 3 a 6 — a data
// ─────────────────────────────────────────────────────────────

export interface FimDoAcesso {
  /** A data real de término, antes de arredondar. */
  exacto: Date
  /** Regra 6: o último dia desse mês. */
  fim: Date
}

/**
 * Regras 3, 4 e 5: cada compra vale 12 meses; acumula sobre o que resta se
 * ainda houver acesso, recomeça na data da compra se já não houver.
 * Regra 6: o arredondamento ao fim do mês acontece **uma vez, no fim**.
 *
 * Arredondar a cada passo daria resultados diferentes — uma compra a 15/01
 * seguida de outra a 01/06 daria 31/01/2027 nos dois casos, mas por acaso;
 * com datas de fim de mês as duas leituras divergem.
 *
 * @param datas compras válidas, em qualquer ordem
 */
export function reguaDaChefia(datas: Date[]): FimDoAcesso | null {
  if (!datas.length) return null
  const ordenadas = [...datas].sort((a, b) => a.getTime() - b.getTime())

  let fim: Date | null = null
  for (const data of ordenadas) {
    const aindaTemAcesso = !!fim && fim.getTime() > data.getTime()
    fim = maisMeses(aindaTemAcesso ? (fim as Date) : data, 12)
  }

  return { exacto: fim as Date, fim: fimDoMes(fim as Date) }
}

/**
 * A turma, deduzida dos dados da chefia e confirmada nos 31 alunos da folha
 * *Comparação Turmas*: é o YYMM de doze meses antes do fim do acesso.
 *
 * É a inversão da nossa régua — aqui a data decide a turma, e não o
 * contrário.
 */
export function turmaDaChefia(fim: Date): string {
  const d = maisMeses(fim, -12)
  return String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0')
}

// ─────────────────────────────────────────────────────────────
// A ponte para o resto do sistema
// ─────────────────────────────────────────────────────────────

/** Uma compra tal como o sistema a guarda nos ciclos. */
export interface CompraDoCiclo {
  data: Date
  reembolsada?: boolean
  recurrencyNumber?: number | null
}

/**
 * O fim do acesso pelas regras da chefia, a partir das compras que o
 * sistema já tem agrupadas em ciclos.
 *
 * **Substitui o multiplicador `anos`, não se soma a ele.** As duas coisas
 * fazem o mesmo trabalho — transformar 397€ + 97€ no mesmo dia em 24 meses
 * — uma multiplicando e a outra somando. Aplicar as duas dá 36 meses a
 * quem comprou dois anos: medido, 123 alunos.
 *
 * Reproduz o resultado actual em 130 dos 142 alunos com a extensão. Dos 12
 * que mudam, 11 ganham um mês (o arredondamento passa a ser só no fim,
 * regra 6) e um ganha um ano — a `alvessonia`, que comprou três vezes no
 * mesmo dia e a quem o tecto de `anos = 2` dava dois.
 *
 * @param compras todas as compras do aluno, de todos os ciclos, por
 *        qualquer ordem. Reembolsadas e prestações são descartadas aqui.
 */
export function fimDoAcessoAcumulado(compras: CompraDoCiclo[]): Date | null {
  const datas = compras
    .filter((c) => c.reembolsada !== true)
    .filter((c) => (c.recurrencyNumber === null || c.recurrencyNumber === undefined ? 1 : Number(c.recurrencyNumber)) === 1)
    .map((c) => c.data)
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))

  return reguaDaChefia(datas)?.fim ?? null
}

// ─────────────────────────────────────────────────────────────
// A régua que o sistema aplica hoje
// ─────────────────────────────────────────────────────────────

export type RamoTurma = 'base' | 'renovação' | 'genérica' | 'sem turma' | 'ilegível'

export function ramoDaTurma(nome: string | null | undefined): RamoTurma {
  if (!nome) return 'sem turma'
  if (/gener|genér/i.test(nome)) return 'genérica'
  const p = parseTurmaName(nome)
  if (!p.periodYYMM) return 'ilegível'
  return /renov/i.test(nome) ? 'renovação' : 'base'
}

/**
 * A régua actual: numa turma **base** o acesso vem do período no NOME da
 * turma; numa de **renovação**, da data da última compra. Não acumula.
 *
 * É aqui que as duas divergem mais: numa turma base a data da compra e a da
 * turma podem estar meses afastadas, e esta régua ignora a primeira.
 */
export function reguaNossa(nomeTurma: string | null | undefined, datas: Date[]): Date | null {
  const ramo = ramoDaTurma(nomeTurma)
  const p = nomeTurma ? parseTurmaName(nomeTurma) : null
  const anos = p?.accessYears === 2 ? 2 : 1

  if (ramo === 'base' && p?.periodYYMM) {
    const ano = 2000 + Number(p.periodYYMM.slice(0, 2))
    const mes = Number(p.periodYYMM.slice(2))
    return fimDoMes(new Date(Date.UTC(ano, mes - 1 + 12 * anos, 1)))
  }

  if (!datas.length) return null
  const ordenadas = [...datas].sort((a, b) => a.getTime() - b.getTime())
  return fimDoMes(maisMeses(ordenadas[ordenadas.length - 1], 12 * anos))
}
