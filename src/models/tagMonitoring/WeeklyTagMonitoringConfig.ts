import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface para Configuração do Sistema de Monitorização Semanal
 * Singleton - apenas um documento existe na collection
 */
export interface IWeeklyTagMonitoringConfig extends Document {
  scope: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

const WeeklyTagMonitoringConfigSchema = new Schema<IWeeklyTagMonitoringConfig>(
  {
    scope: {
      type: String,
      enum: ['STUDENTS_ONLY', 'ALL_CONTACTS'],
      default: 'STUDENTS_ONLY',
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'weekly_tag_monitoring_config',
  }
)

// Garantir que apenas um documento existe (singleton pattern)
WeeklyTagMonitoringConfigSchema.pre('save', async function (next) {
  const count = await mongoose.model('WeeklyTagMonitoringConfig').countDocuments()

  if (count > 0 && this.isNew) {
    const error = new Error('Apenas uma configuração pode existir. Use updateConfig() para atualizar.')
    return next(error)
  }

  next()
})

// Métodos estáticos
WeeklyTagMonitoringConfigSchema.statics.getConfig = async function (): Promise<IWeeklyTagMonitoringConfig> {
  let config = await this.findOne()

  // Criar configuração default se não existir
  if (!config) {
    config = await this.create({
      scope: 'STUDENTS_ONLY',
      enabled: true,
    })
  }

  return config
}

WeeklyTagMonitoringConfigSchema.statics.updateScope = async function (
  scope: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
): Promise<IWeeklyTagMonitoringConfig> {
  let config = await this.findOne()

  if (!config) {
    config = await this.create({ scope, enabled: true })
  } else {
    config.scope = scope
    await config.save()
  }

  return config
}

WeeklyTagMonitoringConfigSchema.statics.toggleEnabled = async function (): Promise<IWeeklyTagMonitoringConfig> {
  let config = await this.findOne()

  if (!config) {
    config = await this.create({ scope: 'STUDENTS_ONLY', enabled: true })
  } else {
    config.enabled = !config.enabled
    await config.save()
  }

  return config
}

const WeeklyTagMonitoringConfig = mongoose.model<IWeeklyTagMonitoringConfig>(
  'WeeklyTagMonitoringConfig',
  WeeklyTagMonitoringConfigSchema
)

export default WeeklyTagMonitoringConfig
