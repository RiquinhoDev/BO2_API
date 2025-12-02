// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/diagnose-group7.ts
// DIAGNÓSTICO: Onde estão os 125 users do grupo 7?
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'

async function diagnose() {
  console.log('\n🔍 DIAGNÓSTICO: Grupo 7 (Clareza Anual)\n')
  console.log('═'.repeat(80))
  
  // ───────────────────────────────────────────────────────────
  // 1. ENCONTRAR PRODUTO CLAREZA_ANUAL
  // ───────────────────────────────────────────────────────────
  
  const clarezaAnual = await Product.findOne({
    code: 'CLAREZA_ANUAL',
    isActive: true
  })
  
  if (!clarezaAnual) {
    console.log('❌ CLAREZA_ANUAL não existe!')
    return
  }
  
  console.log('✅ Produto CLAREZA_ANUAL encontrado:')
  console.log(`   ID: ${clarezaAnual._id}`)
  console.log(`   GroupId: ${clarezaAnual.curseducaGroupId}`)
  
  // ───────────────────────────────────────────────────────────
  // 2. CONTAR USERS DO GRUPO 7 (TODAS AS VARIAÇÕES)
  // ───────────────────────────────────────────────────────────
  
  console.log('\n━━━ PROCURAR USERS DO GRUPO 7 ━━━\n')
  
  // Variação 1: curseduca.groupCurseducaId STRING
  const count1 = await User.countDocuments({
    'curseduca.groupCurseducaId': '7'
  })
  console.log(`Variação 1 (curseduca.groupCurseducaId: '7'): ${count1}`)
  
  // Variação 2: curseduca.groupCurseducaId NUMBER
  const count2 = await User.countDocuments({
    'curseduca.groupCurseducaId': 7
  })
  console.log(`Variação 2 (curseduca.groupCurseducaId: 7): ${count2}`)
  
  // Variação 3: groupCurseducaId STRING (flat)
  const count3 = await User.countDocuments({
    groupCurseducaId: '7'
  })
  console.log(`Variação 3 (groupCurseducaId: '7'): ${count3}`)
  
  // Variação 4: groupCurseducaId NUMBER (flat)
  const count4 = await User.countDocuments({
    groupCurseducaId: 7
  })
  console.log(`Variação 4 (groupCurseducaId: 7): ${count4}`)
  
  // ───────────────────────────────────────────────────────────
  // 3. PEGAR QUERY QUE FUNCIONA
  // ───────────────────────────────────────────────────────────
  
  const queries = [
    { 'curseduca.groupCurseducaId': '7' },
    { 'curseduca.groupCurseducaId': 7 },
    { groupCurseducaId: '7' },
    { groupCurseducaId: 7 }
  ]
  
  let usersGroup7: any[] = []
  let workingQuery: any = null
  
  for (const query of queries) {
    const users = await User.find(query).limit(5).lean()
    if (users.length > 0) {
      usersGroup7 = users
      workingQuery = query
      break
    }
  }
  
  if (usersGroup7.length === 0) {
    console.log('\n❌ NENHUM user encontrado com as queries acima!')
    console.log('💡 Vou procurar por outros critérios...\n')
    
    // Tentar por curseduca existence
    const anyCurseduca = await User.find({
      'curseduca.curseducaUserId': { $exists: true }
    }).limit(5).lean()
    
    console.log(`📊 Users com curseduca: ${anyCurseduca.length}`)
    if (anyCurseduca.length > 0) {
      console.log('\n📋 EXEMPLO DE USER COM CURSEDUCA:')
      console.log(JSON.stringify(anyCurseduca[0], null, 2))
    }
    
    return
  }
  
  console.log(`\n✅ Query que funciona: ${JSON.stringify(workingQuery)}`)
  console.log(`   Encontrados: ${usersGroup7.length} users (mostrando 5)\n`)
  
  // ───────────────────────────────────────────────────────────
  // 4. MOSTRAR EXEMPLOS DE USERS
  // ───────────────────────────────────────────────────────────
  
  console.log('━━━ EXEMPLOS DE USERS DO GRUPO 7 ━━━\n')
  
  for (let i = 0; i < Math.min(3, usersGroup7.length); i++) {
    const user = usersGroup7[i]
    
    console.log(`\n📋 User ${i + 1}:`)
    console.log(`   _id: ${user._id}`)
    console.log(`   email: ${user.email}`)
    console.log(`   name: ${user.name || 'N/A'}`)
    
    // Mostrar estrutura curseduca
    if (user.curseduca) {
      console.log(`   curseduca:`)
      console.log(`      curseducaUserId: ${user.curseduca.curseducaUserId}`)
      console.log(`      groupCurseducaId: ${user.curseduca.groupCurseducaId}`)
      console.log(`      createdAt: ${user.curseduca.createdAt}`)
    }
    
    if (user.groupCurseducaId) {
      console.log(`   groupCurseducaId (flat): ${user.groupCurseducaId}`)
    }
    
    // Verificar se já tem UserProduct
    const hasUserProduct = await UserProduct.findOne({
      userId: user._id,
      productId: clarezaAnual._id
    })
    
    console.log(`   Tem UserProduct?: ${hasUserProduct ? '✅ SIM' : '❌ NÃO'}`)
  }
  
  // ───────────────────────────────────────────────────────────
  // 5. VERIFICAR USERPRODUCTS EXISTENTES
  // ───────────────────────────────────────────────────────────
  
  console.log('\n━━━ USERPRODUCTS DO CLAREZA_ANUAL ━━━\n')
  
  const upCount = await UserProduct.countDocuments({
    productId: clarezaAnual._id
  })
  
  console.log(`Total UserProducts: ${upCount}`)
  
  if (upCount > 0) {
    const examples = await UserProduct.find({
      productId: clarezaAnual._id
    }).limit(3).lean()
    
    console.log('\nExemplos:')
    for (const up of examples) {
      console.log(`   - userId: ${up.userId}, enrolledAt: ${up.enrolledAt}`)
    }
  }
  
  // ───────────────────────────────────────────────────────────
  // 6. SUMÁRIO
  // ───────────────────────────────────────────────────────────
  
  console.log('\n═'.repeat(80))
  console.log('📊 SUMÁRIO DO DIAGNÓSTICO\n')
  
  const totalGroup7 = await User.countDocuments(workingQuery)
  const totalUserProducts = await UserProduct.countDocuments({
    productId: clarezaAnual._id
  })
  
  console.log(`✅ Users no grupo 7: ${totalGroup7}`)
  console.log(`✅ UserProducts do CLAREZA_ANUAL: ${totalUserProducts}`)
  console.log(`❌ Users FALTANDO migrar: ${totalGroup7 - totalUserProducts}`)
  
  console.log(`\n💡 Query correta: ${JSON.stringify(workingQuery)}`)
  
  console.log('\n')
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    await diagnose()
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

run()