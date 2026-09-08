// ════════════════════════════════════════════════════════════
// 📁 src/models/renewal/AcTagEvent.ts
// Registo de quem mexeu nas tags obrigatórias de um aluno na
// ActiveCampaign quando não fomos nós.
//
// Serve duas coisas ao mesmo tempo, e é por isso que `estado`
// existe: uma FILA de avisos que se esvazia, e um HISTÓRICO por
// aluno que nunca se apaga. Aceitar tira da fila e mantém a linha.
//
// Escreve APENAS na nossa BD. Nada aqui toca na AC.
//
// Sem relação com o subsistema de tags de Janeiro
// (`tagMonitoring`, `CriticalTag`, `tagOrchestrator`): esse aplica
// tags por produto e actividade; isto só observa e avisa.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export type AccaoTag = 'aplicada' | 'removida'
/** Três das obrigatórias são tags; a quarta é a lista "Alunos OGI". */
export type AlvoEvento = 'tag' | 'lista'
export type OrigemTag = 'nosso' | 'automacaoAC' | 'maoHumana'
export type SeveridadeTag = 'grave' | 'aviso' | 'ruido'
export type EstadoTag = 'aberto' | 'aceite'

export interface IAcTagEvent extends Document {
  /**
   * Quando aconteceu. Aplicações: o `cdate` da AC, que é a hora real.
   * Remoções: o `syncedAt` do espelho contra o qual se comparou — a AC
   * não guarda lápide, e essa é a hora mais tardia que se sabe.
   */
  quando: Date
  /** Quando a vigilância viu. Nas remoções é a única data verdadeira. */
  detectadoEm: Date
  /** `syncedAt` do espelho usado como base. É o que torna a chave estável. */
  baseEspelhoEm: Date | null

  email: string
  userId?: mongoose.Types.ObjectId | null
  contactId?: string | null

  /**
   * `'tag'` ou `'lista'`. Numa lista, `tagId`/`tagNome` levam o id e o
   * nome da lista, e `accao` continua a ser `aplicada` (entrou) /
   * `removida` (saiu).
   */
  alvo: AlvoEvento
  tagId: string
  tagNome: string
  tipo: 'canonica' | 'membresia' | 'outra'
  /** YYMM lido do nome da tag. Null quando o nome não o traz. */
  periodo: string | null

  accao: AccaoTag
  origem: OrigemTag
  /** Identificador do lote quando faz parte de uma acção em massa. */
  lote: string | null
  loteTamanho: number

  alunoActivo: boolean
  severidade: SeveridadeTag
  /** O que isto desalinha, em português. Null quando não desalinha nada. */
  desalinha: string | null

  estado: EstadoTag
  aceitePor: string | null
  aceiteEm: Date | null
  aceiteMotivo: string | null

  /** `email|alvo|tagId|accao|quandoISO`. Impede duplicados entre corridas. */
  chave: string
}

const acTagEventSchema = new Schema<IAcTagEvent>(
  {
    quando: { type: Date, required: true },
    detectadoEm: { type: Date, required: true },
    baseEspelhoEm: { type: Date, default: null },

    email: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    contactId: { type: String, default: null },

    alvo: { type: String, enum: ['tag', 'lista'], required: true, default: 'tag' },
    tagId: { type: String, required: true },
    tagNome: { type: String, required: true },
    tipo: { type: String, enum: ['canonica', 'membresia', 'outra'], required: true },
    periodo: { type: String, default: null },

    accao: { type: String, enum: ['aplicada', 'removida'], required: true },
    origem: { type: String, enum: ['nosso', 'automacaoAC', 'maoHumana'], required: true },
    lote: { type: String, default: null },
    loteTamanho: { type: Number, default: 1 },

    alunoActivo: { type: Boolean, required: true },
    severidade: { type: String, enum: ['grave', 'aviso', 'ruido'], required: true },
    desalinha: { type: String, default: null },

    estado: { type: String, enum: ['aberto', 'aceite'], required: true, default: 'aberto' },
    aceitePor: { type: String, default: null },
    aceiteEm: { type: Date, default: null },
    aceiteMotivo: { type: String, default: null },

    chave: { type: String, required: true }
  },
  { timestamps: true, collection: 'actagevents' }
)

acTagEventSchema.index({ chave: 1 }, { unique: true })
acTagEventSchema.index({ email: 1, quando: -1 })
acTagEventSchema.index({ estado: 1, severidade: 1, quando: -1 })
acTagEventSchema.index({ lote: 1 })

const AcTagEvent = (mongoose.models.AcTagEvent ||
  mongoose.model<IAcTagEvent>('AcTagEvent', acTagEventSchema)) as mongoose.Model<IAcTagEvent>

export default AcTagEvent
