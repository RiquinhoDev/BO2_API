// src/models/index.ts
// Este arquivo garante que todos os modelos sejam importados e disponíveis
// Previne recompilação durante hot reload

import mongoose from 'mongoose'

// Importar todos os models para garantir que estão registrados
import './user'
import './Admin'
import './Class'
import './ClassAnalytics'
import './CommunicationHistory'
import './Course'
import './CronConfig'
import './CronExecution'
import './CronExecutionLog'
import './HotmartWebhook'
import './IdsDiferentes'
import './InactivationList'
import './StudentClassHistory'
import './SyncHistory'
import './TagRule'
import './Testimonial'
import './UnmatchedUser'
import './UserAction'
import './UserHistory'

// ===== NOVOS MODELS: RE-ENGAGEMENT SYSTEM =====
import './ProductProfile'
import './StudentEngagementState'

// ===== NOVOS MODELS: ARCHITECTURE V2 =====
import './Product'
import './UserProduct'

// ===== SPRINT 5: CONTACT TAG READER =====
import './ACContactState'

// ===== DASHBOARD STATS: MATERIALIZED VIEW =====
import './DashboardStats'

// Exportar models para uso direto
export { default as User } from './user'
export { default as Admin } from './Admin'
export { default as Class } from './Class'
export { default as ClassAnalytics } from './ClassAnalytics'
export { default as CommunicationHistory } from './CommunicationHistory'
export { default as Course } from './Course'
export { default as CronConfig } from './CronConfig'
export { default as CronExecution } from './CronExecution'
export { default as CronExecutionLog } from './CronExecutionLog'
export { default as HotmartWebhook } from './HotmartWebhook'
export { default as IdsDiferentes } from './IdsDiferentes'
export { default as InactivationList } from './InactivationList'
export { default as StudentClassHistory } from './StudentClassHistory'
export { default as SyncHistory } from './SyncHistory'
export { default as TagRule } from './TagRule'
export { default as Testimonial } from './Testimonial'
export { default as UnmatchedUser } from './UnmatchedUser'
export { default as UserAction } from './UserAction'
export { default as UserHistory } from './UserHistory'

// ===== NOVOS EXPORTS: RE-ENGAGEMENT SYSTEM =====
export { default as ProductProfile } from './ProductProfile'
export { default as StudentEngagementState } from './StudentEngagementState'

// ===== NOVOS EXPORTS: ARCHITECTURE V2 =====
export { default as Product } from './Product'
export { default as UserProduct } from './UserProduct'

// ===== SPRINT 5: CONTACT TAG READER =====
export { default as ACContactState } from './ACContactState'

// ===== DASHBOARD STATS: MATERIALIZED VIEW =====
export { DashboardStats } from './DashboardStats'

// Função para verificar se um modelo está disponível
function ensureModel(modelName: string): boolean {
  if (mongoose.models[modelName]) {
    console.log(`ℹ️ Modelo ${modelName} já está disponível`)
    return true
  } else {
    console.warn(`⚠️ Modelo ${modelName} não está disponível`)
    return false
  }
}

// Verificar todos os modelos necessários
console.log('🔍 Verificando modelos disponíveis...')

const modelsToCheck = [
  'User',
  'Class', 
  'Testimonial',
  'Admin',
  'HotmartWebhook',
  'IdsDiferentes',
  'InactivationList',
  'StudentClassHistory',
  'SyncHistory',
  'UnmatchedUser',
  'ClassAnalytics',
  'CommunicationHistory',
  'Course',
  'CronConfig',
  'CronExecution',
  'CronExecutionLog',
  'TagRule',
  'UserAction',
  'UserHistory',
  // Novos models
  'ProductProfile',
  'StudentEngagementState',
  // Architecture V2
  'Product',
  'UserProduct',
  // Sprint 5
  'ACContactState',
  // Dashboard Stats
  'DashboardStats'
]

let availableModels = 0
modelsToCheck.forEach(modelName => {
  if (ensureModel(modelName)) {
    availableModels++
  }
})

console.log(`✅ Verificação concluída: ${availableModels}/${modelsToCheck.length} modelos disponíveis`)

// Se algum modelo crítico não estiver disponível, mostrar aviso
if (availableModels < modelsToCheck.length) {
  console.warn('⚠️ Alguns modelos não estão disponíveis. Verifique se foram importados corretamente.')
}
