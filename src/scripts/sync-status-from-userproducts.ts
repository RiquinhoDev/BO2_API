// Script para sincronizar status da tabela userProducts (fonte única) para User
import mongoose from 'mongoose'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import dotenv from 'dotenv'

dotenv.config()

async function syncStatusFromUserProducts() {
  try {
    console.log('🔍 Conectando à base de dados...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 SINCRONIZAÇÃO DE STATUS (userProducts → User)')
    console.log('═══════════════════════════════════════════════════════════\n')

    // 1. Buscar todos os usuários
    console.log('⏳ Buscando todos os usuários...')
    const allUsers = await User.find({}).select('_id email name status combined').lean().maxTimeMS(30000)
    console.log(`Total de usuários: ${allUsers.length}\n`)

    // 2. Para cada usuário, verificar o status no userProducts
    console.log('⏳ Analisando status em userProducts...\n')

    const inconsistencies: any[] = []
    const statusCounts = {
      consistent: 0,
      inconsistent: 0,
      noUserProducts: 0,
      multipleProducts: 0
    }

    for (const user of allUsers) {
      // Buscar todos os userProducts deste user
      const userProducts = await UserProduct.find({ userId: user._id })
        .select('productId status platform')
        .lean()

      if (userProducts.length === 0) {
        statusCounts.noUserProducts++
        continue
      }

      // Se tem múltiplos produtos, verificar se algum está ACTIVE
      const hasActiveProduct = userProducts.some((up: any) => up.status === 'ACTIVE')
      const correctStatus = hasActiveProduct ? 'ACTIVE' : 'INACTIVE'

      if (userProducts.length > 1) {
        statusCounts.multipleProducts++
      }

      const currentStatus = (user as any).status
      const currentCombinedStatus = (user as any).combined?.status

      // Verificar inconsistência
      const isInconsistent =
        currentStatus !== correctStatus ||
        currentCombinedStatus !== correctStatus

      if (isInconsistent) {
        statusCounts.inconsistent++
        inconsistencies.push({
          email: (user as any).email,
          name: (user as any).name,
          currentStatus,
          currentCombinedStatus,
          correctStatus,
          products: userProducts.map((up: any) => ({
            platform: up.platform,
            status: up.status
          }))
        })
      } else {
        statusCounts.consistent++
      }
    }

    // 3. Relatório
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 RELATÓRIO')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`✅ Consistentes: ${statusCounts.consistent}`)
    console.log(`❌ Inconsistentes: ${statusCounts.inconsistent}`)
    console.log(`⚠️  Sem userProducts: ${statusCounts.noUserProducts}`)
    console.log(`📦 Com múltiplos produtos: ${statusCounts.multipleProducts}`)
    console.log('')

    if (inconsistencies.length === 0) {
      console.log('✅ Nenhuma inconsistência encontrada!')
      await mongoose.disconnect()
      return
    }

    // 4. Mostrar primeiras 10 inconsistências
    console.log(`❌ ENCONTRADAS ${inconsistencies.length} INCONSISTÊNCIAS:\n`)
    inconsistencies.slice(0, 10).forEach((inc, idx) => {
      console.log(`${idx + 1}. ${inc.email}`)
      console.log(`   Nome: ${inc.name}`)
      console.log(`   User.status: ${inc.currentStatus}`)
      console.log(`   User.combined.status: ${inc.currentCombinedStatus}`)
      console.log(`   Status CORRETO (userProducts): ${inc.correctStatus}`)
      console.log(`   Produtos:`)
      inc.products.forEach((p: any) => {
        console.log(`      - ${p.platform}: ${p.status}`)
      })
      console.log('')
    })

    if (inconsistencies.length > 10) {
      console.log(`   ... e mais ${inconsistencies.length - 10}\n`)
    }

    // 5. Confirmar antes de aplicar correções
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔧 CORREÇÃO')
    console.log('═══════════════════════════════════════════════════════════\n')
    console.log('⚠️  ATENÇÃO: Vamos corrigir ${inconsistencies.length} usuários!')
    console.log('   A fonte de verdade é a tabela userProducts.')
    console.log('   Pressione Ctrl+C nos próximos 5 segundos para cancelar...\n')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 6. Aplicar correções
    console.log('⏳ Aplicando correções...\n')
    let corrected = 0

    for (const inc of inconsistencies) {
      await User.updateOne(
        { email: inc.email },
        {
          $set: {
            status: inc.correctStatus,
            'combined.status': inc.correctStatus
          }
        }
      )
      corrected++
      console.log(`✅ ${inc.email}: ${inc.correctStatus}`)
    }

    console.log(`\n✅ ${corrected} usuários corrigidos!`)

    await mongoose.disconnect()
    console.log('\n✅ Sincronização completa!')
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

syncStatusFromUserProducts()
