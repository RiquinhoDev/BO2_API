// ════════════════════════════════════════════════════════════
// 📁 outputs/diagnostic-userproduct-structure.ts
// Script: Diagnosticar estrutura real dos UserProducts
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { UserProduct } from '../src/models'

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

async function diagnose() {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  🔬 DIAGNÓSTICO - ESTRUTURA USERPRODUCT           ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  try {
    await mongoose.connect(MONGO_URI)
    console.log('✅ Conectado ao MongoDB\n')

    // ═══════════════════════════════════════════════════════════
    // 1. AMOSTRA DE DOCUMENTOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📋 AMOSTRA DE 3 USERPRODUCTS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const samples = await UserProduct.find()
      .limit(3)
      .populate('userId', 'name email')
      .populate('productId', 'name code')
      .lean()

    samples.forEach((doc: any, index: number) => {
      console.log(`\n${index + 1}. DOCUMENTO:`)
      console.log('─────────────────────────────────────────────')
      console.log('UserID:', doc.userId?.email)
      console.log('Product:', doc.productId?.code)
      console.log('Status:', doc.status)
      console.log('\n📊 PROGRESS:')
      console.log(JSON.stringify(doc.progress, null, 2))
      console.log('\n🔥 ENGAGEMENT:')
      console.log(JSON.stringify(doc.engagement, null, 2))
      console.log('\n💰 METADATA:')
      console.log(JSON.stringify(doc.metadata, null, 2))
      console.log('\n📧 COMMUNICATIONS:')
      console.log(JSON.stringify(doc.communications, null, 2))
    })

    // ═══════════════════════════════════════════════════════════
    // 2. VERIFICAR EXISTÊNCIA DE CAMPOS
    // ═══════════════════════════════════════════════════════════

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 VERIFICAÇÃO DE CAMPOS CRÍTICOS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const totalDocs = await UserProduct.countDocuments()
    console.log(`📊 Total UserProducts: ${totalDocs}\n`)

    // Campos de ENGAGEMENT
    const withDaysSinceLastLogin = await UserProduct.countDocuments({
      'engagement.daysSinceLastLogin': { $exists: true, $ne: null }
    })

    const withDaysSinceLastAction = await UserProduct.countDocuments({
      'engagement.daysSinceLastAction': { $exists: true, $ne: null }
    })

    const withEngagementScore = await UserProduct.countDocuments({
      'engagement.engagementScore': { $exists: true, $ne: null }
    })

    const withTotalLogins = await UserProduct.countDocuments({
      'engagement.totalLogins': { $exists: true, $ne: null }
    })

    // Campos de PROGRESS
    const withProgressPercentage = await UserProduct.countDocuments({
      'progress.percentage': { $exists: true, $ne: null }
    })

    const withProgressGreaterThanZero = await UserProduct.countDocuments({
      'progress.percentage': { $gt: 0 }
    })

    // Campos de METADATA
    const withPurchaseValue = await UserProduct.countDocuments({
      'metadata.purchaseValue': { $exists: true, $ne: null }
    })

    const withPurchaseDate = await UserProduct.countDocuments({
      'metadata.purchaseDate': { $exists: true, $ne: null }
    })

    // Resultados
    console.log('🔥 ENGAGEMENT:')
    console.log(`   daysSinceLastLogin:   ${withDaysSinceLastLogin} / ${totalDocs} (${((withDaysSinceLastLogin / totalDocs) * 100).toFixed(1)}%)`)
    console.log(`   daysSinceLastAction:  ${withDaysSinceLastAction} / ${totalDocs} (${((withDaysSinceLastAction / totalDocs) * 100).toFixed(1)}%)`)
    console.log(`   engagementScore:      ${withEngagementScore} / ${totalDocs} (${((withEngagementScore / totalDocs) * 100).toFixed(1)}%)`)
    console.log(`   totalLogins:          ${withTotalLogins} / ${totalDocs} (${((withTotalLogins / totalDocs) * 100).toFixed(1)}%)`)

    console.log('\n📊 PROGRESS:')
    console.log(`   percentage (existe):  ${withProgressPercentage} / ${totalDocs} (${((withProgressPercentage / totalDocs) * 100).toFixed(1)}%)`)
    console.log(`   percentage > 0:       ${withProgressGreaterThanZero} / ${totalDocs} (${((withProgressGreaterThanZero / totalDocs) * 100).toFixed(1)}%)`)

    console.log('\n💰 METADATA:')
    console.log(`   purchaseValue:        ${withPurchaseValue} / ${totalDocs} (${((withPurchaseValue / totalDocs) * 100).toFixed(1)}%)`)
    console.log(`   purchaseDate:         ${withPurchaseDate} / ${totalDocs} (${((withPurchaseDate / totalDocs) * 100).toFixed(1)}%)`)

    // ═══════════════════════════════════════════════════════════
    // 3. DISTRIBUIÇÃO DE VALORES
    // ═══════════════════════════════════════════════════════════

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📈 DISTRIBUIÇÃO DE VALORES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Progresso
    const progressDistribution = await UserProduct.aggregate([
      {
        $match: {
          'progress.percentage': { $exists: true, $ne: null }
        }
      },
      {
        $bucket: {
          groupBy: '$progress.percentage',
          boundaries: [0, 1, 25, 50, 75, 100],
          default: 'null',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ])

    console.log('📊 PROGRESSO (%):\n')
    progressDistribution.forEach((bucket: any) => {
      console.log(`   ${bucket._id}% → ${bucket.count} alunos`)
    })

    // Days Since Last Login
    if (withDaysSinceLastLogin > 0) {
      const loginDistribution = await UserProduct.aggregate([
        {
          $match: {
            'engagement.daysSinceLastLogin': { $exists: true, $ne: null }
          }
        },
        {
          $bucket: {
            groupBy: '$engagement.daysSinceLastLogin',
            boundaries: [0, 7, 14, 30, 60, 90, 999999],
            default: 'null',
            output: {
              count: { $sum: 1 }
            }
          }
        }
      ])

      console.log('\n🔥 DIAS SEM LOGIN:\n')
      loginDistribution.forEach((bucket: any) => {
        console.log(`   ${bucket._id} dias → ${bucket.count} alunos`)
      })
    } else {
      console.log('\n🔥 DIAS SEM LOGIN: ⚠️ Campo não existe!')
    }

    // ═══════════════════════════════════════════════════════════
    // 4. TESTES ESPECÍFICOS
    // ═══════════════════════════════════════════════════════════

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🧪 TESTES ESPECÍFICOS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Teste 1: Alunos com engagement.daysSinceLastLogin > 14
    const test1 = await UserProduct.countDocuments({
      'engagement.daysSinceLastLogin': { $gt: 14 }
    })
    console.log(`✅ Alunos com daysSinceLastLogin > 14: ${test1}`)

    // Teste 2: Alunos com progress.percentage > 0
    const test2 = await UserProduct.countDocuments({
      'progress.percentage': { $gt: 0 }
    })
    console.log(`✅ Alunos com progresso > 0%: ${test2}`)

    // Teste 3: Alunos com metadata.purchaseValue > 100
    const test3 = await UserProduct.countDocuments({
      'metadata.purchaseValue': { $gt: 100 }
    })
    console.log(`✅ Alunos com purchaseValue > 100: ${test3}`)

    // Teste 4: Produtos OGI_V1
    const ogiProduct = await mongoose.connection.collection('products').findOne({ code: 'OGI_V1' })
    if (ogiProduct) {
      const ogiCount = await UserProduct.countDocuments({ productId: ogiProduct._id })
      console.log(`✅ Alunos no OGI_V1: ${ogiCount}`)

      const ogiInactive = await UserProduct.countDocuments({
        productId: ogiProduct._id,
        'engagement.daysSinceLastLogin': { $gt: 14 }
      })
      console.log(`✅ Alunos OGI_V1 sem login 14d: ${ogiInactive}`)
    }

    // ═══════════════════════════════════════════════════════════
    // 5. CONCLUSÕES
    // ═══════════════════════════════════════════════════════════

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💡 CONCLUSÕES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    if (withDaysSinceLastLogin === 0) {
      console.log('❌ PROBLEMA: Campo "engagement.daysSinceLastLogin" NÃO EXISTE!')
      console.log('   → Queries de "sem login Xd" vão sempre retornar 0')
      console.log('   → Precisa popular este campo no UserProduct')
    }

    if (withProgressGreaterThanZero === 0) {
      console.log('\n❌ PROBLEMA: TODOS os alunos têm progresso = 0%')
      console.log('   → Campo "progress.percentage" não está sendo calculado')
      console.log('   → Precisa implementar cálculo de progresso')
    }

    if (withPurchaseValue === 0) {
      console.log('\n❌ PROBLEMA: Campo "metadata.purchaseValue" NÃO EXISTE!')
      console.log('   → Queries de valor de compra vão sempre retornar 0')
      console.log('   → Precisa popular este campo no UserProduct')
    }

    console.log('\n')

  } catch (error) {
    console.error('❌ ERRO:', error)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado do MongoDB')
  }
}

diagnose()