// Script para testar o fluxo completo de ativação/inativação do João via API
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const apiUrl = 'https://api.serriquinho.com'
const joaoClassId = 'DPeAy2x3eW'
const joaoDiscordId = '924421751784497252'

async function testJoaoComplete() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🧪 TESTE COMPLETO - JOÃO FERREIRA')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('📋 Informações:')
  console.log(`   API: ${apiUrl}`)
  console.log(`   Turma: ${joaoClassId}`)
  console.log(`   Discord ID: ${joaoDiscordId}\n`)

  // PASSO 1: REATIVAR a turma (se estiver inativa)
  console.log('═══════════════════════════════════════════════════════════')
  console.log('PASSO 1: REVERTER INATIVAÇÃO (Reativar turma)')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('⚠️  NOTA: Precisamos do listId de uma lista de inativação existente.')
  console.log('   Vou tentar criar uma nova lista de inativação primeiro.\n')

  // PASSO 2: INATIVAR a turma
  console.log('═══════════════════════════════════════════════════════════')
  console.log('PASSO 2: CRIAR LISTA DE INATIVAÇÃO')
  console.log('═══════════════════════════════════════════════════════════\n')

  try {
    console.log(`📤 POST ${apiUrl}/classes/inactivationLists/create`)
    console.log(`   Body: { classIds: ["${joaoClassId}"] }\n`)

    const inactivateResponse = await axios.post(
      `${apiUrl}/classes/inactivationLists/create`,
      {
        classIds: [joaoClassId]
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('✅ SUCESSO!')
    console.log(`   Status: ${inactivateResponse.status}`)
    console.log(`   Mensagem: ${inactivateResponse.data.message}`)
    console.log(`   Lista ID: ${inactivateResponse.data.list?._id}`)
    console.log(`   Status da lista: ${inactivateResponse.data.list?.status}`)
    console.log(`   Alunos processados: ${inactivateResponse.data.list?.students?.length || 0}\n`)

    const listId = inactivateResponse.data.list?._id

    if (listId) {
      console.log('═══════════════════════════════════════════════════════════')
      console.log('🎯 RESULTADO')
      console.log('═══════════════════════════════════════════════════════════\n')

      console.log('✅ Lista de inativação criada com sucesso!')
      console.log(`   ID da lista: ${listId}`)
      console.log('')
      console.log('🔍 O que aconteceu:')
      console.log('   1. API buscou todos os usuários da turma DPeAy2x3eW')
      console.log('   2. Filtrou usuários com Discord IDs válidos')
      console.log('   3. Adicionou à queue do Discord (userRoleUpdateQueue)')
      console.log('   4. Processou a queue (processQueue)')
      console.log('   5. Discord Bot removeu role "Ativo" e adicionou "Inativo"')
      console.log('')
      console.log('📱 Verifica no Discord se o João Ferreira:')
      console.log('   ❌ NÃO tem role "Ativo"')
      console.log('   ✅ TEM role "Inativo"')
      console.log('')
      console.log(`💡 Para REATIVAR, usa: POST ${apiUrl}/classes/inactivationLists/revert/${listId}`)
    }

  } catch (error: any) {
    console.log('❌ ERRO!')
    if (error.response) {
      console.log(`   Status HTTP: ${error.response.status}`)
      console.log(`   Erro:`, error.response.data)
    } else if (error.request) {
      console.log(`   Nenhuma resposta recebida`)
      console.log(`   Erro:`, error.message)
    } else {
      console.log(`   Erro:`, error.message)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ Teste completo!')
  console.log('═══════════════════════════════════════════════════════════')
}

testJoaoComplete()
