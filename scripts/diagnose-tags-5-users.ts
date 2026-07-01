// ════════════════════════════════════════════════════════════
// 📁 scripts/diagnose-tags-5-users.ts
// DIAGNÓSTICO: Comparar tags AC vs BO para 5 users aleatórios
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGODB_URI

async function main() {
  console.log('━'.repeat(60))
  console.log('🔍 DIAGNÓSTICO: Tags AC vs BO (5 users aleatórios)')
  console.log('━'.repeat(60))

  // Connect to MongoDB
  await mongoose.connect(MONGO_URI)
  console.log('✅ MongoDB conectado')

  // Import models and services
  const { User, UserProduct, Product } = await import('../src/models')
  const activeCampaignService = (await import('../src/services/activeCampaign/activeCampaignService')).default
  const { decisionEngine } = await import('../src/services/activeCampaign/decisionEngine.service')
  const TagRule = (await import('../src/models/acTags/TagRule')).default

  // Get all BO tag names (to filter AC tags)
  const allTagRules = await TagRule.find({ isActive: true }).select('actions.addTag').lean()
  const boTagNames = new Set<string>()
  for (const rule of allTagRules) {
    const tagName = (rule as any).actions?.addTag
    if (tagName) boTagNames.add(tagName)
  }
  console.log(`\n📋 Tags BO conhecidas (${boTagNames.size}):`, Array.from(boTagNames).join(', '))

  // Get 5 random ACTIVE UserProducts
  const randomUserProducts = await UserProduct.aggregate([
    { $match: { status: 'ACTIVE' } },
    { $sample: { size: 5 } }
  ])

  console.log(`\n🎲 Selecionados ${randomUserProducts.length} UserProducts aleatórios\n`)

  for (let i = 0; i < randomUserProducts.length; i++) {
    const up = randomUserProducts[i]

    console.log('═'.repeat(60))
    console.log(`👤 USER ${i + 1}/5`)
    console.log('═'.repeat(60))

    // Get user details
    const user = await User.findById(up.userId).lean() as any
    const product = await Product.findById(up.productId).lean() as any

    if (!user) {
      console.log('   ❌ User não encontrado (órfão)')
      continue
    }

    console.log(`   Email: ${user.email}`)
    console.log(`   Nome: ${user.name || 'N/A'}`)
    console.log(`   Produto: ${product?.code || 'N/A'} (${product?.name || 'N/A'})`)

    // Get current tags from AC
    console.log('\n   📡 A buscar tags da AC...')
    let acTags: string[] = []
    try {
      acTags = await activeCampaignService.getContactTagsByEmail(user.email)
      console.log(`   Tags AC (todas): ${acTags.length}`)
    } catch (err: any) {
      console.log(`   ❌ Erro ao buscar tags AC: ${err.message}`)
    }

    // Filter only BO tags
    const acBoTags = acTags.filter(tag => boTagNames.has(tag))
    console.log(`   Tags AC (só BO): ${acBoTags.length} → [${acBoTags.join(', ')}]`)

    // Get expected tags from DecisionEngine
    console.log('\n   🧠 A calcular tags esperadas pelo BO...')
    let expectedTags: string[] = []
    try {
      const fullUserProduct = await UserProduct.findById(up._id)
        .populate('userId')
        .populate('productId')
        .lean() as any

      if (fullUserProduct && fullUserProduct.userId && fullUserProduct.productId) {
        const userIdStr = fullUserProduct.userId._id?.toString() || fullUserProduct.userId.toString()
        const productIdStr = fullUserProduct.productId._id?.toString() || fullUserProduct.productId.toString()
        const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr)
        expectedTags = evaluation.tagsToApply || []
      }
    } catch (err: any) {
      console.log(`   ❌ Erro no DecisionEngine: ${err.message}`)
    }
    console.log(`   Tags esperadas (BO): ${expectedTags.length} → [${expectedTags.join(', ')}]`)

    // Compare
    console.log('\n   📊 COMPARAÇÃO:')

    const tagsInACNotExpected = acBoTags.filter(t => !expectedTags.includes(t))
    const tagsExpectedNotInAC = expectedTags.filter(t => !acBoTags.includes(t))
    const tagsCorrect = acBoTags.filter(t => expectedTags.includes(t))

    if (tagsCorrect.length > 0) {
      console.log(`   ✅ Corretas (${tagsCorrect.length}): [${tagsCorrect.join(', ')}]`)
    }
    if (tagsInACNotExpected.length > 0) {
      console.log(`   ❌ Na AC mas NÃO deviam estar (${tagsInACNotExpected.length}): [${tagsInACNotExpected.join(', ')}]`)
    }
    if (tagsExpectedNotInAC.length > 0) {
      console.log(`   ⚠️  Esperadas mas NÃO estão na AC (${tagsExpectedNotInAC.length}): [${tagsExpectedNotInAC.join(', ')}]`)
    }

    if (tagsInACNotExpected.length === 0 && tagsExpectedNotInAC.length === 0) {
      console.log(`   🎉 PERFEITO - Tags AC = Tags esperadas!`)
    }

    console.log('')
  }

  // Also check Rui specifically
  console.log('═'.repeat(60))
  console.log('👤 BÓNUS: Verificação do RUI')
  console.log('═'.repeat(60))

  const rui = await User.findOne({ email: 'ruifilipespteixeira@gmail.com' }).lean() as any
  if (rui) {
    console.log(`   Email: ${rui.email}`)

    const ruiUserProducts = await UserProduct.find({ userId: rui._id, status: 'ACTIVE' })
      .populate('productId')
      .lean() as any[]

    console.log(`   UserProducts ativos: ${ruiUserProducts.length}`)

    for (const rup of ruiUserProducts) {
      const productCode = rup.productId?.code || 'N/A'
      console.log(`\n   📦 Produto: ${productCode}`)

      // Get AC tags
      let acTags: string[] = []
      try {
        acTags = await activeCampaignService.getContactTagsByEmail(rui.email)
      } catch (err) {}
      const acBoTags = acTags.filter(tag => boTagNames.has(tag))
      console.log(`      Tags AC (só BO): [${acBoTags.join(', ')}]`)

      // Get expected
      try {
        const fullUp = await UserProduct.findById(rup._id)
          .populate('userId')
          .populate('productId')
          .lean() as any

        const userIdStr = fullUp.userId._id?.toString() || fullUp.userId.toString()
        const productIdStr = fullUp.productId._id?.toString() || fullUp.productId.toString()
        const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr)
        console.log(`      Tags esperadas: [${(evaluation.tagsToApply || []).join(', ')}]`)

        const tagsToRemove = acBoTags.filter(t => !(evaluation.tagsToApply || []).includes(t))
        if (tagsToRemove.length > 0) {
          console.log(`      ❌ DEVIAM SER REMOVIDAS: [${tagsToRemove.join(', ')}]`)
        }
      } catch (err: any) {
        console.log(`      ❌ Erro: ${err.message}`)
      }
    }
  }

  console.log('\n' + '━'.repeat(60))
  console.log('✅ Diagnóstico completo!')
  console.log('━'.repeat(60))

  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
