// src/migrations/normalize-emails-and-recalculate.ts
// Migração para normalizar emails e recalcular combined data

import dotenv from 'dotenv'
import mongoose from 'mongoose'
import User from '../models/user'

// ✅ Carregar variáveis de ambiente
dotenv.config()

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/clareza'

async function normalizeEmailsAndRecalculate() {
  console.log('🚀 === MIGRAÇÃO: Normalizar Emails e Recalcular Dados ===\n')

  try {
    // 1. Conectar ao MongoDB
    console.log('1️⃣ Conectando ao MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Conectado ao MongoDB\n')

    // 2. Buscar todos os utilizadores
    console.log('2️⃣ Buscando todos os utilizadores...')
    const users = await User.find({})
    console.log(`✅ ${users.length} utilizadores encontrados\n`)

    // 3. Estatísticas
    let totalUpdated = 0
    let emailsNormalized = 0
    let dataRecalculated = 0

    // 4. Processar cada utilizador
    console.log('3️⃣ Processando utilizadores...\n')
    
    for (const user of users) {
      let wasUpdated = false

      // Normalizar email
      const originalEmail = user.email
      const normalizedEmail = originalEmail.toLowerCase().trim()
      
      if (originalEmail !== normalizedEmail) {
        console.log(`📧 ${originalEmail} → ${normalizedEmail}`)
        user.email = normalizedEmail
        emailsNormalized++
        wasUpdated = true
      }

      // Recalcular combined data
      user.calculateCombinedData()
      dataRecalculated++
      wasUpdated = true

      // Salvar
      if (wasUpdated) {
        await user.save()
        totalUpdated++
        
        // Log a cada 10 utilizadores
        if (totalUpdated % 10 === 0) {
          console.log(`   ✅ ${totalUpdated}/${users.length} processados...`)
        }
      }
    }

    // 5. Resultados
    console.log('\n📊 === RESULTADOS ===')
    console.log(`   Total de utilizadores: ${users.length}`)
    console.log(`   Emails normalizados: ${emailsNormalized}`)
    console.log(`   Dados recalculados: ${dataRecalculated}`)
    console.log(`   Total atualizado: ${totalUpdated}`)

    console.log('\n✅ Migração concluída com sucesso!')

    return {
      success: true,
      totalUsers: users.length,
      emailsNormalized,
      dataRecalculated,
      totalUpdated
    }

  } catch (error: any) {
    console.error('\n❌ Erro na migração:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Desconectado do MongoDB')
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  normalizeEmailsAndRecalculate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Erro fatal:', err)
      process.exit(1)
    })
}

export default normalizeEmailsAndRecalculate

