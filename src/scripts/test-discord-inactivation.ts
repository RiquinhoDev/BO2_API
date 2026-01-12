// Script para testar inativação no Discord
import axios from 'axios'

async function testDiscordInactivation() {
  try {
    const discordId = '924421751784497252'
    const discordBotUrl = 'https://api.serriquinho.com'

    console.log('🤖 Testando inativação no Discord...\n')
    console.log(`📍 Bot URL: ${discordBotUrl}`)
    console.log(`👤 Discord ID: ${discordId}\n`)

    // 1. Testar health check
    console.log('1️⃣ Testando health check...')
    try {
      const healthResponse = await axios.get(`${discordBotUrl}/health`, { timeout: 5000 })
      console.log('✅ Bot está online!')
      console.log(`   Bot: ${healthResponse.data.bot?.username || 'N/A'}`)
      console.log(`   Guilds: ${healthResponse.data.bot?.guilds || 0}`)
      console.log(`   Ping: ${healthResponse.data.bot?.ping || 0}ms\n`)
    } catch (error: any) {
      console.error('❌ Health check falhou:', error.message, '\n')
    }

    // 2. Testar remoção de roles (inativação)
    console.log('2️⃣ Testando remoção de roles...')
    try {
      const response = await axios.post(
        `${discordBotUrl}/remove-roles`,
        {
          userId: discordId,
          reason: 'Teste de inativação via script - João Ferreira (joaomcf37@gmail.com)'
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      console.log('\n✅ RESPOSTA DO BOT:')
      console.log(JSON.stringify(response.data, null, 2))
      console.log('\n✅ Inativação no Discord testada com sucesso!')

    } catch (axiosError: any) {
      if (axiosError.response) {
        console.error('\n❌ ERRO HTTP:', axiosError.response.status)
        console.error('Resposta:', JSON.stringify(axiosError.response.data, null, 2))
      } else if (axiosError.code === 'ECONNREFUSED') {
        console.error('\n❌ ERRO: Não foi possível conectar ao bot do Discord')
        console.error(`   URL: ${discordBotUrl}`)
        console.error('   O bot está rodando?')
      } else if (axiosError.code === 'ETIMEDOUT') {
        console.error('\n❌ ERRO: Timeout ao conectar ao bot')
        console.error('   O bot demorou muito tempo para responder')
      } else {
        console.error('\n❌ ERRO:', axiosError.message)
      }
    }

  } catch (error: any) {
    console.error('❌ Erro geral:', error.message)
  }
}

testDiscordInactivation()
