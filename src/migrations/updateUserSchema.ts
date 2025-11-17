// src/migrations/updateUserSchema.ts
import mongoose from 'mongoose'
import User from '../models/user'

export const updateUserProgressSchema = async () => {
  try {
    console.log('🔄 Atualizando schema do User para suportar lessons...')
    
    // Verificar se o campo progress.lessons já existe
    const existingSchema = User.schema
    const progressPath = existingSchema.path('progress')
    
    if (progressPath && progressPath instanceof mongoose.Schema.Types.Subdocument) {
      const progressSchema = (progressPath as any).schema
      
      // Adicionar campo lessons se não existir
      if (!progressSchema.path('lessons')) {
        progressSchema.add({
          lessons: [{
            pageId: { type: String, required: true },
            pageName: { type: String, required: true },
            moduleName: { type: String, required: true },
            isModuleExtra: { type: Boolean, default: false },
            isCompleted: { type: Boolean, default: false },
            completedDate: { type: Date }
          }]
        })
        console.log('✅ Campo progress.lessons adicionado')
      }
      
      // Adicionar campo lastUpdated se não existir
      if (!progressSchema.path('lastUpdated')) {
        progressSchema.add({
          lastUpdated: { type: Date, default: Date.now }
        })
        console.log('✅ Campo progress.lastUpdated adicionado')
      }
    } else {
      // Se progress não existe como subdocument, recriar completamente
      existingSchema.add({
        progress: {
          completedPercentage: { type: Number, default: 0, min: 0, max: 100 },
          total: { type: Number, default: 0, min: 0 },
          completed: { type: Number, default: 0, min: 0 },
          lessons: [{
            pageId: { type: String, required: true },
            pageName: { type: String, required: true },
            moduleName: { type: String, required: true },
            isModuleExtra: { type: Boolean, default: false },
            isCompleted: { type: Boolean, default: false },
            completedDate: { type: Date }
          }],
          lastUpdated: { type: Date, default: Date.now }
        }
      })
      console.log('✅ Schema progress completo adicionado')
    }
    
    console.log('🎯 Schema atualizado com sucesso!')
    return true
    
  } catch (error) {
    console.error('❌ Erro ao atualizar schema:', error)
    return false
  }
}

// Aplicar migração automaticamente quando importado
updateUserProgressSchema()