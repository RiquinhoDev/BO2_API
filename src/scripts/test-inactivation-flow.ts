// Script para testar o fluxo completo de inativação incluindo chamada ao Discord
import mongoose from 'mongoose'
import User from '../models/User'
import UserProduct from '../models/UserProduct'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const testEmail = 'joaomcf37@gmail.com'
const testDiscordId = '924421751784497252'

async function testInactivationFlow() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🧪 TESTE DE FLUXO DE INATIVAÇÃO')
    console.log('═══════════════════════════════════════════════════════════\n')

    // 1. Buscar o usuário
    console.log(`🔍 Buscando usuário: ${testEmail}`)
    const user = await User.findOne({ email: testEmail })

    if (!user) {
      console.log('❌ Usuário não encontrado!')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Usuário encontrado: ${user.name}`)
    console.log(`   Discord IDs: ${(user as any).discord?.discordIds || 'Nenhum'}`)
    console.log(`   Status atual: ${(user as any).status}`)
    console.log(`   Combined status: ${(user as any).combined?.status}\n`)

    // 2. Verificar userProducts
    console.log(`🔍 Verificando userProducts...`)
    const userProducts = await UserProduct.find({ userId: user._id })
    console.log(`   Total de produtos: ${userProducts.length}`)
    userProducts.forEach((up: any) => {
      console.log(`   - ${up.platform}: ${up.status}`)
    })
    console.log('')

    // 3. REATIVAR o usuário primeiro
    console.log('🔄 PASSO 1: REATIVANDO o usuário...')
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          status: 'ACTIVE',
          'combined.status': 'ACTIVE',
          'inactivation.isManuallyInactivated': false,
          'discord.isActive': true
        }
      }
    )

    await UserProduct.updateMany(
      { userId: (user as any)._id },
      {
        $set: {
          status: 'ACTIVE'
        }
      }
    )

    console.log('✅ Usuário REATIVADO\n')
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 4. Verificar status após reativação
    const userAfterReactivation = await User.findOne({ email: testEmail })
    console.log('📊 Status após reativação:')
    console.log(`   status: ${(userAfterReactivation as any).status}`)
    console.log(`   combined.status: ${(userAfterReactivation as any).combined?.status}`)
    console.log(`   discord.isActive: ${(userAfterReactivation as any).discord?.isActive}`)
    console.log(`   isManuallyInactivated: ${(userAfterReactivation as any).inactivation?.isManuallyInactivated}\n`)

    // 5. INATIVAR através da API (simulando o frontend)
    console.log('🔄 PASSO 2: INATIVANDO através da API...')
    console.log(`   URL: ${process.env.VITE_API_URL || 'http://localhost:3000'}/api/classes/inactivateStudents\n`)

    try {
      const response = await axios.post(
        `${process.env.VITE_API_URL || 'http://localhost:3000'}/api/classes/inactivateStudents`,
        {
          students: [
            {
              userId: (user as any)._id.toString(),
              email: testEmail,
              name: (user as any).name,
              discordIds: [testDiscordId]
            }
          ],
          reason: 'TESTE - Verificação de integração Discord',
          removeFromClass: false
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )

      console.log('✅ Resposta da API:')
      console.log(`   Status HTTP: ${response.status}`)
      console.log(`   Resposta:`, JSON.stringify(response.data, null, 2))
      console.log('')

      // Verificar se houve chamada ao Discord
      if (response.data.discordResults) {
        console.log('📱 Resultados do Discord:')
        response.data.discordResults.forEach((result: any) => {
          console.log(`   - Discord ID: ${result.discordId}`)
          console.log(`     Status: ${result.status}`)
          if (result.error) {
            console.log(`     Erro: ${result.error}`)
          }
        })
      } else {
        console.log('⚠️  Nenhum resultado do Discord na resposta!')
      }
      console.log('')

    } catch (apiError: any) {
      console.log('❌ ERRO ao chamar API de inativação:')
      if (apiError.response) {
        console.log(`   Status HTTP: ${apiError.response.status}`)
        console.log(`   Erro:`, JSON.stringify(apiError.response.data, null, 2))
      } else if (apiError.request) {
        console.log(`   Nenhuma resposta recebida (timeout ou conexão recusada)`)
        console.log(`   Erro:`, apiError.message)
      } else {
        console.log(`   Erro:`, apiError.message)
      }
      console.log('')
    }

    // 6. Verificar status final na BD
    console.log('🔍 Verificando status final na base de dados...')
    const userAfterInactivation = await User.findOne({ email: testEmail })
    const userProductsAfterInactivation = await UserProduct.find({ userId: (user as any)._id })

    console.log('📊 Status final:')
    console.log(`   User.status: ${(userAfterInactivation as any).status}`)
    console.log(`   User.combined.status: ${(userAfterInactivation as any).combined?.status}`)
    console.log(`   User.discord.isActive: ${(userAfterInactivation as any).discord?.isActive}`)
    console.log(`   isManuallyInactivated: ${(userAfterInactivation as any).inactivation?.isManuallyInactivated}`)
    console.log(`   inactivatedAt: ${(userAfterInactivation as any).inactivation?.inactivatedAt}`)
    console.log(`   inactivatedBy: ${(userAfterInactivation as any).inactivation?.inactivatedBy}`)
    console.log(`   reason: ${(userAfterInactivation as any).inactivation?.reason}`)
    console.log('')

    console.log('   UserProducts:')
    userProductsAfterInactivation.forEach((up: any) => {
      console.log(`   - ${up.platform}: ${up.status}`)
    })
    console.log('')

    // 7. Testar diretamente o endpoint do Discord
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🧪 TESTE DIRETO DO ENDPOINT DISCORD')
    console.log('═══════════════════════════════════════════════════════════\n')

    const discordBotUrl = process.env.DISCORD_BOT_URL || 'https://api.serriquinho.com'
    console.log(`URL do bot: ${discordBotUrl}`)
    console.log(`Endpoint: POST ${discordBotUrl}/remove-roles\n`)

    try {
      console.log('📤 Enviando request para remover roles...')
      const discordResponse = await axios.post(
        `${discordBotUrl}/remove-roles`,
        {
          discordIds: [testDiscordId],
          reason: 'TESTE - Verificação manual'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )

      console.log('✅ Resposta do Discord Bot:')
      console.log(`   Status HTTP: ${discordResponse.status}`)
      console.log(`   Resposta:`, JSON.stringify(discordResponse.data, null, 2))
      console.log('')

    } catch (discordError: any) {
      console.log('❌ ERRO ao chamar Discord Bot:')
      if (discordError.response) {
        console.log(`   Status HTTP: ${discordError.response.status}`)
        console.log(`   Erro:`, JSON.stringify(discordError.response.data, null, 2))
      } else if (discordError.request) {
        console.log(`   Nenhuma resposta recebida`)
        console.log(`   URL tentada: ${discordBotUrl}/remove-roles`)
      } else {
        console.log(`   Erro:`, discordError.message)
      }
      console.log('')
    }

    await mongoose.disconnect()
    console.log('✅ Teste completo!')

  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

testInactivationFlow()
