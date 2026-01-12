// Script para testar o endpoint /discordAuth/assignRole do Discord Bot
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const testDiscordId = '924421751784497252'
const discordBotUrl = process.env.DISCORD_BOT_URL || 'https://api.serriquinho.com'

async function testDiscordAssignRole() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🧪 TESTE DO ENDPOINT /discordAuth/assignRole')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log(`Discord Bot URL: ${discordBotUrl}`)
  console.log(`Discord ID: ${testDiscordId}`)
  console.log(`Endpoint: POST ${discordBotUrl}/discordAuth/assignRole\n`)

  try {
    console.log('📤 Enviando request para atribuir roles...\n')

    const response = await axios.post(
      `${discordBotUrl}/discordAuth/assignRole`,
      {
        discordId: testDiscordId
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('✅ SUCESSO!')
    console.log(`   Status HTTP: ${response.status}`)
    console.log(`   Resposta:`, JSON.stringify(response.data, null, 2))
    console.log('')

    console.log('📋 O que este endpoint faz:')
    console.log('   1. Remove role "A validar" (se existir)')
    console.log('   2. Aguarda 5 segundos')
    console.log('   3. Adiciona role "Iniciado"')
    console.log('   4. Aguarda 5 segundos')
    console.log('   5. Adiciona role "Ativo"\n')

    console.log('⚠️  NOTA IMPORTANTE:')
    console.log('   Este endpoint ATIVA o usuário no Discord.')
    console.log('   Para INATIVAR, precisamos de um endpoint que:')
    console.log('   - Remova roles "Ativo" e "Iniciado"')
    console.log('   - Adicione role "Inativo"\n')

  } catch (error: any) {
    console.log('❌ ERRO!')
    if (error.response) {
      console.log(`   Status HTTP: ${error.response.status}`)
      console.log(`   Resposta:`, error.response.data)
    } else if (error.request) {
      console.log(`   Nenhuma resposta recebida`)
      console.log(`   URL tentada: ${discordBotUrl}/discordAuth/assignRole`)
      console.log(`   Erro:`, error.message)
    } else {
      console.log(`   Erro:`, error.message)
    }
    console.log('')
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log('✅ Teste completo!')
  console.log('═══════════════════════════════════════════════════════════')
}

testDiscordAssignRole()
