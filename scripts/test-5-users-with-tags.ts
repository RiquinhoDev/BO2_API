// ════════════════════════════════════════════════════════════
// 📁 scripts/test-5-users-with-tags.ts
// TESTE: Aplicar/Remover tags em 5 users que TÊM tags BO
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGODB_URI

async function main() {
  console.log('━'.repeat(60))
  console.log('🧪 TESTE: Aplicar/Remover tags em 5 users COM tags BO')
  console.log('━'.repeat(60))

  await mongoose.connect(MONGO_URI)
  console.log('✅ MongoDB conectado\n')

  // Imports
  const { User, UserProduct, Product } = await import('../src/models')
  const activeCampaignService = (await import('../src/services/activeCampaign/activeCampaignService')).default
  const tagOrchestratorV2 = (await import('../src/services/activeCampaign/tagOrchestrator.service')).default
  const { decisionEngine } = await import('../src/services/activeCampaign/decisionEngine.service')
  const TagRule = (await import('../src/models/acTags/TagRule')).default

  // Get BO tag names
  const allTagRules = await TagRule.find({ isActive: true }).select('actions.addTag').lean()
  const boTagNames = new Set<string>()
  for (const rule of allTagRules) {
    const tagName = (rule as any).actions?.addTag
    if (tagName) boTagNames.add(tagName)
  }
  console.log(`📋 Tags BO conhecidas (${boTagNames.size}): ${Array.from(boTagNames).slice(0, 5).join(', ')}...`)

  // Encontrar users que TÊM tags BO na AC
  console.log('\n🔍 A procurar users COM tags BO na AC...')

  const usersWithBoTags: any[] = []
  const allActiveUserProducts = await UserProduct.find({ status: 'ACTIVE' })
    .populate('userId', 'email name')
    .populate('productId', 'code name')
    .limit(100) // Check first 100
    .lean() as any[]

  for (const up of allActiveUserProducts) {
    if (usersWithBoTags.length >= 5) break
    if (!up.userId?.email) continue

    try {
      const acTags = await activeCampaignService.getContactTagsByEmail(up.userId.email)
      const boTags = acTags.filter((t: string) => boTagNames.has(t))

      if (boTags.length > 0) {
        usersWithBoTags.push({
          userProduct: up,
          email: up.userId.email,
          name: up.userId.name,
          productCode: up.productId?.code,
          currentBoTags: boTags
        })
        console.log(`   ✅ Encontrado: ${up.userId.email} - ${boTags.length} tags BO`)
      }
    } catch (err) {
      // skip
    }
  }

  if (usersWithBoTags.length === 0) {
    console.log('❌ Nenhum user com tags BO encontrado nos primeiros 100!')
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log(`\n🎯 Encontrados ${usersWithBoTags.length} users com tags BO\n`)

  // Processar cada user
  for (let i = 0; i < usersWithBoTags.length; i++) {
    const userData = usersWithBoTags[i]
    const up = userData.userProduct

    console.log('═'.repeat(60))
    console.log(`👤 USER ${i + 1}/${usersWithBoTags.length}: ${userData.email}`)
    console.log('═'.repeat(60))
    console.log(`   Produto: ${userData.productCode}`)
    console.log(`   Tags BO ANTES: [${userData.currentBoTags.join(', ')}]`)

    // Calcular tags esperadas
    const userIdStr = up.userId._id?.toString()
    const productIdStr = up.productId._id?.toString()

    console.log('\n   🧠 A calcular tags esperadas...')
    let expectedTags: string[] = []
    try {
      const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr)
      expectedTags = evaluation.tagsToApply || []
      console.log(`   Tags ESPERADAS: [${expectedTags.join(', ')}]`)
    } catch (err: any) {
      console.log(`   ❌ Erro DecisionEngine: ${err.message}`)
    }

    // Identificar o que DEVERIA acontecer
    const shouldRemove = userData.currentBoTags.filter((t: string) => !expectedTags.includes(t))
    const shouldAdd = expectedTags.filter(t => !userData.currentBoTags.includes(t))

    if (shouldRemove.length > 0) {
      console.log(`   🔴 DEVEM SER REMOVIDAS: [${shouldRemove.join(', ')}]`)
    }
    if (shouldAdd.length > 0) {
      console.log(`   🟢 DEVEM SER ADICIONADAS: [${shouldAdd.join(', ')}]`)
    }
    if (shouldRemove.length === 0 && shouldAdd.length === 0) {
      console.log(`   ✅ Tags já estão corretas!`)
    }

    // Executar orchestrator
    console.log('\n   🚀 A executar tagOrchestratorV2.orchestrateUserProduct()...')
    try {
      const result = await tagOrchestratorV2.orchestrateUserProduct(userIdStr, productIdStr)
      console.log(`   Resultado:`)
      console.log(`      - Success: ${result.success}`)
      console.log(`      - Tags Applied: ${result.tagsApplied?.length || 0} → [${(result.tagsApplied || []).join(', ')}]`)
      console.log(`      - Tags Removed: ${result.tagsRemoved?.length || 0} → [${(result.tagsRemoved || []).join(', ')}]`)
      if (result.error) {
        console.log(`      - Error: ${result.error}`)
      }
    } catch (err: any) {
      console.log(`   ❌ Erro orchestrator: ${err.message}`)
    }

    // Verificar tags DEPOIS
    console.log('\n   📡 A verificar tags DEPOIS...')
    try {
      const acTagsAfter = await activeCampaignService.getContactTagsByEmail(userData.email)
      const boTagsAfter = acTagsAfter.filter((t: string) => boTagNames.has(t))
      console.log(`   Tags BO DEPOIS: [${boTagsAfter.join(', ')}]`)

      // Comparar
      const actuallyRemoved = userData.currentBoTags.filter((t: string) => !boTagsAfter.includes(t))
      const actuallyAdded = boTagsAfter.filter((t: string) => !userData.currentBoTags.includes(t))

      if (actuallyRemoved.length > 0) {
        console.log(`   ✅ Removidas com sucesso: [${actuallyRemoved.join(', ')}]`)
      }
      if (actuallyAdded.length > 0) {
        console.log(`   ✅ Adicionadas com sucesso: [${actuallyAdded.join(', ')}]`)
      }

      // Verificar se ficou correto
      const stillWrong = boTagsAfter.filter((t: string) => !expectedTags.includes(t))
      const stillMissing = expectedTags.filter(t => !boTagsAfter.includes(t))

      if (stillWrong.length > 0) {
        console.log(`   ❌ AINDA TEM TAGS QUE NÃO DEVIA: [${stillWrong.join(', ')}]`)
      }
      if (stillMissing.length > 0) {
        console.log(`   ❌ AINDA FALTAM TAGS: [${stillMissing.join(', ')}]`)
      }
      if (stillWrong.length === 0 && stillMissing.length === 0) {
        console.log(`   🎉 PERFEITO! Tags agora estão corretas!`)
      }
    } catch (err: any) {
      console.log(`   ❌ Erro ao verificar: ${err.message}`)
    }

    console.log('')
  }

  console.log('━'.repeat(60))
  console.log('✅ Teste completo!')
  console.log('━'.repeat(60))

  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
