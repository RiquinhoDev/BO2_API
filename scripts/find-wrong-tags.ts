// Script para encontrar utilizadores com tags OGI_V1 ERRADAS
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

async function main() {
  console.log('━'.repeat(60))
  console.log('Buscar utilizadores com tags OGI_V1 INCORRETAS')
  console.log('━'.repeat(60))

  await mongoose.connect(MONGO_URI)
  console.log('MongoDB conectado\n')

  const { User, UserProduct, Product } = await import('../src/models')
  const activeCampaignService = (await import('../src/services/activeCampaign/activeCampaignService')).default
  const { decisionEngine } = await import('../src/services/activeCampaign/decisionEngine.service')
  const TagRule = (await import('../src/models/acTags/TagRule')).default

  // Get BO tag names
  const allTagRules = await TagRule.find({ isActive: true }).select('actions.addTag').lean()
  const boTagNames = new Set<string>()
  for (const rule of allTagRules) {
    const tagName = (rule as any).actions?.addTag
    if (tagName) boTagNames.add(tagName)
  }
  console.log(`Tags BO: ${Array.from(boTagNames).join(', ')}\n`)

  // Buscar produto OGI_V1
  const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).lean() as any
  if (!ogiProduct) {
    console.log('Produto OGI_V1 não encontrado!')
    process.exit(1)
  }

  // Buscar UserProducts OGI_V1 ativos (limite 30 para não demorar muito)
  const ogiUserProducts = await UserProduct.find({
    productId: ogiProduct._id,
    status: 'ACTIVE'
  })
    .populate('userId', 'email name')
    .limit(30)
    .lean() as any[]

  console.log(`A verificar ${ogiUserProducts.length} UserProducts OGI_V1...\n`)

  let wrongTagsCount = 0
  let correctTagsCount = 0
  const wrongUsers: any[] = []

  for (const up of ogiUserProducts) {
    if (!up.userId?.email) continue

    const email = up.userId.email
    const userIdStr = up.userId._id.toString()
    const productIdStr = ogiProduct._id.toString()

    try {
      // Tags na AC
      const acTags = await activeCampaignService.getContactTagsByEmail(email)
      const acBoTags = acTags.filter(t => boTagNames.has(t))

      // Tags esperadas
      const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr)
      const expectedTags = evaluation.tagsToApply || []

      // Comparar
      const wrongTags = acBoTags.filter(t => !expectedTags.includes(t))
      const missingTags = expectedTags.filter(t => !acBoTags.includes(t))

      if (wrongTags.length > 0 || missingTags.length > 0) {
        wrongTagsCount++
        wrongUsers.push({
          email,
          acBoTags,
          expectedTags,
          wrongTags,
          missingTags
        })

        console.log(`❌ ${email}`)
        console.log(`   AC: [${acBoTags.join(', ')}]`)
        console.log(`   Esperado: [${expectedTags.join(', ')}]`)
        if (wrongTags.length > 0) console.log(`   Extra: [${wrongTags.join(', ')}]`)
        if (missingTags.length > 0) console.log(`   Falta: [${missingTags.join(', ')}]`)
        console.log('')
      } else {
        correctTagsCount++
        console.log(`✅ ${email} - OK`)
      }
    } catch (err: any) {
      console.log(`⚠️ ${email} - Erro: ${err.message}`)
    }
  }

  console.log('\n' + '━'.repeat(60))
  console.log('RESUMO:')
  console.log(`   Corretas: ${correctTagsCount}`)
  console.log(`   Erradas: ${wrongTagsCount}`)
  console.log('━'.repeat(60))

  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error('Erro:', err)
  process.exit(1)
})
