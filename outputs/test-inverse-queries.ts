// ════════════════════════════════════════════════════════════
// 📁 outputs/test-inverse-queries.ts
// Script: Testes inversos para validar dados
// ════════════════════════════════════════════════════════════

import axios from 'axios'

const API_BASE = process.env.API_BASE || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

// ─────────────────────────────────────────────────────────────
// TESTE INVERSO 1: Alunos COM progresso > 0%
// ─────────────────────────────────────────────────────────────

async function test1_ProgressoPositivo() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE INVERSO 1: Progresso > 0%')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'USERPRODUCT',
      logic: 'AND',
      rules: [
        {
          field: 'progress.percentage',
          operator: 'greaterThan',
          value: 0
        },
        {
          field: 'status',
          operator: 'equals',
          value: 'ACTIVE'
        }
      ]
    }
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Alunos com progresso > 0%: ${response.data.data.estimatedCount}`)
    
    if (response.data.data.estimatedCount === 0) {
      console.log('\n⚠️  PROBLEMA CONFIRMADO: TODOS têm progresso = 0%!')
      console.log('   → Campo "progress.percentage" não está sendo calculado')
    } else {
      console.log('\n✅ OK: Existem alunos com progresso!')
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE INVERSO 2: Alunos QUE TÊM campo daysSinceLastLogin
// ─────────────────────────────────────────────────────────────

async function test2_TemDaysSinceLastLogin() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE INVERSO 2: Campo daysSinceLastLogin existe?')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Teste A: daysSinceLastLogin >= 0 (qualquer valor)
  const payloadA = {
    conditions: {
      source: 'USERPRODUCT',
      rules: [
        {
          field: 'engagement.daysSinceLastLogin',
          operator: 'greaterThanOrEqual',
          value: 0
        }
      ]
    }
  }

  try {
    const responseA = await axios.post(`${API_BASE}/tag-rules/estimate`, payloadA)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Alunos com daysSinceLastLogin >= 0: ${responseA.data.data.estimatedCount}`)
    
    if (responseA.data.data.estimatedCount === 0) {
      console.log('\n⚠️  PROBLEMA CONFIRMADO: Campo "daysSinceLastLogin" NÃO EXISTE!')
      console.log('   → Nenhum UserProduct tem este campo populado')
      console.log('   → Queries de "sem login Xd" sempre retornam 0')
    } else {
      console.log('\n✅ OK: Campo existe!')
      
      // Teste B: Se campo existe, quantos têm > 14 dias?
      const payloadB = {
        conditions: {
          source: 'USERPRODUCT',
          rules: [
            {
              field: 'engagement.daysSinceLastLogin',
              operator: 'greaterThan',
              value: 14
            }
          ]
        }
      }
      
      const responseB = await axios.post(`${API_BASE}/tag-rules/estimate`, payloadB)
      console.log(`📊 Alunos com daysSinceLastLogin > 14: ${responseB.data.data.estimatedCount}`)
      
      if (responseB.data.data.estimatedCount === 0) {
        console.log('\n⚠️  ESTRANHO: Todos têm login recente (< 14 dias)?')
      }
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE INVERSO 3: Alunos QUE TÊM campo purchaseValue
// ─────────────────────────────────────────────────────────────

async function test3_TemPurchaseValue() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE INVERSO 3: Campo purchaseValue existe?')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'USERPRODUCT',
      rules: [
        {
          field: 'metadata.purchaseValue',
          operator: 'greaterThanOrEqual',
          value: 0
        }
      ]
    }
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Alunos com purchaseValue >= 0: ${response.data.data.estimatedCount}`)
    
    if (response.data.data.estimatedCount === 0) {
      console.log('\n⚠️  PROBLEMA CONFIRMADO: Campo "purchaseValue" NÃO EXISTE!')
      console.log('   → Queries de valor de compra sempre retornam 0')
    } else {
      console.log('\n✅ OK: Campo existe!')
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE INVERSO 4: Campos alternativos
// ─────────────────────────────────────────────────────────────

async function test4_CamposAlternativos() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE INVERSO 4: Verificar campos alternativos')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Possíveis alternativas para "dias sem login"
  const alternatives = [
    'progress.daysSinceLastLogin',
    'lastLogin',
    'lastAccessDate',
    'engagement.lastLoginDate'
  ]

  console.log('🔍 Testando campos alternativos para "dias sem login":\n')

  for (const field of alternatives) {
    try {
      const payload = {
        conditions: {
          source: 'USERPRODUCT',
          rules: [
            {
              field: field,
              operator: 'greaterThanOrEqual',
              value: 0
            }
          ]
        }
      }

      const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
      
      if (response.data.data.estimatedCount > 0) {
        console.log(`✅ ${field}: ${response.data.data.estimatedCount} alunos`)
      } else {
        console.log(`❌ ${field}: 0 alunos (não existe)`)
      }
    } catch (error) {
      console.log(`❌ ${field}: erro na query`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE INVERSO 5: Preview com progresso diverso
// ─────────────────────────────────────────────────────────────

async function test5_PreviewProgressoDiverso() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE INVERSO 5: Preview - Progresso diverso')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Buscar alunos sem filtro de progresso
  const payload = {
    conditions: {
      source: 'PRODUCT',
      rules: [
        {
          field: 'code',
          operator: 'equals',
          value: 'OGI_V1'
        }
      ]
    },
    limit: 20
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/preview`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Total: ${response.data.data.total} alunos`)
    console.log(`👁️ Mostrando: ${response.data.data.showing} alunos\n`)
    
    if (response.data.data.users.length > 0) {
      console.log('📊 DISTRIBUIÇÃO DE PROGRESSO:\n')
      
      let countZero = 0
      let countPositive = 0
      
      response.data.data.users.forEach((user: any) => {
        if (user.progress === 0) {
          countZero++
        } else {
          countPositive++
          console.log(`   ✅ ${user.userName}: ${user.progress}% progresso`)
        }
      })
      
      console.log(`\n📈 Resumo:`)
      console.log(`   0% progresso: ${countZero}`)
      console.log(`   > 0% progresso: ${countPositive}`)
      
      if (countPositive === 0) {
        console.log('\n⚠️  PROBLEMA: Dos 20 alunos, TODOS têm 0% progresso!')
      }
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR TODOS OS TESTES INVERSOS
// ─────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  🔬 TESTES INVERSOS - VALIDAÇÃO DE DADOS         ║')
  console.log('╚════════════════════════════════════════════════════╝')

  await test1_ProgressoPositivo()
  await test2_TemDaysSinceLastLogin()
  await test3_TemPurchaseValue()
  await test4_CamposAlternativos()
  await test5_PreviewProgressoDiverso()

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  ✅ TESTES INVERSOS CONCLUÍDOS!                   ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

runAllTests().catch(console.error)