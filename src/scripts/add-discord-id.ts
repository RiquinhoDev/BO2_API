// Script para adicionar Discord ID a um aluno
import mongoose from 'mongoose'
import User from '../models/user'
import dotenv from 'dotenv'

dotenv.config()

async function addDiscordId() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    const email = 'joaomcf37@gmail.com'
    const discordId = '924421751784497252'

    console.log(`📧 Buscando aluno: ${email}`)
    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      console.log('❌ Aluno não encontrado!')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Aluno encontrado: ${(user as any).name}\n`)

    // Verificar se já tem Discord IDs
    const currentDiscordIds = (user as any).discord?.discordIds || []
    console.log(`Discord IDs atuais: ${currentDiscordIds.length > 0 ? currentDiscordIds.join(', ') : 'Nenhum'}`)

    if (currentDiscordIds.includes(discordId)) {
      console.log(`⚠️  Discord ID ${discordId} já está registado!`)
      await mongoose.disconnect()
      return
    }

    // Adicionar Discord ID
    console.log(`\n➕ Adicionando Discord ID: ${discordId}...`)

    await User.findByIdAndUpdate((user as any)._id, {
      $set: {
        'discord.discordIds': [discordId],
        'discord.isActive': true,
        'discord.role': 'STUDENT',
        'discord.acceptedTerms': true
      }
    })

    console.log('✅ Discord ID adicionado com sucesso!\n')

    // Verificar
    const updatedUser = await User.findOne({ email: email.toLowerCase() }).lean()
    console.log('📋 Verificação:')
    console.log(`   Discord IDs: ${(updatedUser as any).discord?.discordIds?.join(', ')}`)
    console.log(`   Ativo: ${(updatedUser as any).discord?.isActive ? '✅' : '❌'}`)

    await mongoose.disconnect()
    console.log('\n✅ Concluído!')
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

addDiscordId()
