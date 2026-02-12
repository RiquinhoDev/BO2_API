// Script de migração one-time: Atualizar webhooks antigos sem 'source'
import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function migrateWebhooks() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado ao MongoDB')

    // Buscar collection de webhooks
    const GuruWebhook = mongoose.connection.collection('guru_webhooks')

    // Contar webhooks sem source
    const count = await GuruWebhook.countDocuments({
      $or: [
        { source: { $exists: false } },
        { source: null }
      ]
    })

    console.log(`📊 Webhooks encontrados sem 'source': ${count}`)

    if (count === 0) {
      console.log('✅ Nenhum webhook precisa de migração')
      process.exit(0)
    }

    // Atualizar todos para source: 'manual'
    const result = await GuruWebhook.updateMany(
      {
        $or: [
          { source: { $exists: false } },
          { source: null }
        ]
      },
      {
        $set: { source: 'manual' }
      }
    )

    console.log(`✅ Webhooks migrados: ${result.modifiedCount}`)
    console.log(`📌 Total processado: ${result.matchedCount}`)

    process.exit(0)

  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

migrateWebhooks()
