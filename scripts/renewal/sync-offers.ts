import 'dotenv/config'
import mongoose from 'mongoose'
import { syncRenewalOffers } from '../../src/services/renewal/renewalSync.service'

;(async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGO_URI ou MONGODB_URI não configurado')
  }

  await mongoose.connect(mongoUri)

  console.log('A sincronizar ofertas de renovação Hotmart...')
  const report = await syncRenewalOffers()

  console.log('Relatório de sincronização:')
  console.log(JSON.stringify(report, null, 2))

  await mongoose.disconnect()
  process.exit(0)
})().catch(async (error) => {
  console.error('Erro ao sincronizar ofertas de renovação:', error.message)
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  process.exit(1)
})
