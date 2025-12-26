// ════════════════════════════════════════════════════════════
// 📁 outputs/test-estimate-endpoint.ts
// Script: Testar endpoint POST /api/tag-rules/estimate
// ════════════════════════════════════════════════════════════

import axios from 'axios'

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api'

// ─────────────────────────────────────────────────────────────
// TESTE 1: USERPRODUCT - Simples (Sem login 14 dias)
// ─────────────────────────────────────────────────────────────

async function test1_UserProductSimple() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 1: USERPRODUCT - Sem login 14 dias')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'USERPRODUCT',
      logic: 'AND',
      rules: [
        {
          field: 'engagement.daysSinceLastLogin',
          operator: 'greaterThan',
          value: 14
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
    console.log('📊 Resultado:', JSON.stringify(response.data, null, 2))
    
    if (response.data.success) {
      console.log(`\n📈 Alunos afetados: ${response.data.data.estimatedCount}`)
      console.log('📊 Breakdown:', response.data.data.breakdown)
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 2: PRODUCT - Por código (OGI_V1)
// ─────────────────────────────────────────────────────────────

async function test2_ProductByCode() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 2: PRODUCT - Alunos do OGI_V1')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'PRODUCT',
      logic: 'AND',
      rules: [
        {
          field: 'code',
          operator: 'equals',
          value: 'OGI_V1'
        },
        {
          field: 'isActive',
          operator: 'equals',
          value: true
        }
      ]
    }
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
    
    console.log('✅ SUCESSO!')
    console.log('📊 Resultado:', JSON.stringify(response.data, null, 2))
    
    if (response.data.success) {
      console.log(`\n📈 Alunos do OGI_V1: ${response.data.data.estimatedCount}`)
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 3: PRODUCT - Por padrão (CLAREZA_*)
// ─────────────────────────────────────────────────────────────

async function test3_ProductByPattern() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 3: PRODUCT - Todos os Clareza')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'PRODUCT',
      logic: 'AND',
      rules: [
        {
          field: 'code',
          operator: 'startsWith',
          value: 'CLAREZA'
        },
        {
          field: 'isActive',
          operator: 'equals',
          value: true
        }
      ]
    }
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
    
    console.log('✅ SUCESSO!')
    console.log('📊 Resultado:', JSON.stringify(response.data, null, 2))
    
    if (response.data.success) {
      console.log(`\n📈 Alunos de produtos Clareza: ${response.data.data.estimatedCount}`)
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 4: COMBINED - OGI_V1 + Sem Login 14d
// ─────────────────────────────────────────────────────────────

async function test4_Combined() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 4: COMBINED - OGI_V1 + Sem Login 14d')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'COMBINED',
      groups: [
        {
          source: 'PRODUCT',
          logic: 'AND',
          rules: [
            {
              field: 'code',
              operator: 'equals',
              value: 'OGI_V1'
            }
          ]
        },
        {
          source: 'USERPRODUCT',
          logic: 'AND',
          rules: [
            {
              field: 'engagement.daysSinceLastLogin',
              operator: 'greaterThan',
              value: 14
            },
            {
              field: 'status',
              operator: 'equals',
              value: 'ACTIVE'
            }
          ]
        }
      ]
    }
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
    
    console.log('✅ SUCESSO!')
    console.log('📊 Resultado:', JSON.stringify(response.data, null, 2))
    
    if (response.data.success) {
      console.log(`\n📈 OGI_V1 sem login 14d: ${response.data.data.estimatedCount}`)
      console.log('💡 Este é o caso de uso mais comum!')
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 5: COMBINED - Clareza Anual + Baixo Uso
// ─────────────────────────────────────────────────────────────

async function test5_ClarezaAnualBaixoUso() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 5: COMBINED - Clareza Anual + Baixo Uso')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const payload = {
    conditions: {
      source: 'COMBINED',
      groups: [
        {
          source: 'PRODUCT',
          logic: 'AND',
          rules: [
            {
              field: 'code',
              operator: 'contains',
              value: 'ANUAL'
            }
          ]
        },
        {
          source: 'USERPRODUCT',
          logic: 'AND',
          rules: [
            {
              field: 'metadata.purchaseValue',
              operator: 'greaterThan',
              value: 100
            },
            {
              field: 'engagement.actionsLastMonth',
              operator: 'lessThan',
              value: 5
            },
            {
              field: 'status',
              operator: 'equals',
              value: 'ACTIVE'
            }
          ]
        }
      ]
    }
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/estimate`, payload)
    
    console.log('✅ SUCESSO!')
    console.log('📊 Resultado:', JSON.stringify(response.data, null, 2))
    
    if (response.data.success) {
      console.log(`\n📈 Clareza Anual com baixo uso: ${response.data.data.estimatedCount}`)
      console.log('💰 Alto valor em risco!')
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR TODOS OS TESTES
// ─────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  🧪 TESTE - ENDPOINT /api/tag-rules/estimate      ║')
  console.log('╚════════════════════════════════════════════════════╝')

  await test1_UserProductSimple()
  await test2_ProductByCode()
  await test3_ProductByPattern()
  await test4_Combined()
  await test5_ClarezaAnualBaixoUso()

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  ✅ TODOS OS TESTES CONCLUÍDOS!                   ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

// ─────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────

runAllTests().catch(console.error)