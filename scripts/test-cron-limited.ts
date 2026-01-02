// ════════════════════════════════════════════════════════════
// 🧪 SCRIPT DE TESTE - RUI SANTOS
// Testa a solução de sync AC ↔ BD
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import activeCampaignService from '../src/services/ac/activeCampaignService'
import { tagOrchestratorV2 } from '../src/services/ac/tagOrchestrator.service'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

const TEST_EMAIL = 'rui.santos@serriquinho.com'

const BO_TAG_PREFIXES = [
  'CLAREZA_MENSAL',
  'CLAREZA_ANUAL',
  'CLAREZA -',
  'CLAREZA-',
  'OGI_V1',
  'OGI -',
  'DISCORD_COMMUNITY'
]

// ═══════════════════════════════════════════════════════════
// HELPER: Comparar arrays
// ═══════════════════════════════════════════════════════════
function arrayDiff(arr1: string[], arr2: string[]) {
  return {
    added: arr2.filter(x => !arr1.includes(x)),
    removed: arr1.filter(x => !arr2.includes(x)),
    unchanged: arr1.filter(x => arr2.includes(x))
  }
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOT: Estado antes/depois
// ═══════════════════════════════════════════════════════════
interface Snapshot {
  timestamp: Date
  acTags: string[]
  acTagsBO: string[]
  bdTags: {
    [productCode: string]: string[]
  }
}

async function captureSnapshot(userId: string): Promise<Snapshot> {
  const user = await User.findById(userId)
  if (!user) throw new Error('User não encontrado')
  
  // Tags do Active Campaign
  const acTags = await activeCampaignService.getContactTagsByEmail(user.email)
  
  // Filtrar tags geridas pelo BO
  const acTagsBO = acTags.filter(tag =>
    BO_TAG_PREFIXES.some(p => tag.toUpperCase().startsWith(p))
  )
  
  // Tags da BD (por produto)
  const userProducts = await UserProduct.find({ userId })
    .populate('productId', 'code name')
  
  const bdTags: { [key: string]: string[] } = {}
  
  for (const up of userProducts) {
    const product = (up as any).productId
    bdTags[product.code] = up.activeCampaignData?.tags || []
  }
  
  return {
    timestamp: new Date(),
    acTags,
    acTagsBO,
    bdTags
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN TEST
// ═══════════════════════════════════════════════════════════
async function testRuiSantos() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 TESTE DE SYNC AC ↔ BD - RUI SANTOS')
  console.log('═'.repeat(70))
  console.log()
  console.log(`📧 Email: ${TEST_EMAIL}`)
  console.log(`🕐 Data: ${new Date().toISOString()}`)
  console.log()
  
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR USER
    // ═══════════════════════════════════════════════════════════
    const user = await User.findOne({ email: TEST_EMAIL })
    
    if (!user) {
      console.log(`❌ User não encontrado: ${TEST_EMAIL}`)
      await mongoose.disconnect()
      return
    }
    
    console.log(`✅ User encontrado: ${user._id}`)
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 2. SNAPSHOT ANTES
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('📸 SNAPSHOT ANTES')
    console.log('═'.repeat(70))
    console.log()
    
    const snapshotBefore = await captureSnapshot(user.id.toString())
    
    console.log(`📊 Tags no Active Campaign (total): ${snapshotBefore.acTags.length}`)
    if (snapshotBefore.acTags.length > 0) {
      snapshotBefore.acTags.forEach((tag, i) => {
        const isBO = BO_TAG_PREFIXES.some(p => tag.toUpperCase().startsWith(p))
        console.log(`   ${i + 1}. ${tag} ${isBO ? '← BO' : ''}`)
      })
      console.log()
    }
    
    console.log(`📊 Tags geridas pelo BO (no AC): ${snapshotBefore.acTagsBO.length}`)
    if (snapshotBefore.acTagsBO.length > 0) {
      snapshotBefore.acTagsBO.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log()
    }
    
    console.log(`📊 Tags na BD (por produto):`)
    for (const [productCode, tags] of Object.entries(snapshotBefore.bdTags)) {
      console.log(`   ${productCode}: ${tags.length} tags`)
      tags.forEach((tag, i) => {
        console.log(`      ${i + 1}. ${tag}`)
      })
    }
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 3. ANÁLISE DE ÓRFÃS
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('🔍 ANÁLISE DE TAGS ÓRFÃS')
    console.log('═'.repeat(70))
    console.log()
    
    const allBDTags = Object.values(snapshotBefore.bdTags).flat()
    const orphanTags = snapshotBefore.acTagsBO.filter(tag => !allBDTags.includes(tag))
    
    if (orphanTags.length === 0) {
      console.log('✅ Nenhuma tag órfã encontrada!')
      console.log('   AC e BD estão sincronizados.')
      console.log()
    } else {
      console.log(`⚠️  ${orphanTags.length} tags órfãs encontradas:`)
      console.log(`   (no AC mas não na BD)`)
      console.log()
      orphanTags.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // 4. EXECUTAR ORQUESTRAÇÃO (COM FIX)
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('🔄 EXECUTANDO ORQUESTRAÇÃO (COM SYNC AC)')
    console.log('═'.repeat(70))
    console.log()
    
    const userProducts = await UserProduct.find({ userId: user._id })
    
    console.log(`📦 UserProducts a processar: ${userProducts.length}`)
    console.log()
    
    const results = []
    
    for (const up of userProducts) {
      const product = await Product.findById(up.productId)
      if (!product) continue
      
      console.log(`\n🔄 Orquestrando: ${product.code}`)
      console.log('-'.repeat(70))
      
      const result = await tagOrchestratorV2.orchestrateUserProduct(
        user.id.toString(),
        product._id.toString()
      )
      
      results.push(result)
      
      console.log(`   ✅ Success: ${result.success}`)
      console.log(`   📊 Tags aplicadas: ${result.tagsApplied.length}`)
      console.log(`   📊 Tags removidas: ${result.tagsRemoved.length}`)
      
      if (result.tagsApplied.length > 0) {
        console.log(`   ➕ Aplicadas:`)
        result.tagsApplied.forEach(tag => console.log(`      - ${tag}`))
      }
      
      if (result.tagsRemoved.length > 0) {
        console.log(`   ➖ Removidas:`)
        result.tagsRemoved.forEach(tag => console.log(`      - ${tag}`))
      }
      
      if (result.error) {
        console.log(`   ❌ Erro: ${result.error}`)
      }
      
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // 5. SNAPSHOT DEPOIS
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('📸 SNAPSHOT DEPOIS')
    console.log('═'.repeat(70))
    console.log()
    
    // Aguardar 2s para AC processar
    console.log('⏳ Aguardando 2s para Active Campaign processar...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const snapshotAfter = await captureSnapshot(user.id.toString())
    
    console.log(`📊 Tags no Active Campaign (total): ${snapshotAfter.acTags.length}`)
    console.log(`📊 Tags geridas pelo BO (no AC): ${snapshotAfter.acTagsBO.length}`)
    if (snapshotAfter.acTagsBO.length > 0) {
      snapshotAfter.acTagsBO.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // 6. COMPARAÇÃO ANTES/DEPOIS
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('📊 COMPARAÇÃO ANTES/DEPOIS')
    console.log('═'.repeat(70))
    console.log()
    
    const diff = arrayDiff(snapshotBefore.acTagsBO, snapshotAfter.acTagsBO)
    
    console.log(`📊 Tags geridas pelo BO:`)
    console.log(`   Antes: ${snapshotBefore.acTagsBO.length}`)
    console.log(`   Depois: ${snapshotAfter.acTagsBO.length}`)
    console.log(`   Removidas: ${diff.removed.length}`)
    console.log(`   Adicionadas: ${diff.added.length}`)
    console.log(`   Sem alteração: ${diff.unchanged.length}`)
    console.log()
    
    if (diff.removed.length > 0) {
      console.log(`➖ Removidas do AC:`)
      diff.removed.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log()
    }
    
    if (diff.added.length > 0) {
      console.log(`➕ Adicionadas ao AC:`)
      diff.added.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // 7. VALIDAÇÃO FINAL
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('✅ VALIDAÇÃO FINAL')
    console.log('═'.repeat(70))
    console.log()
    
    const remainingOrphans = snapshotAfter.acTagsBO.filter(tag => 
      !Object.values(snapshotAfter.bdTags).flat().includes(tag)
    )
    
    if (remainingOrphans.length === 0) {
      console.log('🎉 SUCESSO TOTAL!')
      console.log('   ✅ Todas as tags órfãs foram removidas')
      console.log('   ✅ AC e BD estão sincronizados')
      console.log()
    } else {
      console.log(`⚠️  Ainda existem ${remainingOrphans.length} tags órfãs:`)
      remainingOrphans.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log()
      console.log('💡 Pode ser necessário executar novamente.')
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // 8. RESUMO
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(70))
    console.log('📋 RESUMO')
    console.log('═'.repeat(70))
    console.log()
    
    const totalApplied = results.reduce((sum, r) => sum + r.tagsApplied.length, 0)
    const totalRemoved = results.reduce((sum, r) => sum + r.tagsRemoved.length, 0)
    const totalSuccess = results.filter(r => r.success).length
    
    console.log(`✅ UserProducts processados: ${results.length}`)
    console.log(`✅ Orquestrações bem-sucedidas: ${totalSuccess}/${results.length}`)
    console.log(`➕ Total tags aplicadas: ${totalApplied}`)
    console.log(`➖ Total tags removidas: ${totalRemoved}`)
    console.log()
    
    if (orphanTags.length > 0) {
      const orphansRemoved = orphanTags.length - remainingOrphans.length
      console.log(`🗑️  Tags órfãs removidas: ${orphansRemoved}/${orphanTags.length}`)
      console.log()
    }
    
    await mongoose.disconnect()
    console.log('✅ Teste completo')
    console.log()
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect()
    }
  }
}

testRuiSantos()