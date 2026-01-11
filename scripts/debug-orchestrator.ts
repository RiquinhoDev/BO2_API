// Debug detalhado do orchestrator para um utilizador específico
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

async function main() {
  console.log('━'.repeat(60))
  console.log('DEBUG: Passo a passo do Orchestrator')
  console.log('━'.repeat(60))

  await mongoose.connect(MONGO_URI)
  console.log('MongoDB conectado\n')

  const { User, UserProduct, Product } = await import('../src/models')
  const activeCampaignService = (await import('../src/services/activeCampaign/activeCampaignService')).default
  const { decisionEngine } = await import('../src/services/activeCampaign/decisionEngine.service')

  // Utilizador com problema: adrianarodriguesnat.91@gmail.com
  // AC: [OGI_V1 - Inativo 21d, OGI_V1 - Progresso Baixo]
  // Esperado: [OGI_V1 - Ativo, OGI_V1 - Reativado]
  // Extra: [OGI_V1 - Inativo 21d, OGI_V1 - Progresso Baixo]
  // Falta: [OGI_V1 - Ativo, OGI_V1 - Reativado]
  const testEmail = 'adrianarodriguesnat.91@gmail.com'

  console.log(`Utilizador: ${testEmail}\n`)

  // 1. Buscar user e produto
  const user = await User.findOne({ email: testEmail }).lean() as any
  if (!user) {
    console.log('User não encontrado!')
    process.exit(1)
  }
  console.log(`1️⃣ User ID: ${user._id}`)

  const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).lean() as any
  if (!ogiProduct) {
    console.log('Produto OGI_V1 não encontrado!')
    process.exit(1)
  }
  console.log(`1️⃣ Product ID: ${ogiProduct._id}`)

  const userProduct = await UserProduct.findOne({ userId: user._id, productId: ogiProduct._id }).lean() as any
  if (!userProduct) {
    console.log('UserProduct não encontrado!')
    process.exit(1)
  }
  console.log(`1️⃣ UserProduct ID: ${userProduct._id}\n`)

  // 2. Buscar tags da AC
  console.log('2️⃣ Buscando tags da AC...')
  const acTags = await activeCampaignService.getContactTagsByEmail(testEmail)
  console.log(`   Todas as tags AC (${acTags.length}): ${acTags.join(', ')}`)

  // 3. Filtrar tags deste produto
  console.log('\n3️⃣ Filtrando tags do produto OGI_V1...')
  const productTagPrefixes = ['OGI_V1', 'OGI -']
  console.log(`   Prefixos: ${productTagPrefixes.join(', ')}`)

  const currentProductTagsInAC = acTags.filter((tag: string) =>
    productTagPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix.toUpperCase()))
  )
  console.log(`   Tags OGI_V1 na AC: [${currentProductTagsInAC.join(', ')}]`)

  // 4. Chamar Decision Engine
  console.log('\n4️⃣ Chamando Decision Engine...')
  const decisions = await decisionEngine.evaluateUserProduct(user._id.toString(), ogiProduct._id.toString())
  console.log(`   tagsToApply: [${(decisions.tagsToApply || []).join(', ')}]`)
  console.log(`   tagsToRemove: [${(decisions.tagsToRemove || []).join(', ')}]`)
  console.log(`   matchedRules: ${decisions.matchedRules?.length || 0}`)

  // 5. Normalizar tags novas
  console.log('\n5️⃣ Normalizando tags novas...')
  const newBOTags = (decisions.tagsToApply || []).map((tag: string) => tag) // Já vem normalizado
  console.log(`   newBOTags: [${newBOTags.join(', ')}]`)

  // 6. Calcular DIFF
  console.log('\n6️⃣ Calculando DIFF...')

  // Função isBOTag do orchestrator
  function isBOTag(tagName: string): boolean {
    return /^[A-Z_0-9]+ - .+$/.test(tagName)
  }

  const tagsToRemove = currentProductTagsInAC
    .filter((tag: string) => isBOTag(tag))
    .filter((tag: string) => !newBOTags.includes(tag))

  const tagsToAdd = newBOTags.filter((tag: string) => !currentProductTagsInAC.includes(tag))

  console.log(`   currentProductTagsInAC: [${currentProductTagsInAC.join(', ')}]`)
  console.log(`   newBOTags: [${newBOTags.join(', ')}]`)
  console.log('')
  console.log(`   📊 Tags a REMOVER: [${tagsToRemove.join(', ')}]`)
  console.log(`   📊 Tags a ADICIONAR: [${tagsToAdd.join(', ')}]`)

  // 7. Debug do filtro isBOTag
  console.log('\n7️⃣ Debug isBOTag para cada tag:')
  for (const tag of currentProductTagsInAC) {
    const isBO = isBOTag(tag)
    const inNewTags = newBOTags.includes(tag)
    const willRemove = isBO && !inNewTags
    console.log(`   "${tag}": isBOTag=${isBO}, inNewTags=${inNewTags}, willRemove=${willRemove}`)
  }

  // 8. Testar remoção real
  if (tagsToRemove.length > 0) {
    console.log('\n8️⃣ Testando remoção de tags...')
    for (const tag of tagsToRemove) {
      console.log(`   A remover: "${tag}"`)
      try {
        const result = await activeCampaignService.removeTagFromUserProduct(
          user._id.toString(),
          ogiProduct._id.toString(),
          tag
        )
        console.log(`   ✅ Resultado: ${result}`)
      } catch (err: any) {
        console.log(`   ❌ Erro: ${err.message}`)
      }
    }

    // Verificar se removeu
    console.log('\n9️⃣ Verificando tags após remoção...')
    const tagsAfter = await activeCampaignService.getContactTagsByEmail(testEmail)
    const ogiTagsAfter = tagsAfter.filter((tag: string) =>
      productTagPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix.toUpperCase()))
    )
    console.log(`   Tags OGI_V1 DEPOIS: [${ogiTagsAfter.join(', ')}]`)
  } else {
    console.log('\n8️⃣ Nenhuma tag a remover!')
  }

  console.log('\n' + '━'.repeat(60))
  console.log('Debug completo!')
  console.log('━'.repeat(60))

  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error('Erro:', err)
  process.exit(1)
})
