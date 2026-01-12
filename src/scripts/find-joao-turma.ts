import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function findJoaoTurma() {
  await mongoose.connect(process.env.MONGO_URI || '')

  // Tentar buscar na coleção antiga 'users'
  const OldUser = mongoose.model('OldUser', new mongoose.Schema({}, { strict: false }), 'users')

  const oldUser = await OldUser.findOne({ email: 'joaomcf37@gmail.com' })

  if (oldUser) {
    console.log('📊 Dados do João (modelo antigo):')
    console.log('   Email:', (oldUser as any).email)
    console.log('   Nome:', (oldUser as any).name)
    console.log('   Discord ID:', (oldUser as any).discordId)
    console.log('   Discord IDs (array):', (oldUser as any).discordIds)
    console.log('   ClassID:', (oldUser as any).classId)
    console.log('   Estado:', (oldUser as any).estado)
  } else {
    console.log('Usuário não encontrado no modelo antigo')
  }

  await mongoose.disconnect()
}

findJoaoTurma()
