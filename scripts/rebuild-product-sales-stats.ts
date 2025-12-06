// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/rebuild-product-sales-stats.ts
// SCRIPT: Rebuildar Product Sales Stats
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { buildProductSalesStats } from '../src/services/productSalesStatsBuilder'
import ProductSalesStats from '../src/models/ProductSalesStats'

async function rebuild() {
  try {
    console.log('\n🔧 REBUILD PRODUCT SALES STATS')
    console.log('═'.repeat(80))
    console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-PT')}`)
    console.log('═'.repeat(80))
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n✅ Conectado ao MongoDB')
    
    // ═══════════════════════════════════════════════════════════
    // ETAPA 1: MOSTRAR STATS ANTIGAS (ANTES)
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n━━━ ETAPA 1/3: STATS ANTIGAS (ANTES DO REBUILD) ━━━\n')
    
    const oldStats = await ProductSalesStats.find().lean()
    
    if (oldStats.length > 0) {
      console.log(`📊 Stats existentes: ${oldStats.length}`)
      
      for (const stat of oldStats) {
        console.log(`\n   ${stat.productCode} - ${stat.productName}`)
        console.log(`      Total vendas: ${stat.totals.allTime}`)
        console.log(`      Última atualização: ${new Date(stat.meta.calculatedAt).toLocaleString('pt-PT')}`)
      }
    } else {
      console.log('⚠️  Nenhuma stat existente (primeira execução)')
    }
    
    // ═══════════════════════════════════════════════════════════
    // ETAPA 2: EXECUTAR REBUILD
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n━━━ ETAPA 2/3: EXECUTAR REBUILD ━━━\n')
    
    await buildProductSalesStats()
    
    // ═══════════════════════════════════════════════════════════
    // ETAPA 3: MOSTRAR STATS NOVAS (DEPOIS)
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n━━━ ETAPA 3/3: STATS NOVAS (DEPOIS DO REBUILD) ━━━\n')
    
    const newStats = await ProductSalesStats.find().lean()
    
    console.log(`📊 Stats atualizadas: ${newStats.length}\n`)
    
    for (const stat of newStats) {
      console.log(`\n   ${stat.productCode} - ${stat.productName}`)
      console.log(`      Plataforma: ${stat.platform}`)
      console.log(`      Total vendas: ${stat.totals.allTime}`)
      console.log(`      Último mês: ${stat.totals.lastMonth}`)
      console.log(`      Mês atual: ${stat.totals.currentMonth}`)
      console.log(`      Última atualização: ${new Date(stat.meta.calculatedAt).toLocaleString('pt-PT')}`)
      
      if (stat.meta.oldestSale) {
        console.log(`      Venda mais antiga: ${new Date(stat.meta.oldestSale).toLocaleDateString('pt-PT')}`)
      }
      if (stat.meta.newestSale) {
        console.log(`      Venda mais recente: ${new Date(stat.meta.newestSale).toLocaleDateString('pt-PT')}`)
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // COMPARAÇÃO: ANTES vs DEPOIS
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n━━━ COMPARAÇÃO: ANTES vs DEPOIS ━━━\n')
    
    if (oldStats.length > 0) {
      for (const newStat of newStats) {
        const oldStat = oldStats.find(s => s.productCode === newStat.productCode)
        
        if (oldStat) {
          const diff = newStat.totals.allTime - oldStat.totals.allTime
          const diffStr = diff >= 0 ? `+${diff}` : `${diff}`
          
          console.log(`${newStat.productCode}:`)
          console.log(`   ANTES: ${oldStat.totals.allTime} vendas`)
          console.log(`   DEPOIS: ${newStat.totals.allTime} vendas`)
          console.log(`   DIFERENÇA: ${diffStr} ${diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️'}`)
          console.log('')
        } else {
          console.log(`${newStat.productCode}: NOVO PRODUTO`)
          console.log(`   Total: ${newStat.totals.allTime} vendas\n`)
        }
      }
    } else {
      console.log('ℹ️  Primeira execução - sem comparação')
    }
    
    // ═══════════════════════════════════════════════════════════
    // VALIDAÇÕES
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n━━━ VALIDAÇÕES ━━━\n')
    
    const clarezaMensal = newStats.find(s => s.productCode === 'CLAREZA_MENSAL')
    const clarezaAnual = newStats.find(s => s.productCode === 'CLAREZA_ANUAL')
    
    if (clarezaMensal && clarezaAnual) {
      const totalClareza = clarezaMensal.totals.allTime + clarezaAnual.totals.allTime
      console.log(`✅ CLAREZA_MENSAL: ${clarezaMensal.totals.allTime} vendas`)
      console.log(`✅ CLAREZA_ANUAL: ${clarezaAnual.totals.allTime} vendas`)
      console.log(`✅ TOTAL CLAREZA: ${totalClareza} vendas`)
      
      if (totalClareza === 245) {
        console.log(`\n🎉 PERFEITO! Total Clareza = 245 (esperado)`)
      } else {
        console.log(`\n⚠️  Total Clareza = ${totalClareza} (esperado: 245)`)
      }
    } else {
      if (!clarezaMensal) console.log('⚠️  CLAREZA_MENSAL não encontrado')
      if (!clarezaAnual) console.log('⚠️  CLAREZA_ANUAL não encontrado')
    }
    
    const ogi = newStats.find(s => s.productCode === 'OGI_V1')
    if (ogi) {
      console.log(`\n✅ OGI_V1: ${ogi.totals.allTime} vendas`)
      if (ogi.totals.allTime === 4206) {
        console.log(`   🎉 PERFEITO! Total OGI = 4206 (esperado)`)
      }
    }
    
    const discord = newStats.find(s => s.productCode === 'DISCORD_COMMUNITY')
    if (discord) {
      console.log(`\n✅ DISCORD_COMMUNITY: ${discord.totals.allTime} vendas`)
      if (discord.totals.allTime === 2048) {
        console.log(`   🎉 PERFEITO! Total Discord = 2048 (esperado)`)
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // RESUMO FINAL
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n═'.repeat(80))
    console.log('✅ REBUILD COMPLETO!')
    console.log('═'.repeat(80))
    
    const totalVendas = newStats.reduce((sum, stat) => sum + stat.totals.allTime, 0)
    
    console.log(`\n📊 RESUMO:`)
    console.log(`   Produtos atualizados: ${newStats.length}`)
    console.log(`   Total de vendas (todos produtos): ${totalVendas}`)
    console.log(`   Esperado: 6499 (4206 OGI + 245 Clareza + 2048 Discord)`)
    
    if (totalVendas === 6499) {
      console.log(`\n🎉 SUCESSO TOTAL! Números batem perfeitamente!\n`)
    } else {
      console.log(`\n⚠️  Diferença: ${totalVendas - 6499} vendas\n`)
    }
    
  } catch (error) {
    console.error('\n❌ Erro no rebuild:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Desconectado do MongoDB\n')
  }
}

rebuild()