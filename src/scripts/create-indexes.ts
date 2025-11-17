// =====================================================
// 📁 src/scripts/create-indexes.ts
// SCRIPT: Criar índices do MongoDB
// =====================================================

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import ProductProfile from '../models/ProductProfile'
import StudentEngagementState from '../models/StudentEngagementState'
import CommunicationHistory from '../models/CommunicationHistory'

dotenv.config()

async function createIndexes() {
  try {
    console.log('🔗 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
    
    if (!mongoUri) {
      throw new Error('MONGO_URI ou MONGODB_URI não definido no .env')
    }
    
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado!\n')
    
    console.log('📊 Criando índices...\n')
    
    // ProductProfile
    console.log('1️⃣ ProductProfile...')
    await ProductProfile.collection.createIndexes()
    const ppIndexes = await ProductProfile.collection.getIndexes()
    console.log(`   ✅ ${Object.keys(ppIndexes).length} índices criados`)
    
    // StudentEngagementState
    console.log('2️⃣ StudentEngagementState...')
    await StudentEngagementState.collection.createIndexes()
    const sesIndexes = await StudentEngagementState.collection.getIndexes()
    console.log(`   ✅ ${Object.keys(sesIndexes).length} índices criados`)
    
    // CommunicationHistory
    console.log('3️⃣ CommunicationHistory...')
    await CommunicationHistory.collection.createIndexes()
    const chIndexes = await CommunicationHistory.collection.getIndexes()
    console.log(`   ✅ ${Object.keys(chIndexes).length} índices criados`)
    
    console.log('\n🎉 Todos os índices criados com sucesso!')
    console.log('\n📋 Resumo:')
    console.log(`   - ProductProfile: ${Object.keys(ppIndexes).length} índices`)
    console.log(`   - StudentEngagementState: ${Object.keys(sesIndexes).length} índices`)
    console.log(`   - CommunicationHistory: ${Object.keys(chIndexes).length} índices`)
    
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n👋 Desconectado do MongoDB')
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  createIndexes()
}

export default createIndexes

