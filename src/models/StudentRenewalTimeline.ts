// ════════════════════════════════════════════════════════════
// 📁 src/models/StudentRenewalTimeline.ts
// O percurso de renovação de um aluno, reconstruído a partir das
// vendas da Hotmart, das tags da AC e das turmas. Um documento
// por aluno, ligado por userId.
//
// É um DERIVADO: cada corrida do gerador substitui o documento
// inteiro. Nada aqui é fonte de verdade e nada aqui se edita à
// mão — para mudar o resultado, muda-se a fonte e regenera-se.
//
// Não confundir com `studentclasshistories`, que continua a ser
// o registo das movimentações feitas por pessoas. Esse é lido,
// nunca escrito, por este sistema.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IStudentRenewalTimeline extends Document {
  userId: mongoose.Types.ObjectId
  email: string

  ciclos: Array<{
    periodo: string
    compras: Array<{
      data: Date
      valor: number | null
      moeda: string | null
      produtoId: string | null
      transacao: string | null
      extensao: boolean
    }>
    anos: number
    acessoAte: Date
    coortes: Array<{
      periodo: string
      ano: number
      tag: { id: string; nome: string; aplicadaEm: Date | null } | null
    }>
    turma: { nome: string; classId: string | null; entrouEm: Date | null } | null
    tagEsperada: string | null
    alertas: string[]
  }>

  tagsOrfas: Array<{ id: string; nome: string; periodo: string | null; aplicadaEm: Date | null }>
  tagsEstado: Array<{ id: string; nome: string; aplicadaEm: Date | null }>

  cadeia: {
    acCompraIgualUltimaVenda: string
    expiracaoIgualTurma: string
    tagIgualTurma: string
    ciclosSemMudancaTurma: number
    tagsDesatualizadas: boolean
  }

  turmasPorMapear: string[]

  geradoEm: Date
  fontes: { vendas: Date | null; tags: Date | null; ac: Date | null }

  createdAt: Date
  updatedAt: Date
}

const compraSchema = new Schema(
  {
    data: { type: Date, required: true },
    valor: { type: Number, default: null },
    moeda: { type: String, default: null },
    produtoId: { type: String, default: null },
    transacao: { type: String, default: null },
    extensao: { type: Boolean, default: false }
  },
  { _id: false }
)

const tagDoCicloSchema = new Schema(
  {
    id: { type: String, required: true },
    nome: { type: String, required: true },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const turmaDoCicloSchema = new Schema(
  {
    nome: { type: String, required: true },
    classId: { type: String, default: null },
    entrouEm: { type: Date, default: null }
  },
  { _id: false }
)

/**
 * Um ano de acesso dentro do ciclo. O ciclo de 2 anos tem duas
 * coortes e uma tag por cada — a segunda chega 12 meses depois
 * sem nova compra.
 */
const coorteSchema = new Schema(
  {
    periodo: { type: String, required: true },
    ano: { type: Number, required: true },
    tag: { type: tagDoCicloSchema, default: null }
  },
  { _id: false }
)

const cicloSchema = new Schema(
  {
    periodo: { type: String, required: true },
    compras: { type: [compraSchema], default: [] },
    anos: { type: Number, default: 1 },
    acessoAte: { type: Date, required: true },
    coortes: { type: [coorteSchema], default: [] },
    turma: { type: turmaDoCicloSchema, default: null },
    tagEsperada: { type: String, default: null },
    alertas: { type: [String], default: [] }
  },
  { _id: false }
)

const tagOrfaSchema = new Schema(
  {
    id: { type: String, required: true },
    nome: { type: String, required: true },
    periodo: { type: String, default: null },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const tagEstadoSchema = new Schema(
  {
    id: { type: String, required: true },
    nome: { type: String, required: true },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const studentRenewalTimelineSchema = new Schema<IStudentRenewalTimeline>(
  {
    // unique já cria o índice — juntar index: true dá aviso de duplicado
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },

    ciclos: { type: [cicloSchema], default: [] },
    tagsOrfas: { type: [tagOrfaSchema], default: [] },
    tagsEstado: { type: [tagEstadoSchema], default: [] },

    cadeia: {
      acCompraIgualUltimaVenda: { type: String, default: 'sem-dados' },
      expiracaoIgualTurma: { type: String, default: 'sem-dados' },
      tagIgualTurma: { type: String, default: 'sem-dados' },
      ciclosSemMudancaTurma: { type: Number, default: 0 },
      tagsDesatualizadas: { type: Boolean, default: false }
    },

    turmasPorMapear: { type: [String], default: [] },

    geradoEm: { type: Date, required: true, default: Date.now, index: true },
    fontes: {
      vendas: { type: Date, default: null },
      tags: { type: Date, default: null },
      ac: { type: Date, default: null }
    }
  },
  { timestamps: true, collection: 'studentrenewaltimelines' }
)

studentRenewalTimelineSchema.index({ 'cadeia.tagIgualTurma': 1 })
studentRenewalTimelineSchema.index({ 'cadeia.ciclosSemMudancaTurma': -1 })

const StudentRenewalTimeline = (mongoose.models.StudentRenewalTimeline ||
  mongoose.model<IStudentRenewalTimeline>(
    'StudentRenewalTimeline',
    studentRenewalTimelineSchema
  )) as mongoose.Model<IStudentRenewalTimeline>

export default StudentRenewalTimeline
