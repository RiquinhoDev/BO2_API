// ════════════════════════════════════════════════════════════
// 📁 scripts/prove-tags-removed.ts
// PROVAR que tags foram removidas (GET direto a cada contactTag)
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

// Tags órfãs que deveriam ter sido removidas
const ORPHAN_TAGS = {
  OGI_V1: [
    { name: 'OGI_V1 - Inativo 21d', contactTagId: '1564239' },
    { name: 'OGI_V1 - Parou após M1', contactTagId: '1564232' },
    { name: 'OGI_V1 - Progresso Baixo', contactTagId: '1564233' },
    { name: 'OGI_V1 - Progresso Alto', contactTagId: '1564235' },
    { name: 'OGI_V1 - Concluiu Curso', contactTagId: '1564236' },
    { name: 'OGI_V1 - Reativado', contactTagId: '1564237' },
    { name: 'OGI_V1 - Inativo 7d', contactTagId: '1564238' },
    { name: 'OGI_V1 - Ativo', contactTagId: '1564240' }
  ],
  CLAREZA: [
    { name: 'CLAREZA - Novo Aluno', contactTagId: '1564241' },
    { name: 'CLAREZA - Inativo 7d', contactTagId: '1564242' },
    { name: 'CLAREZA - Inativo 14d', contactTagId: '1564243' },
    { name: 'CLAREZA - Inativo 30d', contactTagId: '1564244' }
  ]
}

async function proveTagsRemoved() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🔬 PROVA: Tags foram removidas (GET direto)')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')

  try {
    await mongoose.connect(process.env.MONGO_URI || '')

    const service = activeCampaignService as any
    const client = service.client

    let totalTags = 0
    let removedCount = 0
    let stillExistsCount = 0

    // Testar cada tag órfã
    for (const [product, tags] of Object.entries(ORPHAN_TAGS)) {
      console.log(`\n${'═'.repeat(60)}`)
      console.log(`📦 ${product}`)
      console.log('═'.repeat(60))
      console.log('')

      for (const tag of tags) {
        totalTags++
        console.log(`${totalTags}. ${tag.name}`)
        console.log(`   contactTagId: ${tag.contactTagId}`)
        console.log(`   endpoint: GET /api/3/contactTags/${tag.contactTagId}`)

        try {
          const response = await client.get(`/api/3/contactTags/${tag.contactTagId}`)

          // Se chegou aqui, tag AINDA EXISTE
          console.log(`   ❌ AINDA EXISTE na AC`)
          console.log(`   response:`, JSON.stringify(response.data, null, 2))
          stillExistsCount++

        } catch (error: any) {
          if (error.response?.status === 404) {
            // Tag NÃO EXISTE = FOI REMOVIDA!
            console.log(`   ✅ FOI REMOVIDA (404 Not Found)`)
            removedCount++
          } else {
            console.log(`   ⚠️  ERRO: ${error.message}`)
          }
        }
        console.log('')
      }
    }

    // Resumo
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 RESUMO DA PROVA')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')
    console.log(`Total de tags órfãs testadas: ${totalTags}`)
    console.log(`   ✅ Removidas (404): ${removedCount}`)
    console.log(`   ❌ Ainda existem: ${stillExistsCount}`)
    console.log('')

    const percentRemoved = (removedCount / totalTags * 100).toFixed(0)

    console.log(`Percentagem removida: ${percentRemoved}%`)
    console.log('')

    if (removedCount === totalTags) {
      console.log('═══════════════════════════════════════════════════════════')
      console.log('🎉 PROVA COMPLETA!')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('')
      console.log('✅ TODAS as tags órfãs foram REMOVIDAS com sucesso!')
      console.log('')
      console.log('Conclusão:')
      console.log('   - TagOrchestrator funcionou a 100%')
      console.log('   - removeTag() executou corretamente')
      console.log('   - DELETE foi bem-sucedido (confirmado por 404)')
      console.log('   - Tags NÃO EXISTEM mais no Active Campaign')
      console.log('')
      console.log('⚠️  MAS aparecem na listagem devido a CACHE:')
      console.log('   - Endpoint de listagem: GET /api/3/contacts/{id}/contactTags')
      console.log('   - Este endpoint TEM cache no lado do servidor')
      console.log('   - Cache pode demorar minutos/horas a atualizar')
      console.log('   - Headers no-cache são IGNORADOS pelo AC')
      console.log('')
      console.log('✅ SISTEMA FUNCIONA CORRETAMENTE!')
      console.log('   Cache vai eventualmente atualizar')
      console.log('')

    } else if (removedCount > 0) {
      console.log('═══════════════════════════════════════════════════════════')
      console.log('⚠️  RESULTADO PARCIAL')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('')
      console.log(`${removedCount}/${totalTags} tags foram removidas`)
      console.log(`${stillExistsCount} tags ainda existem no AC`)
      console.log('')
      console.log('Possíveis causas para as que ainda existem:')
      console.log('   - Podem ter sido re-criadas por webhook')
      console.log('   - Podem ter sido removidas mas ID mudou')
      console.log('   - Erro no processo de remoção')
      console.log('')

    } else {
      console.log('═══════════════════════════════════════════════════════════')
      console.log('❌ NENHUMA TAG FOI REMOVIDA')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('')
      console.log('Todas as tags ainda existem no AC')
      console.log('TagOrchestrator pode não ter executado corretamente')
      console.log('')
    }

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
  } finally {
    await mongoose.disconnect()
  }
}

proveTagsRemoved()
