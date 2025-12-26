// ════════════════════════════════════════════════════════════
// 📁 outputs/test-preview-endpoint.ts
// Script: Testar endpoint POST /api/tag-rules/preview
// ════════════════════════════════════════════════════════════

import axios from 'axios'

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api'

// ─────────────────────────────────────────────────────────────
// TESTE 1: Preview de alunos sem login 14 dias
// ─────────────────────────────────────────────────────────────

async function test1_PreviewInactive() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 1: Preview - Sem Login 14 dias (top 5)')
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
    },
    limit: 5
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/preview`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Total: ${response.data.data.total} alunos`)
    console.log(`👁️ Mostrando: ${response.data.data.showing} alunos\n`)
    
    if (response.data.success && response.data.data.users.length > 0) {
      console.log('👥 ALUNOS:')
      response.data.data.users.forEach((user: any, index: number) => {
        console.log(`\n${index + 1}. ${user.userName || 'Sem nome'} (${user.userEmail})`)
        console.log(`   Produto: ${user.productCode}`)
        console.log(`   Status: ${user.status}`)
        console.log(`   Dias sem login: ${user.daysSinceLastLogin}`)
        console.log(`   Progresso: ${user.progress}%`)
        console.log(`   Engagement: ${user.engagement}`)
      })
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 2: Preview de alunos OGI_V1
// ─────────────────────────────────────────────────────────────

async function test2_PreviewOGI() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 2: Preview - Alunos OGI_V1 (top 10)')
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
        }
      ]
    },
    limit: 10
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/preview`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Total: ${response.data.data.total} alunos no OGI_V1`)
    console.log(`👁️ Mostrando: ${response.data.data.showing} alunos\n`)
    
    if (response.data.success && response.data.data.users.length > 0) {
      console.log('👥 ALUNOS:')
      response.data.data.users.forEach((user: any, index: number) => {
        console.log(`${index + 1}. ${user.userName} - ${user.userEmail} - ${user.progress}% progresso`)
      })
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 3: Preview COMBINED - OGI_V1 + Sem login 14d
// ─────────────────────────────────────────────────────────────

async function test3_PreviewCombined() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 3: Preview - OGI_V1 + Sem Login 14d')
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
    },
    limit: 15
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/preview`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Total: ${response.data.data.total} alunos`)
    console.log(`👁️ Mostrando: ${response.data.data.showing} alunos\n`)
    
    if (response.data.success && response.data.data.users.length > 0) {
      console.log('👥 ALUNOS QUE RECEBERIAM TAG:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      response.data.data.users.forEach((user: any, index: number) => {
        console.log(`${index + 1}. ${user.userName}`)
        console.log(`   📧 Email: ${user.userEmail}`)
        console.log(`   📦 Produto: ${user.productCode}`)
        console.log(`   ⏰ Dias sem login: ${user.daysSinceLastLogin}`)
        console.log(`   📊 Progresso: ${user.progress}%`)
        console.log(`   🎯 Engagement: ${user.engagement}`)
        console.log('')
      })
      
      console.log('💡 Estes alunos receberiam a tag "OGI - Inativo 14d"')
    }
  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// TESTE 4: Preview Clareza Anual + Baixo Uso
// ─────────────────────────────────────────────────────────────

async function test4_PreviewClarezaRisk() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TESTE 4: Preview - Clareza Anual em Risco')
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
    },
    limit: 10
  }

  try {
    const response = await axios.post(`${API_BASE}/tag-rules/preview`, payload)
    
    console.log('✅ SUCESSO!')
    console.log(`📊 Total: ${response.data.data.total} alunos em risco`)
    console.log(`👁️ Mostrando: ${response.data.data.showing} alunos\n`)
    
    if (response.data.success && response.data.data.users.length > 0) {
      console.log('💰 ALUNOS DE ALTO VALOR EM RISCO:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      let totalValue = 0
      
      response.data.data.users.forEach((user: any, index: number) => {
        console.log(`${index + 1}. ${user.userName}`)
        console.log(`   📧 ${user.userEmail}`)
        console.log(`   📦 ${user.productCode}`)
        console.log(`   💰 Valor: (dados não disponíveis neste preview)`)
        console.log(`   📊 Progresso: ${user.progress}%`)
        console.log(`   🎯 Ações mês passado: (ver engagement)`)
        console.log('')
      })
      
      console.log('⚠️  ATENÇÃO: Clientes premium com baixo uso!')
      console.log('💡 Requerem atenção especial e comunicação personalizada')
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
  console.log('║  🧪 TESTE - ENDPOINT /api/tag-rules/preview       ║')
  console.log('╚════════════════════════════════════════════════════╝')

  await test1_PreviewInactive()
  await test2_PreviewOGI()
  await test3_PreviewCombined()
  await test4_PreviewClarezaRisk()

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  ✅ TODOS OS TESTES CONCLUÍDOS!                   ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

// ─────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────

runAllTests().catch(console.error)