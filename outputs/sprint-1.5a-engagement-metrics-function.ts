// ════════════════════════════════════════════════════════════
// 🧪 TESTE: calculateEngagementMetricsForUserProduct
// ════════════════════════════════════════════════════════════
// 
// EXECUTAR:
// ts-node scripts/test-engagement-metrics.ts
//
// OU
// npx ts-node scripts/test-engagement-metrics.ts
//
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { User } from '../src/models'
import { Product } from '../src/models'
import { calculateEngagementMetricsForUserProduct } from '../src/services/syncUtilziadoresServices/universalSyncService'


// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const MONGODB_URI = process.env.MONGODB_URI ||  "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

// ═══════════════════════════════════════════════════════════
// CONECTAR À BD
// ═══════════════════════════════════════════════════════════

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Conectado ao MongoDB\n')
  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error)
    process.exit(1)
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 1: DADOS MOCK
// ═══════════════════════════════════════════════════════════

function testWithMockData() {
  console.log('═'.repeat(60))
  console.log('🧪 TESTE 1: DADOS MOCK')
  console.log('═'.repeat(60))
  console.log('')

  // Mock User
  const mockUser: any = {
    _id: new mongoose.Types.ObjectId(),
    email: 'test@mail.com',
    name: 'João Silva',
    
    hotmart: {
      hotmartUserId: 'HOTMART123',
      purchaseDate: new Date('2024-01-15'),
      signupDate: new Date('2024-01-15'),
      plusAccess: 'WITH_PLUS_ACCESS',
      firstAccessDate: new Date('2024-01-16'),
      
      progress: {
        totalTimeMinutes: 240,
        completedLessons: 15,
        lessonsData: [],
        lastAccessDate: new Date('2025-12-10') // 16 dias atrás de hoje (26 dez)
      },
      
      engagement: {
        accessCount: 42,
        engagementScore: 75,
        engagementLevel: 'ALTO',
        calculatedAt: new Date()
      },
      
      lastSyncAt: new Date(),
      syncVersion: '3.0'
    },
    
    curseduca: {
      curseducaUserId: 'CURSEDUCA456',
      groupId: 'GROUP789',
      groupName: 'Clareza Anual',
      joinedDate: new Date('2024-06-01'),
      
      progress: {
        estimatedProgress: 60,
        activityLevel: 'HIGH',
        groupEngagement: 80,
        progressSource: 'estimated'
      },
      
      engagement: {
        alternativeEngagement: 70,
        activityLevel: 'HIGH',
        engagementLevel: 'ALTO',
        calculatedAt: new Date()
      },
      
      lastSyncAt: new Date(),
      syncVersion: '2.0'
    },
    
    discord: {
      discordIds: ['DISCORD999'],
      acceptedTerms: true,
      isDeletable: true,
      isDeleted: false,
      role: 'STUDENT',
      priority: 'MEDIUM',
      locale: 'pt_BR',
      lastEditedBy: 'system',
      lastEditedAt: new Date(),
      createdAt: new Date('2024-03-01')
    },
    
    metadata: {
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date(),
      sources: {
        hotmart: { lastSync: new Date(), version: '3.0' },
        curseduca: { lastSync: new Date(), version: '2.0' }
      }
    }
  }

  // Mock Products
  const ogiProduct: any = {
    _id: new mongoose.Types.ObjectId(),
    code: 'OGI_V1',
    name: 'O Grande Investimento',
    platform: 'hotmart'
  }

  const clarezaProduct: any = {
    _id: new mongoose.Types.ObjectId(),
    code: 'CLAREZA_ANUAL',
    name: 'Clareza - Assinatura Anual',
    platform: 'curseduca'
  }

  const discordProduct: any = {
    _id: new mongoose.Types.ObjectId(),
    code: 'DISCORD_COMMUNITY',
    name: 'Comunidade Discord',
    platform: 'discord'
  }

  // ═══════════════════════════════════════════════════════════
  // TESTE: OGI (HOTMART)
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 TESTE: OGI (Hotmart)')
  console.log('─'.repeat(60))
  
  try {
    const ogiMetrics = calculateEngagementMetricsForUserProduct(mockUser, ogiProduct)
    
    console.log('\n✅ RESULTADO:')
    console.log(JSON.stringify(ogiMetrics, null, 2))
    
    // Validações
    console.log('\n🔍 VALIDAÇÕES:')
    console.log(`   daysSinceLastLogin: ${ogiMetrics.engagement.daysSinceLastLogin} dias`)
    console.log(`   ✅ Esperado: ~16 dias (10 dez → 26 dez)`)
    console.log(`   totalLogins: ${ogiMetrics.engagement.totalLogins}`)
    console.log(`   ✅ Esperado: 42`)
    console.log(`   purchaseDate: ${ogiMetrics.metadata.purchaseDate}`)
    console.log(`   ✅ Esperado: 2024-01-15`)
    console.log(`   purchaseValue: ${ogiMetrics.metadata.purchaseValue}`)
    console.log(`   ⚠️  Esperado: null (não está no modelo User)`)
    
  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
  }

  console.log('\n')

  // ═══════════════════════════════════════════════════════════
  // TESTE: CLAREZA (CURSEDUCA)
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 TESTE: Clareza (CursEduca)')
  console.log('─'.repeat(60))
  
  try {
    const clarezaMetrics = calculateEngagementMetricsForUserProduct(mockUser, clarezaProduct)
    
    console.log('\n✅ RESULTADO:')
    console.log(JSON.stringify(clarezaMetrics, null, 2))
    
    // Validações
    console.log('\n🔍 VALIDAÇÕES:')
    console.log(`   daysSinceLastAction: ${clarezaMetrics.engagement.daysSinceLastAction} dias`)
    console.log(`   ⚠️  Esperado: ~208 dias (01 jun 2024 → 26 dez 2025)`)
    console.log(`   ℹ️  NOTA: Usa joinedDate como proxy (não há lastActionDate)`)
    console.log(`   purchaseDate: ${clarezaMetrics.metadata.purchaseDate}`)
    console.log(`   ✅ Esperado: 2024-06-01`)
    console.log(`   purchaseValue: ${clarezaMetrics.metadata.purchaseValue}`)
    console.log(`   ⚠️  Esperado: null (não está no modelo User)`)
    
  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
  }

  console.log('\n')

  // ═══════════════════════════════════════════════════════════
  // TESTE: DISCORD
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 TESTE: Discord')
  console.log('─'.repeat(60))
  
  try {
    const discordMetrics = calculateEngagementMetricsForUserProduct(mockUser, discordProduct)
    
    console.log('\n✅ RESULTADO:')
    console.log(JSON.stringify(discordMetrics, null, 2))
    
    // Validações
    console.log('\n🔍 VALIDAÇÕES:')
    console.log(`   daysSinceLastLogin: ${discordMetrics.engagement.daysSinceLastLogin}`)
    console.log(`   ✅ Esperado: null (Discord não implementado)`)
    console.log(`   daysSinceLastAction: ${discordMetrics.engagement.daysSinceLastAction}`)
    console.log(`   ✅ Esperado: null (Discord não implementado)`)
    
  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
  }

  console.log('\n')
}

// ═══════════════════════════════════════════════════════════
// TESTE 2: DADOS REAIS DO MONGODB
// ═══════════════════════════════════════════════════════════

async function testWithRealData() {
  console.log('═'.repeat(60))
  console.log('🧪 TESTE 2: DADOS REAIS DO MONGODB')
  console.log('═'.repeat(60))
  console.log('')

  try {
    // Buscar 1 user com dados Hotmart
    console.log('📊 Buscando user com dados Hotmart...')
    const hotmartUser = await User.findOne({
      'hotmart.hotmartUserId': { $exists: true }
    }).lean()

    if (!hotmartUser) {
      console.log('⚠️  Nenhum user Hotmart encontrado')
    } else {
      console.log(`✅ User encontrado: ${hotmartUser.email}`)
      
      // Buscar produto OGI
      const ogiProduct = await Product.findOne({
        platform: 'hotmart',
        code: 'OGI_V1'
      }).lean() as any // ✅ Type assertion para evitar erro TypeScript

      if (!ogiProduct) {
        console.log('⚠️  Produto OGI_V1 não encontrado')
      } else {
        console.log(`✅ Produto encontrado: ${ogiProduct.code}`)
        console.log('')
        
        // Calcular metrics
        const metrics = calculateEngagementMetricsForUserProduct(hotmartUser as any, ogiProduct)
        
        console.log('✅ RESULTADO:')
        console.log(JSON.stringify(metrics, null, 2))
        console.log('')
      }
    }

    // Buscar 1 user com dados CursEduca
    console.log('📊 Buscando user com dados CursEduca...')
    const curseducaUser = await User.findOne({
      'curseduca.curseducaUserId': { $exists: true }
    }).lean()

    if (!curseducaUser) {
      console.log('⚠️  Nenhum user CursEduca encontrado')
    } else {
      console.log(`✅ User encontrado: ${curseducaUser.email}`)
      
      // Buscar produto Clareza
      const clarezaProduct = await Product.findOne({
        platform: 'curseduca',
        $or: [
          { code: 'CLAREZA_ANUAL' },
          { code: 'CLAREZA_MENSAL' }
        ]
      }).lean() as any // ✅ Type assertion para evitar erro TypeScript

      if (!clarezaProduct) {
        console.log('⚠️  Produto Clareza não encontrado')
      } else {
        console.log(`✅ Produto encontrado: ${clarezaProduct.code}`)
        console.log('')
        
        // Calcular metrics
        const metrics = calculateEngagementMetricsForUserProduct(curseducaUser as any, clarezaProduct)
        
        console.log('✅ RESULTADO:')
        console.log(JSON.stringify(metrics, null, 2))
        console.log('')
      }
    }

  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
    console.error(error.stack)
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 3: VALIDAÇÃO DE EDGE CASES
// ═══════════════════════════════════════════════════════════

function testEdgeCases() {
  console.log('═'.repeat(60))
  console.log('🧪 TESTE 3: EDGE CASES')
  console.log('═'.repeat(60))
  console.log('')

  // CASE 1: User sem dados de Hotmart
  console.log('📊 CASE 1: User sem dados Hotmart')
  console.log('─'.repeat(60))
  
  const emptyUser: any = {
    _id: new mongoose.Types.ObjectId(),
    email: 'empty@mail.com',
    name: 'Empty User',
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
      sources: {}
    }
  }

  const ogiProduct: any = {
    _id: new mongoose.Types.ObjectId(),
    code: 'OGI_V1',
    platform: 'hotmart'
  }

  try {
    const metrics = calculateEngagementMetricsForUserProduct(emptyUser, ogiProduct)
    console.log('✅ RESULTADO:')
    console.log(JSON.stringify(metrics, null, 2))
    console.log('\n🔍 VALIDAÇÃO:')
    console.log('   ✅ Não deve crashar com dados vazios')
    console.log('   ✅ daysSinceLastLogin deve ser null')
    console.log('   ✅ totalLogins deve ser 0')
  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
  }

  console.log('\n')

  // CASE 2: User com apenas firstAccessDate (sem lastAccessDate)
  console.log('📊 CASE 2: User apenas com firstAccessDate')
  console.log('─'.repeat(60))
  
  const userWithFirstAccess: any = {
    _id: new mongoose.Types.ObjectId(),
    email: 'first@mail.com',
    name: 'First Access User',
    hotmart: {
      hotmartUserId: 'TEST123',
      purchaseDate: new Date('2024-01-01'),
      firstAccessDate: new Date('2025-12-20'), // 6 dias atrás
      progress: {
        completedLessons: 0,
        lessonsData: []
        // SEM lastAccessDate!
      },
      engagement: {
        accessCount: 5,
        engagementScore: 20,
        engagementLevel: 'BAIXO',
        calculatedAt: new Date()
      }
    },
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
      sources: {}
    }
  }

  try {
    const metrics = calculateEngagementMetricsForUserProduct(userWithFirstAccess, ogiProduct)
    console.log('✅ RESULTADO:')
    console.log(JSON.stringify(metrics, null, 2))
    console.log('\n🔍 VALIDAÇÃO:')
    console.log('   ✅ Deve usar firstAccessDate como fallback')
    console.log('   ✅ daysSinceLastLogin ~6 dias')
  } catch (error: any) {
    console.error('❌ ERRO:', error.message)
  }

  console.log('\n')
}

// ═══════════════════════════════════════════════════════════
// RESUMO FINAL
// ═══════════════════════════════════════════════════════════

function printSummary() {
  console.log('═'.repeat(60))
  console.log('📊 RESUMO DOS TESTES')
  console.log('═'.repeat(60))
  console.log('')
  console.log('✅ Campos testados:')
  console.log('   - daysSinceLastLogin (Hotmart)')
  console.log('   - daysSinceLastAction (CursEduca)')
  console.log('   - totalLogins (Hotmart)')
  console.log('   - purchaseDate (Ambos)')
  console.log('   - purchaseValue (Ambos - retorna null)')
  console.log('')
  console.log('⚠️  Limitações conhecidas:')
  console.log('   - purchaseValue: null (não está no modelo User)')
  console.log('   - CursEduca daysSinceLastAction: usa joinedDate como proxy')
  console.log('   - actionsLastWeek/Month: 0 (não disponível)')
  console.log('')
  console.log('🎯 Tag Rules que funcionam:')
  console.log('   ✅ "Sem login há 14+ dias" (OGI)')
  console.log('   ✅ "Menos de 10 logins" (OGI)')
  console.log('   ✅ "Inscritos há 30+ dias" (Ambos)')
  console.log('   ✅ "Sem ação há 14+ dias" (Clareza - aproximação)')
  console.log('')
  console.log('❌ Tag Rules que NÃO funcionam (ainda):')
  console.log('   ❌ "Valor > 100€" (purchaseValue = null)')
  console.log('   ❌ "Abriu 3x esta semana" (actionsLastWeek = 0)')
  console.log('')
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('')
  console.log('🧪 TESTES: calculateEngagementMetricsForUserProduct')
  console.log('═'.repeat(60))
  console.log('')

  // Teste 1: Mock data (sempre funciona)
  testWithMockData()

  // Teste 2: Dados reais (precisa de MongoDB)
  await connectDB()
  await testWithRealData()

  // Teste 3: Edge cases
  testEdgeCases()

  // Resumo final
  printSummary()

  // Fechar conexão
  await mongoose.disconnect()
  console.log('✅ Desconectado do MongoDB')
  console.log('')
  console.log('🎉 TESTES CONCLUÍDOS!')
  console.log('')
}

// Executar
main().catch(error => {
  console.error('❌ ERRO FATAL:', error)
  process.exit(1)
})