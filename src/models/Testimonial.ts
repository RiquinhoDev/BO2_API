// src/models/Testimonial.ts
import mongoose, { Document, Schema } from 'mongoose'

export interface ITestimonial extends Document {
  studentId: mongoose.Types.ObjectId
  studentEmail: string
  studentName: string
  classId?: string
  className?: string
  
  // Estados do testemunho
  status: 'PENDING' | 'CONTACTED' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED'
  
  // Datas importantes
  requestedDate?: Date      // Quando foi solicitado
  contactedDate?: Date      // Quando foi contactado
  responseDate?: Date       // Quando respondeu (aceitou/recusou)
  completedDate?: Date      // Quando o testemunho foi dado/gravado
  
  // Detalhes do testemunho
  testimonyType?: 'TEXT' | 'VIDEO' | 'AUDIO' | 'IMAGE'
  testimonyContent?: string // Link ou texto do testemunho
  rating?: number          // Avaliação dada (1-5)
  
  // Notas e observações
  notes?: string           // Notas internas
  contactMethod?: 'EMAIL' | 'DISCORD' | 'WHATSAPP' | 'PHONE' | 'OTHER'
  declineReason?: string   // Motivo da recusa (se aplicável)
  
  // Metadados
  requestedBy?: string     // Quem solicitou
  processedBy?: string     // Quem processou
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  
  // Controle
  isVisible?: boolean      // Se deve aparecer publicamente
  isFeature?: boolean     // Se é testemunho em destaque
  
  createdAt: Date
  updatedAt: Date
  
  // Métodos
  updateStatus(newStatus: string, processedBy?: string): Promise<ITestimonial>
}

const TestimonialSchema = new Schema<ITestimonial>({
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  studentEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  classId: {
    type: String,
    ref: 'Class',
    index: true
  },
  className: {
    type: String,
    trim: true
  },
  
  // Estados
  status: {
    type: String,
    enum: ['PENDING', 'CONTACTED', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  
  // Datas
  requestedDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  contactedDate: {
    type: Date,
    index: true
  },
  responseDate: {
    type: Date,
    index: true
  },
  completedDate: {
    type: Date,
    index: true
  },
  
  // Detalhes
  testimonyType: {
    type: String,
    enum: ['TEXT', 'VIDEO', 'AUDIO', 'IMAGE']
  },
  testimonyContent: {
    type: String,
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  
  // Observações
  notes: {
    type: String,
    trim: true
  },
  contactMethod: {
    type: String,
    enum: ['EMAIL', 'DISCORD', 'WHATSAPP', 'PHONE', 'OTHER']
  },
  declineReason: {
    type: String,
    trim: true
  },
  
  // Metadados
  requestedBy: {
    type: String,
    trim: true
  },
  processedBy: {
    type: String,
    trim: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM'
  },
  
  // Controle
  isVisible: {
    type: Boolean,
    default: true
  },
  isFeature: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'testimonials'
})

// Índices compostos para performance
TestimonialSchema.index({ status: 1, requestedDate: -1 })
TestimonialSchema.index({ studentEmail: 1, status: 1 })
TestimonialSchema.index({ classId: 1, status: 1 })
TestimonialSchema.index({ isVisible: 1, isFeature: 1 })
TestimonialSchema.index({ createdAt: -1 })

// Métodos do modelo
TestimonialSchema.methods.updateStatus = function(newStatus: string, processedBy?: string) {
  this.status = newStatus
  this.processedBy = processedBy
  
  const now = new Date()
  
  switch (newStatus) {
    case 'CONTACTED':
      if (!this.contactedDate) this.contactedDate = now
      break
    case 'ACCEPTED':
    case 'DECLINED':
      if (!this.responseDate) this.responseDate = now
      break
    case 'COMPLETED':
      if (!this.completedDate) this.completedDate = now
      break
  }
  
  return this.save()
}

// Middleware pre-save
TestimonialSchema.pre('save', function(next) {
  // Garantir que as datas estejam em ordem lógica
  if (this.responseDate && this.contactedDate && this.responseDate < this.contactedDate) {
    this.responseDate = this.contactedDate
  }
  
  if (this.completedDate && this.responseDate && this.completedDate < this.responseDate) {
    this.completedDate = this.responseDate
  }
  
  next()
})

export const Testimonial = mongoose.model<ITestimonial>('Testimonial', TestimonialSchema)