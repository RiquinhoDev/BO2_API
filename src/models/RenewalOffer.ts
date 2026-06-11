import mongoose, { Document, Model, Schema } from 'mongoose'

export interface IRenewalOffer extends Document {
  offerCode: string
  offerName: string
  link: string
  turmaNumbers: number[]
  periodYYMM: string | null
  periodStart: Date | null
  isRenewal: boolean
  isActive: boolean
  source: 'hotmart_sync' | 'manual'
  isManuallyEdited: boolean
  // dados observacionais das vendas Hotmart (info para o Backoffice)
  priceValue: number | null
  currency: string | null
  paymentModes: string[]
  salesCount: number
  // turma sugerida a partir das turmas dos compradores (não autoritativo)
  suggestedTurmas: Array<{ turmaNumber: number; count: number }>
  suggestionConfidence: number // 0..1 = topo / total de compradores analisados
  suggestionSampleSize: number // nº de compradores OGI activos analisados
  lastSeenAt: Date
  createdAt: Date
  updatedAt: Date
}

const RenewalOfferSchema = new Schema<IRenewalOffer>({
  offerCode: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  offerName: {
    type: String,
    required: true,
    trim: true
  },
  link: {
    type: String,
    required: true,
    trim: true
  },
  turmaNumbers: {
    type: [Number],
    default: [],
    index: true
  },
  periodYYMM: {
    type: String,
    default: null,
    index: true,
    trim: true
  },
  periodStart: {
    type: Date,
    default: null,
    index: true
  },
  isRenewal: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  source: {
    type: String,
    enum: ['hotmart_sync', 'manual'],
    default: 'hotmart_sync',
    index: true
  },
  isManuallyEdited: {
    type: Boolean,
    default: false,
    index: true
  },
  priceValue: {
    type: Number,
    default: null
  },
  currency: {
    type: String,
    default: null,
    trim: true
  },
  paymentModes: {
    type: [String],
    default: []
  },
  salesCount: {
    type: Number,
    default: 0
  },
  suggestedTurmas: {
    type: [{
      turmaNumber: { type: Number },
      count: { type: Number }
    }],
    default: []
  },
  suggestionConfidence: {
    type: Number,
    default: 0
  },
  suggestionSampleSize: {
    type: Number,
    default: 0
  },
  lastSeenAt: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'renewaloffers'
})

RenewalOfferSchema.index({ isActive: 1, isRenewal: 1, turmaNumbers: 1, periodYYMM: 1 })

const RenewalOffer = (mongoose.models.RenewalOffer as Model<IRenewalOffer>)
  || mongoose.model<IRenewalOffer>('RenewalOffer', RenewalOfferSchema)

export default RenewalOffer
