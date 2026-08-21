// ════════════════════════════════════════════════════════════
// 📁 src/models/ACStudentTag.ts
// Espelho local das tags de turma que cada aluno tem na
// ActiveCampaign. Existe para não termos de bater na AC sempre
// que queremos saber com que tags um aluno está marcado.
//
// Escreve APENAS na nossa BD — nunca toca em nada externo.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

/**
 * Nem toda a tag que fala de turmas diz onde o aluno está:
 *
 *  - `canonica`  — está na tabela oficial (Tags obrigatórias AC).
 *  - `membresia` — segue a nomenclatura de pertença
 *                  (`Aluno OGI L2409 - Turma 11`) mas não consta da tabela.
 *                  Costumam ser turmas que a tabela não cobre.
 *  - `outra`     — menciona uma turma mas não é pertença: mentorias,
 *                  "25 primeiros", ofertas, eventos.
 */
export type TipoTagTurma = 'canonica' | 'membresia' | 'outra'

export interface IACTag {
  tagId: string
  nome: string
  tipo: TipoTagTurma
  /** `cdate` da associação na AC — quando a tag foi posta no contacto. */
  aplicadaEm: Date | null
}

export interface IACStudentTag extends Document {
  userId?: mongoose.Types.ObjectId
  email: string
  contactId?: string

  tags: IACTag[]
  totalTags: number
  totalMembresia: number

  syncedAt: Date
  createdAt: Date
  updatedAt: Date
}

const acTagSchema = new Schema<IACTag>(
  {
    tagId: { type: String, required: true },
    nome: { type: String, required: true },
    tipo: { type: String, enum: ['canonica', 'membresia', 'outra'], required: true },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const acStudentTagSchema = new Schema<IACStudentTag>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    contactId: { type: String, default: null, index: true },

    tags: { type: [acTagSchema], default: [] },
    totalTags: { type: Number, default: 0 },
    // quantas dizem efectivamente em que turma o aluno está
    totalMembresia: { type: Number, default: 0, index: true },

    syncedAt: { type: Date, required: true, default: Date.now, index: true }
  },
  { timestamps: true, collection: 'acstudenttags' }
)

const ACStudentTag = (mongoose.models.ACStudentTag ||
  mongoose.model<IACStudentTag>('ACStudentTag', acStudentTagSchema)) as mongoose.Model<IACStudentTag>

export default ACStudentTag
