// ════════════════════════════════════════════════════════════
// 📁 scripts/test-filtro-ogi.ts
// Teste do filtro de alunos inativos OGI_V1
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { Product, UserProduct } from '../src/models'

async function testFiltroOGI() {
  console.log('🧪 TESTE: Filtro de alunos inativos OGI_V1\n')

  try {
    // Conectar à BD
    console.log('📡 Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('✅ Conectado à BD\n')

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTO OGI_V1
    // ═══════════════════════════════════════════════════════════

    console.log('📦 Buscando produto OGI_V1...')
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id code').lean() as { _id: any; code: string } | null

    if (!ogiProduct) {
      console.log('⚠️  Produto OGI_V1 não encontrado na BD')
      return
    }

    console.log(`✅ Produto encontrado: ${ogiProduct.code} (ID: ${ogiProduct._id})\n`)

    const ogiProductId = ogiProduct._id.toString()

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR TODOS OS USERPRODUCTS OGI_V1 ACTIVE
    // ═══════════════════════════════════════════════════════════

    console.log('📊 Buscando UserProducts OGI_V1...')
    const allOgiUserProducts = await UserProduct.find({
      productId: ogiProduct._id,
      status: 'ACTIVE'
    })
      .select('userId productId metadata engagement')
      .populate({ path: 'userId', select: 'hotmart.lastAccessDate metadata.purchaseDate email' })
      .lean<any[]>()

    console.log(`   Total OGI_V1 ACTIVE: ${allOgiUserProducts.length}`)

    // ═══════════════════════════════════════════════════════════
    // 3. APLICAR FILTROS
    // ═══════════════════════════════════════════════════════════

    console.log('\n🔍 Aplicando filtros...')

    const cutoffDate = new Date('2024-12-31T23:59:59Z')
    const inactiveDaysThreshold = 380
    const cutoffActivityDate = new Date()
    cutoffActivityDate.setDate(cutoffActivityDate.getDate() - inactiveDaysThreshold)

    console.log(`   Filtro 1: Compra antes de ${cutoffDate.toLocaleDateString('pt-PT')}`)
    console.log(`   Filtro 2: Último acesso antes de ${cutoffActivityDate.toLocaleDateString('pt-PT')} (>380 dias)\n`)

    let filteredByPurchase = 0
    let filteredByActivity = 0
    let included = 0

    const filteredUserProducts = allOgiUserProducts.filter((up) => {
      const user = up.userId
      const lastAccessDate = user?.hotmart?.lastAccessDate
      const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate

      // Filtro 1: Compra antes de 31/12/2024
      if (purchaseDate && new Date(purchaseDate) < cutoffDate) {
        filteredByPurchase++
        return false
      }

      // Filtro 2: Último acesso > 380 dias
      if (lastAccessDate && new Date(lastAccessDate) < cutoffActivityDate) {
        filteredByActivity++
        return false
      }

      included++
      return true
    })

    // ═══════════════════════════════════════════════════════════
    // 4. RESULTADOS
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(60))
    console.log('📊 RESULTADOS DO FILTRO')
    console.log('═'.repeat(60))
    console.log(`📦 Total OGI_V1 ACTIVE:              ${allOgiUserProducts.length}`)
    console.log(`❌ Filtrados (compra <31/12/2024):    ${filteredByPurchase}`)
    console.log(`❌ Filtrados (inativo >380 dias):     ${filteredByActivity}`)
    console.log(`✅ Incluídos (a processar):           ${included}`)
    console.log(`📉 Redução:                           ${Math.floor((1 - included / allOgiUserProducts.length) * 100)}%`)
    console.log('═'.repeat(60))

    // ═══════════════════════════════════════════════════════════
    // 5. EXEMPLOS
    // ═══════════════════════════════════════════════════════════

    console.log('\n📝 EXEMPLOS DE ALUNOS FILTRADOS (primeiros 5):')
    const filtered = allOgiUserProducts
      .filter(up => !filteredUserProducts.includes(up))
      .slice(0, 5)

    filtered.forEach((up, idx) => {
      const user = up.userId
      const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate
      const lastAccessDate = user?.hotmart?.lastAccessDate

      console.log(`\n[${idx + 1}] ${user?.email || 'N/A'}`)
      console.log(`   Compra: ${purchaseDate ? new Date(purchaseDate).toLocaleDateString('pt-PT') : 'N/A'}`)
      console.log(`   Último acesso: ${lastAccessDate ? new Date(lastAccessDate).toLocaleDateString('pt-PT') : 'N/A'}`)
    })

    console.log('\n📝 EXEMPLOS DE ALUNOS INCLUÍDOS (primeiros 5):')
    const includedExamples = filteredUserProducts.slice(0, 5)

    includedExamples.forEach((up, idx) => {
      const user = up.userId
      const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate
      const lastAccessDate = user?.hotmart?.lastAccessDate

      console.log(`\n[${idx + 1}] ${user?.email || 'N/A'}`)
      console.log(`   Compra: ${purchaseDate ? new Date(purchaseDate).toLocaleDateString('pt-PT') : 'N/A'}`)
      console.log(`   Último acesso: ${lastAccessDate ? new Date(lastAccessDate).toLocaleDateString('pt-PT') : 'N/A'}`)
    })

    console.log('\n✅ TESTE COMPLETO')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Desconectado da BD')
  }
}

// Executar teste
testFiltroOGI()
