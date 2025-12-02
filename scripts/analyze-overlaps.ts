// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/analyze-overlaps.ts
// ANÁLISE DETALHADA DE SOBREPOSIÇÕES (V2 - Regras Corretas)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'

async function analyzeOverlaps() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔍 ANÁLISE DETALHADA DE SOBREPOSIÇÕES')
    console.log('═'.repeat(80))
    console.log('\n📋 REGRAS DE NEGÓCIO:')
    console.log('   • OGI, Clareza, Discord = Produtos independentes')
    console.log('   • Discord → Requer OGI (comunidade exclusiva)')
    console.log('   • User pode ter: 1, 2 ou 3 produtos')
    console.log('   • ÚNICA restrição: Discord sozinho = impossível')
    console.log('═'.repeat(80))
    
    // Buscar produtos
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' })
    const clarezaProduct = await Product.findOne({ code: 'CLAREZA' })
    const discordProduct = await Product.findOne({ code: 'DISCORD_COMMUNITY' })
    
    if (!ogiProduct || !clarezaProduct || !discordProduct) {
      console.error('❌ Faltam produtos!')
      return
    }
    
    console.log('\n📦 PRODUTOS:')
    console.log(`   OGI: ${ogiProduct._id}`)
    console.log(`   Clareza: ${clarezaProduct._id}`)
    console.log(`   Discord: ${discordProduct._id}`)
    
    // ═════════════════════════════════════════════════════════════
    // BUSCAR TODOS OS USERS COM SEUS PRODUTOS
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ ANALISANDO COMBINAÇÕES ━━━')
    console.log('(Isto pode demorar ~30 segundos...)\n')
    
    // Buscar TODOS os users com seus produtos de uma vez (mais eficiente)
    const usersWithProducts = await User.aggregate([
      {
        $lookup: {
          from: 'userproducts',
          localField: '_id',
          foreignField: 'userId',
          as: 'userProducts'
        }
      },
      {
        $project: {
          _id: 1,
          email: 1,
          hasOGI: {
            $in: [ogiProduct._id, '$userProducts.productId']
          },
          hasClareza: {
            $in: [clarezaProduct._id, '$userProducts.productId']
          },
          hasDiscord: {
            $in: [discordProduct._id, '$userProducts.productId']
          },
          productCount: { $size: '$userProducts' }
        }
      }
    ])
    
    // Contar combinações
    let onlyOGI = 0
    let onlyClareza = 0
    let onlyDiscord = 0 // ❌ Não deveria existir
    let ogiClareza = 0
    let ogiDiscord = 0
    let clarezaDiscord = 0 // ⚠️ Raro mas possível (se tiver OGI também)
    let allThree = 0
    let noProducts = 0
    
    // Exemplos para debug
    const examples: Record<string, string[]> = {
      onlyDiscord: [],
      clarezaDiscord: [],
      allThree: []
    }
    
    for (const user of usersWithProducts) {
      const { hasOGI, hasClareza, hasDiscord, productCount, email } = user
      
      if (productCount === 0) {
        noProducts++
      } else if (hasOGI && hasClareza && hasDiscord) {
        allThree++
        if (examples.allThree.length < 5) {
          examples.allThree.push(email || 'sem email')
        }
      } else if (hasOGI && hasClareza) {
        ogiClareza++
      } else if (hasOGI && hasDiscord) {
        ogiDiscord++
      } else if (hasClareza && hasDiscord) {
        clarezaDiscord++
        if (examples.clarezaDiscord.length < 5) {
          examples.clarezaDiscord.push(email || 'sem email')
        }
      } else if (hasOGI) {
        onlyOGI++
      } else if (hasClareza) {
        onlyClareza++
      } else if (hasDiscord) {
        onlyDiscord++
        if (examples.onlyDiscord.length < 5) {
          examples.onlyDiscord.push(email || 'sem email')
        }
      }
    }
    
    // ═════════════════════════════════════════════════════════════
    // APRESENTAR RESULTADOS
    // ═════════════════════════════════════════════════════════════
    
    const totalUsers = usersWithProducts.length
    const usersWithAnyProduct = totalUsers - noProducts
    
    console.log('📊 DISTRIBUIÇÃO DE PRODUTOS:\n')
    
    console.log('━━━ 1 PRODUTO APENAS ━━━')
    console.log(`   📘 Só OGI:           ${onlyOGI.toString().padStart(5)} users (${Math.round((onlyOGI/totalUsers)*100)}%)`)
    console.log(`   📗 Só Clareza:       ${onlyClareza.toString().padStart(5)} users (${Math.round((onlyClareza/totalUsers)*100)}%)`)
    
    if (onlyDiscord > 0) {
      console.log(`   ❌ Só Discord:       ${onlyDiscord.toString().padStart(5)} users (ERRO!)`)
      console.log(`      💡 Exemplos: ${examples.onlyDiscord.join(', ')}`)
    } else {
      console.log(`   ✅ Só Discord:       ${onlyDiscord.toString().padStart(5)} users (correto)`)
    }
    
    console.log('\n━━━ 2 PRODUTOS ━━━')
    console.log(`   📘📗 OGI + Clareza:  ${ogiClareza.toString().padStart(5)} users (${Math.round((ogiClareza/totalUsers)*100)}%)`)
    console.log(`   📘💬 OGI + Discord:  ${ogiDiscord.toString().padStart(5)} users (${Math.round((ogiDiscord/totalUsers)*100)}%)`)
    
    if (clarezaDiscord > 0) {
      console.log(`   ⚠️  📗💬 Clareza + Discord: ${clarezaDiscord.toString().padStart(5)} users`)
      console.log(`      💡 Atenção: Devem ter OGI também (verificar)`)
      console.log(`      💡 Exemplos: ${examples.clarezaDiscord.join(', ')}`)
    } else {
      console.log(`   📗💬 Clareza + Discord: ${clarezaDiscord.toString().padStart(5)} users`)
    }
    
    console.log('\n━━━ 3 PRODUTOS ━━━')
    console.log(`   📘📗💬 Todos:        ${allThree.toString().padStart(5)} users (${Math.round((allThree/totalUsers)*100)}%)`)
    if (allThree > 0 && examples.allThree.length > 0) {
      console.log(`      💡 Exemplos: ${examples.allThree.join(', ')}`)
    }
    
    console.log('\n━━━ SEM PRODUTOS ━━━')
    console.log(`   ⚪ Nenhum:          ${noProducts.toString().padStart(5)} users (${Math.round((noProducts/totalUsers)*100)}%)`)
    
    console.log('\n' + '─'.repeat(80))
    console.log(`   TOTAL:             ${totalUsers.toString().padStart(5)} users`)
    
    // ═════════════════════════════════════════════════════════════
    // VALIDAÇÃO: DISCORD → OGI
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ VALIDAÇÃO: REGRA DISCORD → OGI ━━━\n')
    
    const totalDiscordUsers = ogiDiscord + clarezaDiscord + allThree + onlyDiscord
    const discordWithOGI = ogiDiscord + allThree
    const discordPossiblyWithoutOGI = clarezaDiscord + onlyDiscord
    
    console.log(`📊 Total users com Discord: ${totalDiscordUsers}`)
    console.log(`   ✅ Com OGI (direto):     ${discordWithOGI} (${Math.round((discordWithOGI/totalDiscordUsers)*100)}%)`)
    
    if (discordPossiblyWithoutOGI > 0) {
      console.log(`   ⚠️  Possivelmente sem OGI: ${discordPossiblyWithoutOGI}`)
      console.log(`      • Só Discord:          ${onlyDiscord}`)
      console.log(`      • Clareza + Discord:   ${clarezaDiscord}`)
      console.log(`\n   🔍 AÇÃO NECESSÁRIA: Investigar estes ${discordPossiblyWithoutOGI} users`)
    } else {
      console.log(`   ✅ 100% dos users Discord têm OGI (correto!)`)
    }
    
    // ═════════════════════════════════════════════════════════════
    // ESTATÍSTICAS GERAIS
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ ESTATÍSTICAS GERAIS ━━━\n')
    
    const totalUserProducts = await UserProduct.countDocuments()
    const avgProductsPerUser = (totalUserProducts / totalUsers).toFixed(2)
    
    console.log(`📊 UserProducts: ${totalUserProducts}`)
    console.log(`📊 Users:        ${totalUsers}`)
    console.log(`📊 Média:        ${avgProductsPerUser} produtos/user`)
    
    // Distribuição por número de produtos
    const with1Product = onlyOGI + onlyClareza + onlyDiscord
    const with2Products = ogiClareza + ogiDiscord + clarezaDiscord
    const with3Products = allThree
    
    console.log(`\n📊 DISTRIBUIÇÃO POR QUANTIDADE:`)
    console.log(`   1 produto:  ${with1Product} users (${Math.round((with1Product/usersWithAnyProduct)*100)}%)`)
    console.log(`   2 produtos: ${with2Products} users (${Math.round((with2Products/usersWithAnyProduct)*100)}%)`)
    console.log(`   3 produtos: ${with3Products} users (${Math.round((with3Products/usersWithAnyProduct)*100)}%)`)
    console.log(`   0 produtos: ${noProducts} users`)
    
    // ═════════════════════════════════════════════════════════════
    // VERIFICAÇÃO MATEMÁTICA
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ VERIFICAÇÃO MATEMÁTICA ━━━\n')
    
    const summedUsers = onlyOGI + onlyClareza + onlyDiscord + 
                        ogiClareza + ogiDiscord + clarezaDiscord + 
                        allThree + noProducts
    
    console.log(`   Soma das combinações: ${summedUsers}`)
    console.log(`   Total real BD:        ${totalUsers}`)
    
    if (summedUsers === totalUsers) {
      console.log(`   ✅ MATEMÁTICA BATE PERFEITAMENTE!`)
    } else {
      const diff = totalUsers - summedUsers
      console.log(`   ❌ DIFERENÇA: ${diff} users (erro no código)`)
    }
    
    // ═════════════════════════════════════════════════════════════
    // ALERTAS FINAIS
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ ALERTAS E RECOMENDAÇÕES ━━━\n')
    
    const alerts: string[] = []
    
    if (onlyDiscord > 0) {
      alerts.push(`🚨 CRÍTICO: ${onlyDiscord} users com Discord MAS SEM OGI`)
      alerts.push(`   → Viola regra: "Discord só para alunos OGI"`)
      alerts.push(`   → Ação: Remover do Discord ou adicionar OGI`)
    }
    
    if (clarezaDiscord > 0) {
      alerts.push(`⚠️  INVESTIGAR: ${clarezaDiscord} users com Clareza + Discord (sem OGI direto)`)
      alerts.push(`   → Pode ser válido se tiverem OGI também`)
      alerts.push(`   → Ação: Verificar se têm OGI na plataforma mas não na BD`)
    }
    
    if (noProducts > 100) {
      alerts.push(`⚠️  ${noProducts} users sem produtos`)
      alerts.push(`   → Possíveis testes, duplicados ou dados incompletos`)
      alerts.push(`   → Ação: Investigar e limpar se necessário`)
    }
    
    // Recomendações positivas
    const recommendations: string[] = []
    
    if (allThree > 0) {
      recommendations.push(`✅ ${allThree} users com todos os produtos (clientes premium!)`)
    }
    
    const multiProductUsers = ogiClareza + ogiDiscord + clarezaDiscord + allThree
    const multiProductPercentage = Math.round((multiProductUsers/usersWithAnyProduct)*100)
    
    if (multiProductPercentage > 30) {
      recommendations.push(`✅ ${multiProductPercentage}% users têm 2+ produtos (excelente engagement!)`)
    }
    
    if (alerts.length === 0) {
      console.log('✅ Nenhum alerta crítico! Distribuição está de acordo com as regras.')
    } else {
      console.log('🚨 ALERTAS:')
      alerts.forEach(alert => console.log(`   ${alert}`))
    }
    
    if (recommendations.length > 0) {
      console.log('\n💡 DESTAQUES POSITIVOS:')
      recommendations.forEach(rec => console.log(`   ${rec}`))
    }
    
    console.log('\n═'.repeat(80))
    console.log('✅ ANÁLISE COMPLETA')
    console.log('═'.repeat(80))
    console.log('')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

analyzeOverlaps()
