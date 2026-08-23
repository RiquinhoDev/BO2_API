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
  /** MULTIPLE_PAYMENTS marca um plano de prestações; PAY_IN_FULL uma compra única. */
  paymentMode?: string | null
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
  /** Código da oferta da própria compra; na posição 0 identifica a oferta âncora. */
  offerCode: string | null
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
  | 'sem-tag-ano-2'
  | 'tag-tardia'
  | 'sem-mudanca-turma'
  | 'sem-registo-turma'
  | 'tag-por-definir'
  | 'tag-diferente-da-turma'

/**
 * Um ano de acesso dentro do ciclo. Um ciclo de 1 ano tem uma
 * coorte; um de 2 anos tem duas, e a segunda é a coorte de 12
 * meses depois, que o aluno recebe sem comprar outra vez.
 *
 * Medido nos dados a 21/08/2026: dos 148 ciclos de 2 anos, 99%
 * têm a tag da coorte do ano 1 e 77% têm também a do ano 2.
 * Tratar as duas como uma só marcaria 114 alunos certos como
 * tendo uma tag órfã.
 */
export interface CoorteCiclo {
  /** YYMM da coorte: o período do ciclo, ou 12 meses depois. */
  periodo: string
  ano: 1 | 2
  tag: { id: string; nome: string; aplicadaEm: Date | null } | null
}

export interface Ciclo extends CicloBase {
  coortes: CoorteCiclo[]
  turma: { nome: string; classId: string | null; entrouEm: Date | null } | null
  /** O que a convenção/excepção diz que a tag desta turma devia ser. */
  tagEsperada: string | null
  alertas: AlertaCiclo[]
}

export type Veredicto = 'ok' | 'divergente' | 'legado' | 'a-menos' | 'sem-dados'

/**
 * Os dois lados de um elo da cadeia. `esperado` é o que a fonte de cima
 * na hierarquia implica; `encontrado` é o que a de baixo tem de facto.
 * Guardados para o painel poder mostrar a comparação e não só o
 * veredicto — dizer "divergente" sem dizer entre o quê obriga a ir
 * procurar noutro separador.
 */
export interface ComparacaoElo<T> {
  esperado: T | null
  encontrado: T | null
}

export interface Cadeia {
  acCompraIgualUltimaVenda: Veredicto
  expiracaoIgualTurma: Veredicto
  tagIgualTurma: Veredicto
  /** Havia turma conhecida antes e este ciclo não a mudou. Isso é desvio. */
  ciclosSemMudancaTurma: number
  /**
   * Não há turma nenhuma conhecida até este ciclo. Não é desvio do aluno:
   * o `studentclasshistories` só regista mudanças feitas à mão, e o sync
   * substitui a turma em vez de a registar. Medido a 22/08/2026: 684 dos
   * 696 ciclos sem turma são isto, e só 12 são mudança em falta.
   */
  ciclosSemRegistoTurma: number
  /** Veredicto do elo das turmas, já com a distinção acima. */
  registoDeTurmas: Veredicto
  /** Há venda posterior à última sync de tags — o desvio pode ser só atraso. */
  tagsDesatualizadas: boolean
  comparacoes: {
    /** esperado = data da última cobrança; encontrado = campo 334 da AC. */
    acCompra: ComparacaoElo<Date>
    /** esperado = fim do acesso pelo nome da turma; encontrado = campo 332. */
    expiracao: ComparacaoElo<Date>
    /** esperado = tag que a turma pede; encontrado = tag que o aluno tem. */
    tag: ComparacaoElo<string>
    /** esperado = ciclos pagos; encontrado = quantos têm turma. */
    ciclosComTurma: { esperado: number; encontrado: number }
  }
}

export interface TagOrfa {
  id: string
  nome: string
  periodo: string | null
  aplicadaEm: Date | null
}

/**
 * Tag de percurso excedente que ainda é explicada por uma coorte.
 * Não ganhou o emparelhamento exclusivo porque já havia outra tag
 * mais adequada para o mesmo lugar; por isso não é órfã.
 */
export interface TagDuplicada extends TagOrfa {
  coortePeriodo: string
}

export interface TagEstado {
  id: string
  nome: string
  aplicadaEm: Date | null
}

export interface TimelineGerada {
  ciclos: Ciclo[]
  tagsOrfas: TagOrfa[]
  tagsDuplicadas: TagDuplicada[]
  tagsEstado: TagEstado[]
  cadeia: Cadeia
  /** Nomes de turma que nem a convenção nem as excepções resolveram. */
  turmasPorMapear: string[]
}
