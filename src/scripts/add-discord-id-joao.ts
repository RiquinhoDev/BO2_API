import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function addDiscordIdJoao() {
  await mongoose.connect(process.env.MONGO_URI || '')

  // Coleção antiga 'users'
  const OldUser = mongoose.model('OldUser', new mongoose.Schema({}, { strict: false }), 'users')

  const discordId = '924421751784497252'
  const email = 'joaomcf37@gmail.com'

  console.log('🔍 Buscando João Ferreira...')
  const user = await OldUser.findOne({ email })

  if (!user) {
    console.log('❌ Usuário não encontrado!')
    await mongoose.disconnect()
    return
  }

  console.log('\n📊 Dados ANTES da atualização:')
  console.log('   Email:', (user as any).email)
  console.log('   Nome:', (user as any).name)
  console.log('   Discord ID (antigo):', (user as any).discordId)
  console.log('   Discord IDs (array):', (user as any).discordIds)

  // Atualizar com o Discord ID
  await OldUser.updateOne(
    { email },
    {
      $set: {
        discordId: discordId,
        discordIds: [discordId]
      }
    }
  )

  console.log('\n✅ Discord ID adicionado!')

  // Verificar
  const updatedUser = await OldUser.findOne({ email })
  console.log('\n📊 Dados DEPOIS da atualização:')
  console.log('   Email:', (updatedUser as any).email)
  console.log('   Nome:', (updatedUser as any).name)
  console.log('   Discord ID:', (updatedUser as any).discordId)
  console.log('   Discord IDs (array):', (updatedUser as any).discordIds)

  await mongoose.disconnect()
  console.log('\n✅ Concluído!')
}

addDiscordIdJoao()
