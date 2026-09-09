// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/detectarEventos.ts
// O diff entre o que o espelho tinha e o que a Hotmart devolveu.
//
// Função pura: recebe duas listas de vendas, devolve o que há de
// novo. Sem mongoose, sem relógio próprio.
//
// A comparação é por CÓDIGO DE TRANSACÇÃO, não por posição nem por
// contagem. Uma venda pode mudar de estado sem mudar de sítio, e a
// Hotmart devolve a lista inteira a cada chamada.
// ════════════════════════════════════════════════════════════

import type { TipoEventoRenovacao } from '../../models/renewal/RenewalEvent'

/** Estados em que uma venda deixa de sustentar acesso. */
export const ESTADOS_DE_REEMBOLSO = new Set(['REFUNDED', 'CHARGEBACK'])

/** O mínimo de uma venda para se saber se é nova ou se mudou. */
export interface VendaComparavel {
  transaction?: string | null
  transactionStatus?: string | null
  approvedDate?: Date | string | null
  orderDate?: Date | string | null
  hotmartProductId?: string | null
}

export interface EventoDetectado {
  tipo: TipoEventoRenovacao
  transacao: string | null
  data: Date | null
  produtoId: string | null
}

const paraData = (v: unknown): Date | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

const eReembolso = (estado: unknown): boolean =>
  ESTADOS_DE_REEMBOLSO.has(String(estado ?? '').toUpperCase())

const dataDaVenda = (v: VendaComparavel): Date | null =>
  paraData(v.approvedDate) ?? paraData(v.orderDate)

/**
 * O que aconteceu entre a leitura anterior e esta.
 *
 * Três casos, e mais nenhum:
 *
 *   - transacção que **não existia** → compra
 *   - transacção que **passou a** REFUNDED/CHARGEBACK → reembolso
 *   - transacção que já lá estava com o mesmo estado → nada
 *
 * Uma venda que **nasce já reembolsada** conta só como reembolso, não
 * como compra e reembolso: nunca deu acesso, e emitir as duas mandaria
 * o escritor da expiração dar-lhe um ano antes de o tirar.
 *
 * Vendas sem código de transacção são ignoradas — sem identidade não há
 * forma de saber se são novas, e emitir um evento por cada leitura
 * poria o nocturno a tratar o mesmo aluno todas as noites.
 *
 * @param anteriores o que estava no espelho antes desta corrida
 * @param actuais    o que a Hotmart acabou de devolver
 */
export function detectarEventos(
  anteriores: VendaComparavel[],
  actuais: VendaComparavel[]
): EventoDetectado[] {
  const antes = new Map<string, string>()
  for (const v of anteriores) {
    const t = v.transaction?.trim()
    if (t) antes.set(t, String(v.transactionStatus ?? '').toUpperCase())
  }

  const eventos: EventoDetectado[] = []
  const vistas = new Set<string>()

  for (const v of actuais) {
    const transacao = v.transaction?.trim()
    if (!transacao) continue
    // A Hotmart repete a linha da mesma cobrança; a primeira basta.
    if (vistas.has(transacao)) continue
    vistas.add(transacao)

    const estadoActual = String(v.transactionStatus ?? '').toUpperCase()
    const conhecida = antes.has(transacao)
    const estadoAntes = antes.get(transacao)

    const base = {
      transacao,
      data: dataDaVenda(v),
      produtoId: v.hotmartProductId ?? null
    }

    if (!conhecida) {
      // Nasceu reembolsada: nunca deu acesso, não é compra.
      eventos.push({ ...base, tipo: eReembolso(estadoActual) ? 'reembolso' : 'compra' })
      continue
    }

    if (eReembolso(estadoActual) && !eReembolso(estadoAntes)) {
      eventos.push({ ...base, tipo: 'reembolso' })
    }
  }

  return eventos
}
