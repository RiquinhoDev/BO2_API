// ═══════════════════════════════════════════════════════════
// 🧹 CLEANUP: Rui Santos (DEBUG)
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
    console.log(`🧹 CLEANUP: ${EMAIL}`)
    console.log('═'.repeat(70))
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR USER E PRODUTOS
    // ═══════════════════════════════════════════════════════════
    
    const user = await User.findOne({ email: EMAIL })
    if (!user) {
      console.log('❌ User não encontrado!')
      return
    }
    
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code')
      .lean()
    
    console.log('👤 USER INFO:')
    console.log(`   Email: ${EMAIL}`)
    console.log(`   ID: ${user._id}`)
    console.log()
    
    console.log('📦 PRODUTOS QUE O USER TEM:')
    const userProductCodes: string[] = []
    for (const up of userProducts) {
      const code = String((up as any).productId?.code || '').toUpperCase()
      userProductCodes.push(code)
      console.log(`   - ${code}`)
    }
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR TAGS ATUAIS (DE TODOS OS USERPRODUCTS)
    // ═══════════════════════════════════════════════════════════
    
    const allCurrentTags = new Set<string>()
    
    console.log('🏷️  TAGS ATUAIS NA BD:')
    for (const up of userProducts) {
      const tags = (up as any).activeCampaignData?.tags || []
      const code = String((up as any).productId?.code || '')
      
      console.log(`   ${code}:`)
      if (tags.length === 0) {
        console.log(`      (sem tags)`)
      } else {
        tags.forEach((t: string) => {
          console.log(`      - ${t}`)
          allCurrentTags.add(t)
        })
      }
    }
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 3. ANALISAR CADA TAG
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔍 ANÁLISE DE TAGS:')
    console.log()
    
    const tagsToRemove: string[] = []
    
    for (const tag of allCurrentTags) {
      console.log(`   Tag: "${tag}"`)
      
      // REGRA 1: Tag de produto ANUAL (user NÃO tem)
      if (tag.includes('CLAREZA_ANUAL')) {
        const hasAnual = userProductCodes.some(code => code.includes('ANUAL'))
        if (!hasAnual) {
          console.log(`      ❌ REMOVER: User não tem produto ANUAL`)
          tagsToRemove.push(tag)
          continue
        }
      }
      
      // REGRA 2: Tag de produto MENSAL com prefixo errado
      if (tag.match(/^CLAREZA_MENSAL - /i)) {
        console.log(`      ❌ REMOVER: Formato antigo (duplicada)`)
        tagsToRemove.push(tag)
        continue
      }
      
      // REGRA 3: Tag "CLAREZA - Ativo" (antiga, deve ser substituída)
      if (tag === 'CLAREZA - Ativo') {
        console.log(`      ❌ REMOVER: Tag antiga (será substituída por "Novo Aluno")`)
        tagsToRemove.push(tag)
        continue
      }
      
      // REGRA 4: Tag OGI antiga
      if (tag.match(/^OGI - /i)) {
        console.log(`      ❌ REMOVER: Formato antigo OGI`)
        tagsToRemove.push(tag)
        continue
      }
      
      console.log(`      ✅ MANTER`)
    }
    
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 4. EXECUTAR REMOÇÃO
    // ═══════════════════════════════════════════════════════════
    
    if (tagsToRemove.length === 0) {
      console.log('✅ Nenhuma tag para remover!')
      return
    }
    
    console.log('═'.repeat(70))
    console.log(`🗑️  REMOVENDO ${tagsToRemove.length} TAGS:`)
    console.log('═'.repeat(70))
    console.log()
    
    for (const tag of tagsToRemove) {
      console.log(`   Removendo: ${tag}`)
      try {
        await activeCampaignService.removeTag(EMAIL, tag)
        console.log(`   ✅ Removida com sucesso`)
      } catch (error: any) {
        console.log(`   ❌ Erro: ${error.message}`)
      }
    }
    
    console.log()
    console.log('═'.repeat(70))
    console.log('✅ CLEANUP COMPLETO!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📊 TAGS FINAIS ESPERADAS:')
    console.log('   CLAREZA_MENSAL:')
    console.log('      - CLAREZA - Novo Aluno')
    console.log('   OGI_V1:')
    console.log('      - OGI_V1 - Inativo 10d')
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