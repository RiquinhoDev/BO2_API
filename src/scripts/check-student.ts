// Script para verificar dados de um aluno específico
import mongoose from 'mongoose'
import User from '../models/user'
import dotenv from 'dotenv'

dotenv.config()

async function checkStudent() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    const email = 'joaomcf37@gmail.com'
    const discordId = '924421751784497252'

    console.log(`📧 Buscando aluno: ${email}\n`)

    // Buscar por email
    const user = await User.findOne({ email: email.toLowerCase() }).lean()

    if (!user) {
      console.log('❌ Aluno não encontrado!')
      await mongoose.disconnect()
      return
    }

    console.log('✅ ALUNO ENCONTRADO!\n')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📋 INFORMAÇÕES BÁSICAS')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`Nome: ${(user as any).name}`)
    console.log(`Email: ${(user as any).email}`)
    console.log(`Status Global: ${(user as any).status || 'N/A'}`)
    console.log(`Combined Status: ${(user as any).combined?.status || 'N/A'}`)
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🎓 TURMA')
    console.log('═══════════════════════════════════════════════════════════')
    const classId = (user as any).combined?.classId || (user as any).classId || null
    console.log(`ClassId: ${classId || 'Sem turma'}`)
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('💬 DISCORD')
    console.log('═══════════════════════════════════════════════════════════')
    const discord = (user as any).discord
    if (discord) {
      console.log(`Discord IDs: ${discord.discordIds?.join(', ') || 'Nenhum'}`)
      console.log(`Ativo no Discord: ${discord.isActive ? '✅ Sim' : '❌ Não'}`)
      console.log(`Role: ${discord.role || 'N/A'}`)
      console.log(`Termos aceitos: ${discord.acceptedTerms ? '✅ Sim' : '❌ Não'}`)
    } else {
      console.log('❌ Sem dados do Discord')
    }
    console.log('')

    // Verificar se tem o Discord ID específico
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`🔍 VERIFICAÇÃO DO DISCORD ID: ${discordId}`)
    console.log('═══════════════════════════════════════════════════════════')
    const hasDiscordId = discord?.discordIds?.includes(discordId)
    if (hasDiscordId) {
      console.log(`✅ SIM! O aluno tem o Discord ID ${discordId}`)
    } else {
      console.log(`❌ NÃO! O aluno NÃO tem o Discord ID ${discordId}`)
      if (discord?.discordIds?.length > 0) {
        console.log(`   IDs registados: ${discord.discordIds.join(', ')}`)
      }
    }
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔴 INATIVAÇÃO')
    console.log('═══════════════════════════════════════════════════════════')
    const inactivation = (user as any).inactivation
    if (inactivation?.isManuallyInactivated) {
      console.log('⚠️  ALUNO ESTÁ INATIVADO MANUALMENTE')
      console.log(`   Inativado em: ${inactivation.inactivatedAt}`)
      console.log(`   Por: ${inactivation.inactivatedBy}`)
      console.log(`   Motivo: ${inactivation.reason || 'N/A'}`)
      console.log(`   Plataformas: ${inactivation.platforms?.join(', ') || 'N/A'}`)
    } else {
      console.log('✅ Aluno NÃO está inativado manualmente')
    }
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🛒 HOTMART')
    console.log('═══════════════════════════════════════════════════════════')
    const hotmart = (user as any).hotmart
    if (hotmart) {
      console.log(`Hotmart ID: ${hotmart.hotmartUserId || 'N/A'}`)
      console.log(`Status: ${hotmart.status || 'N/A'}`)
      console.log(`Data de compra: ${hotmart.purchaseDate || 'N/A'}`)
      console.log(`Último acesso: ${hotmart.lastAccessDate || 'N/A'}`)
      console.log(`Engagement: ${hotmart.engagement?.engagementLevel || 'N/A'} (${hotmart.engagement?.engagementScore || 0})`)
    } else {
      console.log('❌ Sem dados da Hotmart')
    }
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('📚 CURSEDUCA')
    console.log('═══════════════════════════════════════════════════════════')
    const curseduca = (user as any).curseduca
    if (curseduca) {
      console.log(`CursEduca ID: ${curseduca.curseducaUserId || 'N/A'}`)
      console.log(`Status: ${curseduca.memberStatus || 'N/A'}`)
      console.log(`Grupo: ${curseduca.groupName || 'N/A'}`)
      console.log(`Último login: ${curseduca.lastLogin || 'N/A'}`)
    } else {
      console.log('❌ Sem dados do CursEduca')
    }
    console.log('')

    await mongoose.disconnect()
    console.log('✅ Verificação completa!')
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

checkStudent()
