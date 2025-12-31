// ═══════════════════════════════════════════════════════════
// 🔄 SYNC: Active Campaign → Base de Dados
// 
// PROBLEMA: UserProduct.activeCampaignData.tags está desatualizado
// SOLUÇÃO: Buscar tags do AC e atualizar BD
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import '../src/models'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import activeCampaignService from '../src/services/ac/activeCampaignService'

const EMAIL = 'rui.santos@serriquinho.com'

async function main() {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB\n')
    
    console.log('═'.repeat(70))
    console.log(`🔄 SYNC AC → BD: ${EMAIL}`)
    console.log('═'.repeat(70))
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR USER
    // ═══════════════════════════════════════════════════════════
    
    const user = await User.findOne({ email: EMAIL })
    if (!user) {
      console.log('❌ User não encontrado!')
      return
    }
    
    console.log(`👤 User: ${EMAIL}`)
    console.log(`   ID: ${user._id}`)
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR TAGS DO ACTIVE CAMPAIGN
    // ═══════════════════════════════════════════════════════════
    
    console.log('📡 Buscando tags do Active Campaign...')
    
    let acTags: string[] = []
    try {
      // Buscar contacto no AC
      const response = await activeCampaignService.getContactByEmail(EMAIL)
      
      if (!response || !response.contact) {
        console.log('⚠️  Contacto não encontrado no AC')
        return
      }
      
      const contactId = response.contact.id
      console.log(`✅ Contacto encontrado: ${contactId}`)
      
      // Buscar tags do contacto
      const contactTags = await activeCampaignService.getContactTags(contactId)
      
      if (contactTags && Array.isArray(contactTags)) {
        // ✅ EXTRAIR APENAS OS NOMES DAS TAGS
        acTags = contactTags
          .map((tagObj: any) => tagObj.tag)
          .filter((tag: string) => !!tag)
        
        console.log(`✅ ${acTags.length} tags encontradas no AC`)
      } else {
        console.log('⚠️  Sem tags no AC')
      }
    } catch (error: any) {
      console.log(`❌ Erro ao buscar AC: ${error.message}`)
      return
    }
    
    console.log()
    console.log('🏷️  TAGS NO ACTIVE CAMPAIGN:')
    if (acTags.length === 0) {
      console.log('   (sem tags)')
    } else {
      acTags.forEach(tag => console.log(`   - ${tag}`))
    }
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR USERPRODUCTS E COMPARAR
    // ═══════════════════════════════════════════════════════════
    
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code')
    
    console.log('📦 USERPRODUCTS:')
    console.log()
    
    for (const up of userProducts) {
      const product = (up as any).productId
      const productCode = product?.code || 'N/A'
      
      const bdTags = up.activeCampaignData?.tags || []
      
      console.log(`   ${productCode}:`)
      console.log(`      BD: [${bdTags.join(', ') || 'vazio'}]`)
      console.log()
      
      // Atualizar com tags do AC
      if (!up.activeCampaignData) {
        up.activeCampaignData = {} as any
      }
      
      up.activeCampaignData.tags = acTags
      up.activeCampaignData.lastSyncAt = new Date()
      
      await up.save()
      
      console.log(`      ✅ Atualizado: [${acTags.join(', ')}]`)
      console.log()
    }
    
    console.log('═'.repeat(70))
    console.log('✅ SYNC COMPLETO!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📊 RESUMO:')
    console.log(`   Tags no AC: ${acTags.length}`)
    console.log(`   UserProducts atualizados: ${userProducts.length}`)
    console.log()

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado')
  }
}

main()