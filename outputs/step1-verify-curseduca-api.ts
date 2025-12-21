// ════════════════════════════════════════════════════════════
// 🔍 TESTE COMPLETO: Todos os endpoints CursEDuca
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

const CURSEDUCA_API_URL = "https://prof.curseduca.pro"
const CURSEDUCA_ACCESS_TOKEN = "***REMOVED-JWT***"
const CURSEDUCA_API_KEY = "***REMOVED-CURSEDUCA-KEY***"

async function testAllEndpoints() {
  console.log('\n🔍 TESTE COMPLETO DE ENDPOINTS CURSEDUCA')
  console.log('═'.repeat(70))
  console.log('')

  const headers = {
    'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
    'api_key': CURSEDUCA_API_KEY,
    'Content-Type': 'application/json'
  }

  const results: any = {}

  // ═══════════════════════════════════════════════════════════
  // ENDPOINT 1: /groups/{id}/members (NOVO - sugestão tua!)
  // ═══════════════════════════════════════════════════════════
  
  console.log('🆕 ENDPOINT 1: /groups/{id}/members (REST-style)')
  console.log('-'.repeat(70))
  
  try {
    let allMembers: any[] = []
    
    for (const groupId of [6, 7]) {
      console.log(`\n   📚 Buscando grupo ${groupId}...`)
      
      let offset = 0
      const limit = 100
      let hasMore = true
      let pageCount = 0
      
      while (hasMore && offset < 1000) {
        pageCount++
        
        const res = await axios.get(
          `${CURSEDUCA_API_URL}/groups/${groupId}/members`,
          { params: { limit, offset }, headers }
        )
        
        const members = Array.isArray(res.data) 
          ? res.data 
          : res.data?.data || res.data?.members || []
        
        console.log(`      📄 Página ${pageCount}: ${members.length} membros`)
        
        allMembers = allMembers.concat(members)
        
        hasMore = members.length === limit
        offset += limit
        
        if (members.length < limit) hasMore = false
        
        // Rate limiting
        if (hasMore) await new Promise(r => setTimeout(r, 200))
      }
    }
    
    results.endpoint1 = {
      name: '/groups/{id}/members',
      total: allMembers.length,
      uniqueEmails: new Set(allMembers.map((m: any) => m.email)).size,
      duplicates: allMembers.length - new Set(allMembers.map((m: any) => m.email)).size,
      hasProgress: allMembers.filter((m: any) => m.progress > 0).length,
      avgProgress: Math.round(
        allMembers.reduce((sum: number, m: any) => sum + (m.progress || 0), 0) / allMembers.length
      )
    }
    
    console.log(`\n   ✅ Total: ${results.endpoint1.total}`)
    console.log(`   📧 Únicos: ${results.endpoint1.uniqueEmails}`)
    console.log(`   🔁 Duplicados: ${results.endpoint1.duplicates}`)
    console.log(`   📊 Com progresso: ${results.endpoint1.hasProgress}`)
    console.log(`   📈 Progresso médio: ${results.endpoint1.avgProgress}%`)
    
  } catch (err: any) {
    console.log(`   ❌ Erro: ${err.message}`)
    results.endpoint1 = { error: err.message }
  }

  // ═══════════════════════════════════════════════════════════
  // ENDPOINT 2: /reports/group/members (atual no código)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n\n📊 ENDPOINT 2: /reports/group/members (atual)')
  console.log('-'.repeat(70))
  
  try {
    let allMembers: any[] = []
    
    for (const groupId of [6, 7]) {
      console.log(`\n   📚 Buscando grupo ${groupId}...`)
      
      let offset = 0
      const limit = 100
      let hasMore = true
      let pageCount = 0
      
      while (hasMore && offset < 1000) {
        pageCount++
        
        const res = await axios.get(
          `${CURSEDUCA_API_URL}/reports/group/members`,
          { params: { groupId, limit, offset }, headers }
        )
        
        const members = Array.isArray(res.data) 
          ? res.data 
          : res.data?.data || res.data?.members || []
        
        console.log(`      📄 Página ${pageCount}: ${members.length} membros`)
        
        allMembers = allMembers.concat(members)
        
        hasMore = members.length === limit
        offset += limit
        
        if (members.length < limit) hasMore = false
        
        if (hasMore) await new Promise(r => setTimeout(r, 200))
      }
    }
    
    results.endpoint2 = {
      name: '/reports/group/members',
      total: allMembers.length,
      uniqueEmails: new Set(allMembers.map((m: any) => m.email)).size,
      duplicates: allMembers.length - new Set(allMembers.map((m: any) => m.email)).size,
      hasProgress: allMembers.filter((m: any) => m.progress > 0).length,
      avgProgress: Math.round(
        allMembers.reduce((sum: number, m: any) => sum + (m.progress || 0), 0) / allMembers.length
      )
    }
    
    console.log(`\n   ✅ Total: ${results.endpoint2.total}`)
    console.log(`   📧 Únicos: ${results.endpoint2.uniqueEmails}`)
    console.log(`   🔁 Duplicados: ${results.endpoint2.duplicates}`)
    console.log(`   📊 Com progresso: ${results.endpoint2.hasProgress}`)
    console.log(`   📈 Progresso médio: ${results.endpoint2.avgProgress}%`)
    
  } catch (err: any) {
    console.log(`   ❌ Erro: ${err.message}`)
    results.endpoint2 = { error: err.message }
  }

  // ═══════════════════════════════════════════════════════════
  // ENDPOINT 3: /members (sem filtro de grupo)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n\n🌍 ENDPOINT 3: /members (todos os grupos)')
  console.log('-'.repeat(70))
  
  try {
    let allMembers: any[] = []
    let offset = 0
    const limit = 100
    let hasMore = true
    let pageCount = 0
    
    while (hasMore && offset < 1000) {
      pageCount++
      
      const res = await axios.get(
        `${CURSEDUCA_API_URL}/members`,
        { params: { limit, offset }, headers }
      )
      
      const members = Array.isArray(res.data) 
        ? res.data 
        : res.data?.data || res.data?.members || []
      
      console.log(`   📄 Página ${pageCount}: ${members.length} membros`)
      
      allMembers = allMembers.concat(members)
      
      hasMore = members.length === limit
      offset += limit
      
      if (members.length < limit) hasMore = false
      
      if (hasMore) await new Promise(r => setTimeout(r, 200))
    }
    
    results.endpoint3 = {
      name: '/members',
      total: allMembers.length,
      uniqueEmails: new Set(allMembers.map((m: any) => m.email)).size,
      duplicates: allMembers.length - new Set(allMembers.map((m: any) => m.email)).size,
      hasProgress: allMembers.filter((m: any) => m.progress > 0).length,
      avgProgress: Math.round(
        allMembers.reduce((sum: number, m: any) => sum + (m.progress || 0), 0) / allMembers.length
      )
    }
    
    console.log(`\n   ✅ Total: ${results.endpoint3.total}`)
    console.log(`   📧 Únicos: ${results.endpoint3.uniqueEmails}`)
    console.log(`   📊 Com progresso: ${results.endpoint3.hasProgress}`)
    console.log(`   📈 Progresso médio: ${results.endpoint3.avgProgress}%`)
    
  } catch (err: any) {
    console.log(`   ❌ Erro: ${err.message}`)
    results.endpoint3 = { error: err.message }
  }

  // ═══════════════════════════════════════════════════════════
  // COMPARAÇÃO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n\n' + '═'.repeat(70))
  console.log('📊 COMPARAÇÃO FINAL')
  console.log('═'.repeat(70))
  console.log('')

  const table = [
    ['Endpoint', 'Total', 'Únicos', 'Duplicados', 'Com Progresso', 'Avg %'],
    ['-'.repeat(35), '-'.repeat(8), '-'.repeat(8), '-'.repeat(12), '-'.repeat(14), '-'.repeat(6)]
  ]

  for (const [key, value] of Object.entries(results)) {
    if ((value as any).error) {
      table.push([
        (value as any).name || key,
        '❌ ERRO',
        '-',
        '-',
        '-',
        '-'
      ])
    } else {
      const v = value as any
      table.push([
        v.name,
        v.total.toString(),
        v.uniqueEmails.toString(),
        v.duplicates?.toString() || '0',
        v.hasProgress.toString(),
        `${v.avgProgress}%`
      ])
    }
  }

  // Print table
  table.forEach(row => {
    console.log(
      row[0].padEnd(35) + 
      row[1].padEnd(10) + 
      row[2].padEnd(10) + 
      row[3].padEnd(14) + 
      row[4].padEnd(16) + 
      row[5]
    )
  })

  // ═══════════════════════════════════════════════════════════
  // RECOMENDAÇÃO
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70))
  console.log('🎯 RECOMENDAÇÃO')
  console.log('═'.repeat(70))
  console.log('')

  const expectedTotal = 324 // 154 + 170 (da interface web)

  // Encontrar melhor endpoint
  const endpoints = [
    { name: 'Endpoint 1 (/groups/{id}/members)', data: results.endpoint1 },
    { name: 'Endpoint 2 (/reports/group/members)', data: results.endpoint2 },
    { name: 'Endpoint 3 (/members)', data: results.endpoint3 }
  ]

  const valid = endpoints.filter(e => !e.data.error)
  
  if (valid.length === 0) {
    console.log('❌ Nenhum endpoint funcionou!')
    return
  }

  // Ordenar por proximidade ao esperado
  valid.sort((a, b) => {
    const diffA = Math.abs(a.data.uniqueEmails - expectedTotal)
    const diffB = Math.abs(b.data.uniqueEmails - expectedTotal)
    return diffA - diffB
  })

  const best = valid[0]
  const diff = best.data.uniqueEmails - expectedTotal

  console.log(`✅ MELHOR OPÇÃO: ${best.name}`)
  console.log(`   📧 Users únicos: ${best.data.uniqueEmails}`)
  console.log(`   🎯 Esperado: ${expectedTotal}`)
  console.log(`   📊 Diferença: ${diff > 0 ? '+' : ''}${diff}`)
  console.log('')

  if (Math.abs(diff) <= 5) {
    console.log('   ✅ Diferença aceitável (±5 users)')
  } else if (Math.abs(diff) <= 30) {
    console.log('   ⚠️  Diferença moderada')
    console.log(`   💡 Possível causa: Users duplicados entre grupos ou API desatualizada`)
  } else {
    console.log('   ❌ Diferença significativa')
    console.log(`   💡 Recomendação: Usar endpoint que retorna mais users (mais completo)`)
  }

  console.log('')
  console.log('🔧 CÓDIGO SUGERIDO:')
  console.log('')
  
  if (best.name.includes('/groups/')) {
    console.log('   // Usar endpoint REST-style:')
    console.log('   const response = await axios.get(')
    console.log('     `${CURSEDUCA_API_URL}/groups/${groupId}/members`,')
    console.log('     { params: { limit, offset }, headers }')
    console.log('   )')
  } else if (best.name.includes('/reports/')) {
    console.log('   // Manter endpoint atual:')
    console.log('   const response = await axios.get(')
    console.log('     `${CURSEDUCA_API_URL}/reports/group/members`,')
    console.log('     { params: { groupId, limit, offset }, headers }')
    console.log('   )')
  } else {
    console.log('   // Usar endpoint global (sem filtro):')
    console.log('   const response = await axios.get(')
    console.log('     `${CURSEDUCA_API_URL}/members`,')
    console.log('     { params: { limit, offset }, headers }')
    console.log('   )')
  }

  console.log('\n✅ Teste completo!\n')
}

testAllEndpoints()