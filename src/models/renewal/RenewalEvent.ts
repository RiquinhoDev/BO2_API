// ════════════════════════════════════════════════════════════
// 📁 src/models/renewal/RenewalEvent.ts
// A fila de acontecimentos que dá trabalho ao nocturno.
//
// O sistema é um gestor de compras, renovações e reembolsos — não
// um corrector do passado. O espelho continua a ler toda a gente
// todas as noites; as escritas para fora só acontecem a quem tem
// aqui um evento por tratar.
//
// O evento nasce no `hotmartSalesHistory.service`, no momento em
// que o espelho é gravado: uma transacção que não existia é uma
// compra; uma que passou a REFUNDED/CHARGEBACK é um reembolso.
//
// Há um terceiro, `espera-turma`, e é a excepção que confirma a
// regra: quem está na Turma Renovação Genérica tem uma tag pendente
// por definição — a genérica é uma sala de espera, não um destino.
// Sair dela é o acontecimento, e não gera venda nenhuma. Sem isto,
// quem comprou antes de o detector existir ficava lá para sempre:
// medido a 09/09/2026, 16 alunos, um deles há 370 dias.
//
// Fora estes três, nada cria eventos — em particular, "faltar uma
// tag" não é um evento, é um estado, e estados antigos ficam como
// estão.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export type TipoEventoRenovacao = 'compra' | 'reembolso' | 'espera-turma'

/**
 * As peças que consomem a fila. Cada uma marca a sua parte, para que
 * uma falha numa noite não obrigue as outras a repetir o trabalho —
 * e para que a fila mostre o que ficou por fazer.
 */
export interface TratamentoEvento {
  expiracao: Date | null
  tagTurma: Date | null
  reembolso: Date | null
}

export interface IRenewalEvent extends Document {
  userId: mongoose.Types.ObjectId
  email: string
  tipo: TipoEventoRenovacao
  /** Código da transacção da Hotmart que deu origem ao evento. */
  transacao: string | null
  /** Data da venda, não a da detecção. */
  data: Date | null
  produtoId: string | null
  /** Quando é que o espelho reparou. */
  detectadoEm: Date
  tratado: TratamentoEvento
  /**
   * Chave única do evento. Sem ela, uma segunda corrida do sync das
   * vendas na mesma noite duplicava a fila e o aluno era tratado duas
   * vezes.
   */
  chave: string
}

const renewalEventSchema = new Schema<IRenewalEvent>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, index: true },
    tipo: { type: String, enum: ['compra', 'reembolso', 'espera-turma'], required: true },
    transacao: { type: String, default: null },
    data: { type: Date, default: null },
    produtoId: { type: String, default: null },
    detectadoEm: { type: Date, required: true },
    tratado: {
      expiracao: { type: Date, default: null },
      tagTurma: { type: Date, default: null },
      reembolso: { type: Date, default: null }
    },
    chave: { type: String, required: true }
  },
  { timestamps: true, collection: 'renewalevents' }
)

renewalEventSchema.index({ chave: 1 }, { unique: true })
renewalEventSchema.index({ tipo: 1, 'tratado.tagTurma': 1 })
renewalEventSchema.index({ tipo: 1, 'tratado.reembolso': 1 })
renewalEventSchema.index({ detectadoEm: -1 })

/**
 * `tipo|transacao|data` — não inclui a data de detecção de propósito.
 * O mesmo reembolso detectado outra vez é o mesmo evento, e não pode
 * mandar tirar a tag uma segunda vez.
 */
export function chaveDoEvento(
  tipo: TipoEventoRenovacao,
  userId: string,
  transacao: string | null,
  data: Date | null
): string {
  return [tipo, userId, transacao ?? 'sem-transacao', data ? data.toISOString() : 'sem-data'].join('|')
}

const RenewalEvent = (mongoose.models.RenewalEvent ||
  mongoose.model<IRenewalEvent>('RenewalEvent', renewalEventSchema)) as mongoose.Model<IRenewalEvent>

export default RenewalEvent
