// ═══════════════════════════════════════════════════════════
// 🔍 VERIFICAR: Tags no Active Campaign APÓS cleanup
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import '../src/models'
import activeCampaignService from '../src/services/ac/activeCampaignService'

const EMAIL = 'rui.santos@serriquinho.com'

async function main() {
  try {
        await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('✅ Conectado à MongoDB\n')
    
    console.log('═'.repeat(70))
    console.log(`🔍 VERIFICAR TAGS NO AC: ${EMAIL}`)
    console.log('═'.repeat(70))
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR CONTACTO
    // ═══════════════════════════════════════════════════════════
    
    console.log('📡 Buscando contacto no Active Campaign...')
    const response = await activeCampaignService.getContactByEmail(EMAIL)
    
    if (!response || !response.contact) {
      console.log('❌ Contacto não encontrado!')
      return
    }
    
    const contactId = response.contact.id
    console.log(`✅ Contacto encontrado: ${contactId}`)
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR TAGS ATUAIS
    // ═══════════════════════════════════════════════════════════
    
    console.log('🏷️  Buscando tags do contacto...')
    const contactTags = await activeCampaignService.getContactTags(contactId)
    
    if (!contactTags || !Array.isArray(contactTags)) {
      console.log('⚠️  Sem tags ou erro ao buscar')
      return
    }
    
    const tagNames = contactTags
      .map((tagObj: any) => tagObj.tag)
      .filter((tag: string) => !!tag)
    
    console.log(`✅ ${tagNames.length} tags encontradas`)
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 3. LISTAR TAGS COM DETALHES
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('📋 TAGS NO ACTIVE CAMPAIGN (AGORA):')
    console.log('═'.repeat(70))
    console.log()
    
    if (tagNames.length === 0) {
      console.log('   (sem tags)')
    } else {
      tagNames.forEach((tag: string, i: number) => {
        const tagObj = contactTags[i]
        console.log(`${i + 1}. ${tag}`)
        console.log(`   ID: ${tagObj.id}`)
        console.log(`   Criada: ${tagObj.cdate}`)
        console.log()
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // 4. ANÁLISE
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('📊 ANÁLISE:')
    console.log('═'.repeat(70))
    console.log()
    
    const tagsEsperadas = [
      'Acedeu ao curso',
      'OGI_V1 - Inativo 10d',
      'CLAREZA - Novo Aluno'
    ]
    
    const tagsNaoEsperadas = tagNames.filter(
      (tag: string) => !tagsEsperadas.includes(tag)
    )
    
    console.log('✅ TAGS ESPERADAS (devem estar):')
    tagsEsperadas.forEach(tag => {
      const exists = tagNames.includes(tag)
      console.log(`   ${exists ? '✅' : '❌'} ${tag}`)
    })
    console.log()
    
    if (tagsNaoEsperadas.length > 0) {
      console.log('❌ TAGS NÃO ESPERADAS (NÃO deviam estar):')
      tagsNaoEsperadas.forEach(tag => console.log(`   ❌ ${tag}`))
      console.log()
      console.log('⚠️  PROBLEMA: Tags que foram removidas VOLTARAM!')
      console.log()
      console.log('🔍 POSSÍVEIS CAUSAS:')
      console.log('   1. Automação do Active Campaign a readicionar tags')
      console.log('   2. CRON a correr em paralelo')
      console.log('   3. Cache do Active Campaign (tentar refresh na interface)')
      console.log()
    } else {
      console.log('✅ TUDO CORRETO! Apenas tags esperadas presentes.')
    }
    
    console.log('═'.repeat(70))

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Desconectado')
  }
}

main()