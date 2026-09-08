// ════════════════════════════════════════════════════════════
// 📁 src/models/TurmaTagMap.ts
// Excepções à convenção turma → tag da ActiveCampaign.
//
// A convenção resolve a esmagadora maioria dos casos e vive em
// código (`turmaTagResolver.ts`). Aqui ficam só os casos em que
// a realidade não segue a convenção: turmas agrupadas, turmas
// cujo período da tag não é o do nome e outras excepções reais.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface ITurmaTagMap extends Document {
  classNameNormalizado: string
  className: string
  tagNome: string
  tagId: string | null
  origem: 'excepcao' | 'observada'
  alunosConcordantes: number
  nota: string | null
  createdAt: Date
  updatedAt: Date
}

const turmaTagMapSchema = new Schema<ITurmaTagMap>(
  {
    classNameNormalizado: { type: String, required: true, unique: true },
    className: { type: String, required: true },
    tagNome: { type: String, required: true },
    tagId: { type: String, default: null },
    origem: { type: String, enum: ['excepcao', 'observada'], default: 'observada' },
    alunosConcordantes: { type: Number, default: 0 },
    nota: { type: String, default: null }
  },
  { timestamps: true, collection: 'turmatagmap' }
)

const TurmaTagMap = (mongoose.models.TurmaTagMap ||
  mongoose.model<ITurmaTagMap>('TurmaTagMap', turmaTagMapSchema)) as mongoose.Model<ITurmaTagMap>

export default TurmaTagMap
