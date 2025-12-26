// ════════════════════════════════════════════════════════════
// 📁 outputs/test-fields-endpoint.ts
// Script: Testar endpoint GET /api/tag-rules/fields
// ════════════════════════════════════════════════════════════

import axios from 'axios'

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api'

// ─────────────────────────────────────────────────────────────
// TESTE: Buscar campos disponíveis
// ─────────────────────────────────────────────────────────────

async function testGetFields() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  🧪 TESTE - ENDPOINT /api/tag-rules/fields        ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  try {
    const response = await axios.get(`${API_BASE}/tag-rules/fields`)
    
    console.log('✅ SUCESSO!\n')
    
    if (response.data.success) {
      const { USERPRODUCT, PRODUCT, COURSE } = response.data.data
      
      // ═══════════════════════════════════════════════════════════
      // USERPRODUCT
      // ═══════════════════════════════════════════════════════════
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎓 USERPRODUCT (Dados do Enrollment)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      console.log('📅 TEMPORAL:')
      USERPRODUCT.temporal.forEach((f: any) => {
        console.log(`   • ${f.field} (${f.type}) - ${f.description}`)
      })
      
      console.log('\n📊 PROGRESSO:')
      USERPRODUCT.progress.forEach((f: any) => {
        const range = f.min !== undefined ? ` [${f.min}-${f.max}]` : ''
        console.log(`   • ${f.field} (${f.type}${range}) - ${f.description}`)
      })
      
      console.log('\n🔥 ENGAGEMENT:')
      USERPRODUCT.engagement.forEach((f: any) => {
        console.log(`   • ${f.field} (${f.type}) - ${f.description}`)
      })
      
      console.log('\n💰 VALOR:')
      USERPRODUCT.value.forEach((f: any) => {
        console.log(`   • ${f.field} (${f.type}) - ${f.description}`)
      })
      
      console.log('\n📍 STATUS:')
      USERPRODUCT.status.forEach((f: any) => {
        const values = f.values ? ` [${f.values.join(', ')}]` : ''
        console.log(`   • ${f.field} (${f.type}${values}) - ${f.description}`)
      })
      
      console.log('\n📧 COMUNICAÇÃO:')
      USERPRODUCT.communication.forEach((f: any) => {
        console.log(`   • ${f.field} (${f.type}) - ${f.description}`)
      })
      
      // ═══════════════════════════════════════════════════════════
      // PRODUCT
      // ═══════════════════════════════════════════════════════════
      
      console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📦 PRODUCT (Dados do Produto)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      console.log('🏷️ IDENTIFICAÇÃO:')
      PRODUCT.identification.forEach((f: any) => {
        const values = f.values ? ` [${f.values.join(', ')}]` : ''
        console.log(`   • ${f.field} (${f.type}${values}) - ${f.description}`)
      })
      
      console.log('\n📍 STATUS:')
      PRODUCT.status.forEach((f: any) => {
        console.log(`   • ${f.field} (${f.type}) - ${f.description}`)
      })
      
      // ═══════════════════════════════════════════════════════════
      // COURSE
      // ═══════════════════════════════════════════════════════════
      
      console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🏫 COURSE (Configuração do Curso)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      console.log('🏷️ IDENTIFICAÇÃO:')
      COURSE.identification.forEach((f: any) => {
        const values = f.values ? ` [${f.values.join(', ')}]` : ''
        console.log(`   • ${f.field} (${f.type}${values}) - ${f.description}`)
      })
      
      console.log('\n⚙️ THRESHOLDS (Limites Dinâmicos):')
      COURSE.thresholds.forEach((f: any) => {
        console.log(`   • ${f.field} (${f.type}) - ${f.description}`)
      })
      
      // ═══════════════════════════════════════════════════════════
      // ESTATÍSTICAS
      // ═══════════════════════════════════════════════════════════
      
      console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📊 ESTATÍSTICAS')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      const userProductCount = 
        USERPRODUCT.temporal.length +
        USERPRODUCT.progress.length +
        USERPRODUCT.engagement.length +
        USERPRODUCT.value.length +
        USERPRODUCT.status.length +
        USERPRODUCT.communication.length
      
      const productCount = 
        PRODUCT.identification.length +
        PRODUCT.status.length
      
      const courseCount = 
        COURSE.identification.length +
        COURSE.thresholds.length
      
      console.log(`📈 USERPRODUCT: ${userProductCount} campos disponíveis`)
      console.log(`📦 PRODUCT: ${productCount} campos disponíveis`)
      console.log(`🏫 COURSE: ${courseCount} campos disponíveis`)
      console.log(`\n📊 TOTAL: ${userProductCount + productCount + courseCount} campos`)
      
      // ═══════════════════════════════════════════════════════════
      // EXEMPLOS DE USO
      // ═══════════════════════════════════════════════════════════
      
      console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('💡 EXEMPLOS DE USO')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      
      console.log('1️⃣ Alunos sem login há 14 dias:')
      console.log('   field: "engagement.daysSinceLastLogin"')
      console.log('   operator: "greaterThan"')
      console.log('   value: 14\n')
      
      console.log('2️⃣ Alunos do produto OGI_V1:')
      console.log('   field: "code" (PRODUCT)')
      console.log('   operator: "equals"')
      console.log('   value: "OGI_V1"\n')
      
      console.log('3️⃣ Progresso baixo (< 25%):')
      console.log('   field: "progress.percentage"')
      console.log('   operator: "lessThan"')
      console.log('   value: 25\n')
      
      console.log('4️⃣ Ultrapassou threshold crítico:')
      console.log('   field: "trackingConfig.loginThresholds.critical" (COURSE)')
      console.log('   operator: "greaterThan"')
      console.log('   value: (valor dinâmico do course)\n')
      
      console.log('5️⃣ Assinaturas anuais:')
      console.log('   field: "code" (PRODUCT)')
      console.log('   operator: "contains"')
      console.log('   value: "ANUAL"\n')
      
    }
    
  } catch (error: any) {
    console.error('\n❌ ERRO:', error.response?.data || error.message)
  }
  
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  ✅ TESTE CONCLUÍDO!                              ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

// ─────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────

testGetFields().catch(console.error)