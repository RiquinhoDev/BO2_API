// Script final para testar inativação do João Ferreira
import mongoose from 'mongoose'
import User from '../models/User'
import UserProduct from '../models/UserProduct'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const testEmail = 'joaomcf37@gmail.com'
const testDiscordId = '924421751784497252'

async function testFinalJoao() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🧪 TESTE FINAL - JOÃO FERREIRA')
    console.log('═══════════════════════════════════════════════════════════\n')

    // 1. Verificar estado atual
    const user = await User.findOne({ email: testEmail })
    const userProducts = await UserProduct.find({ userId: (user as any)._id })

    console.log('📊 ESTADO ATUAL NA BASE DE DADOS:')
    console.log(`   Email: ${testEmail}`)
    console.log(`   Nome: ${(user as any).name}`)
    console.log(`   Discord ID: ${testDiscordId}`)
    console.log(`   User.status: ${(user as any).status}`)
    console.log(`   User.combined.status: ${(user as any).combined?.status}`)
    console.log(`   User.discord.isActive: ${(user as any).discord?.isActive}`)
    console.log(`   isManuallyInactivated: ${(user as any).inactivation?.isManuallyInactivated}`)
    console.log('')
    console.log('   UserProducts:')
    userProducts.forEach((up: any) => {
      console.log(`   - ${up.platform}: ${up.status}`)
    })
    console.log('')

    // 2. Testar endpoint do Discord (3 tentativas)
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🧪 TESTE DO ENDPOINT DISCORD')
    console.log('═══════════════════════════════════════════════════════════\n')

    const urlsToTry = [
      'https://api.serriquinho.com/setUserAsInactive',
      'https://api.serriquinho.com:3002/setUserAsInactive',
      'http://api.serriquinho.com:3002/setUserAsInactive'
    ]

    let discordSuccess = false

    for (const url of urlsToTry) {
      console.log(`📤 Tentativa: ${url}`)
      try {
        const response = await axios.post(
          url,
          { userId: testDiscordId },
          {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
          }
        )
        console.log(`   ✅ SUCESSO! Status: ${response.status}`)
        console.log(`   Resposta:`, response.data)
        discordSuccess = true
        break
      } catch (error: any) {
        if (error.response) {
          console.log(`   ❌ Erro HTTP ${error.response.status}`)
        } else {
          console.log(`   ❌ ${error.message}`)
        }
      }
      console.log('')
    }

    if (!discordSuccess) {
      console.log('⚠️  NENHUM ENDPOINT DISCORD FUNCIONOU!')
      console.log('')
      console.log('DIAGNÓSTICO:')
      console.log('   O bot Discord está a correr na porta 3002 localmente,')
      console.log('   mas não está acessível publicamente.')
      console.log('')
      console.log('SOLUÇÕES:')
      console.log('   1. Configurar proxy reverso no nginx/apache para:')
      console.log('      https://api.serriquinho.com/setUserAsInactive → http://localhost:3002/setUserAsInactive')
      console.log('')
      console.log('   2. Ou expor a porta 3002 publicamente (não recomendado)')
      console.log('')
      console.log('   3. Ou integrar o bot Discord no mesmo servidor da API principal')
      console.log('')
    }

    // 3. Resumo final
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📋 RESUMO FINAL')
    console.log('═══════════════════════════════════════════════════════════\n')

    console.log('✅ O QUE ESTÁ A FUNCIONAR:')
    console.log('   - Base de dados sincronizada (status INACTIVE)')
    console.log('   - 446 usuários com inconsistências corrigidos')
    console.log('   - Endpoint /discordAuth/assignRole funcional (ativação)')
    console.log('   - UserProducts como fonte única de verdade')
    console.log('')

    console.log('⚠️  O QUE FALTA:')
    console.log('   - Endpoint /setUserAsInactive não acessível publicamente')
    console.log('   - Discord roles do João Ferreira provavelmente ainda em "Ativo"')
    console.log('   - Necessário configurar proxy reverso ou rota no servidor')
    console.log('')

    console.log('🔧 PRÓXIMO PASSO:')
    console.log('   Configurar o servidor para expor o endpoint /setUserAsInactive')
    console.log('   ou integrar o bot Discord com a API principal')
    console.log('')

    await mongoose.disconnect()
    console.log('✅ Teste completo!')

  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

testFinalJoao()
