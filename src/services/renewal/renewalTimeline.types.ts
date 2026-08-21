// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalTimeline.types.ts
// Tipos da timeline de renovação. Sem lógica e sem imports de
// mongoose — para que as funções puras que os usam possam ser
// testadas sem ligar a nada.
// ════════════════════════════════════════════════════════════

/** Uma venda tal como vem do espelho `hotmartsalehistories`. */
export interface VendaEntrada {
  hotmartProductId: string | null
  productName: string | null
  transaction: string | null
  offerCode: string | null
  transactionStatus: string | null
  approvedDate: Date | null
  orderDate: Date | null
  priceValue: number | null
  currency: string | null
}

/** Uma tag do aluno tal como vem do espelho `acstudenttags`. */
export interface TagEntrada {
  tagId: string
  nome: string
  aplicadaEm: Date | null
}

/** Uma entrada em turma: movimentação registada ou a turma actual. */
export interface TurmaEntrada {
  classId: string | null
  className: string
  entrouEm: Date | null
}

export interface CompraCiclo {
  data: Date
  valor: number | null
  moeda: string | null
  produtoId: string | null
  transacao: string | null
  /** true quando é o produto 3100292 (a extensão de 97€). */
  extensao: boolean
}

export interface CicloBase {
  /** YYMM da compra âncora do ciclo. */
  periodo: string
  compras: CompraCiclo[]
  anos: 1 | 2
  acessoAte: Date
}

export type AlertaCiclo =
  | 'sem-tag'
  | 'tag-tardia'
  | 'sem-mudanca-turma'
  | 'tag-por-definir'
  | 'tag-diferente-da-turma'

export interface Ciclo extends CicloBase {
  tag: { id: string; nome: string; aplicadaEm: Date | null } | null
  turma: { nome: string; classId: string | null; entrouEm: Date | null } | null
  /** O que a convenção/excepção diz que a tag desta turma devia ser. */
  tagEsperada: string | null
  alertas: AlertaCiclo[]
}

export type Veredicto = 'ok' | 'divergente' | 'sem-dados'

export interface Cadeia {
  acCompraIgualUltimaVenda: Veredicto
  expiracaoIgualTurma: Veredicto
  tagIgualTurma: Veredicto
  ciclosSemMudancaTurma: number
  /** Há venda posterior à última sync de tags — o desvio pode ser só atraso. */
  tagsDesatualizadas: boolean
}

export interface TagOrfa {
  id: string
  nome: string
  periodo: string | null
  aplicadaEm: Date | null
}

export interface TagEstado {
  id: string
  nome: string
  aplicadaEm: Date | null
}

export interface TimelineGerada {
  ciclos: Ciclo[]
  tagsOrfas: TagOrfa[]
  tagsEstado: TagEstado[]
  cadeia: Cadeia
  /** Nomes de turma que nem a convenção nem as excepções resolveram. */
  turmasPorMapear: string[]
}
