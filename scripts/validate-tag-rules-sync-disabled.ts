// ════════════════════════════════════════════════════════════════════════════
// 📁 scripts/validate-tag-rules-sync-disabled.ts
// Script: Validação de Desativação do TAG_RULES_SYNC
// Objetivo: Comprovar que sistema antigo foi desativado corretamente
// ════════════════════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

interface ValidationResult {
  test: string
  status: 'PASS' | 'FAIL' | 'WARNING'
  details: string
  expected: string
  actual: string
}

interface ValidationReport {
  timestamp: string
  totalTests: number
  passed: number
  failed: number
  warnings: number
  results: ValidationResult[]
  conclusion: 'SUCCESS' | 'FAILURE' | 'PARTIAL'
}

// ════════════════════════════════════════════════════════════
// TESTES
// ════════════════════════════════════════════════════════════

async function runValidation(): Promise<ValidationReport> {
  console.log('🧪 ════════════════════════════════════════════════════════')
  console.log('🧪 VALIDAÇÃO: Desativação TAG_RULES_SYNC')
  console.log('🧪 ════════════════════════════════════════════════════════\n')

  const results: ValidationResult[] = []
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 1: Verificar import comentado em index.ts
  // ═══════════════════════════════════════════════════════════
  
  console.log('📝 Teste 1: Import cronManagementService comentado...')
  
  try {
    const indexPath = path.join(process.cwd(), 'src', 'index.ts')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')
    
    const importLine = indexContent.split('\n').find(line => 
      line.includes('cronManagementService') && line.includes('from')
    )
    
    const isCommented = importLine?.trim().startsWith('//')
    
    results.push({
      test: 'Import cronManagementService está comentado',
      status: isCommented ? 'PASS' : 'FAIL',
      details: isCommented 
        ? 'Import está comentado corretamente'
        : 'Import ainda está ativo (não comentado)',
      expected: 'Linha começando com "//"',
      actual: importLine || 'Linha não encontrada'
    })
    
    console.log(`   ${isCommented ? '✅' : '❌'} ${isCommented ? 'PASS' : 'FAIL'}\n`)
  } catch (error: any) {
    results.push({
      test: 'Import cronManagementService está comentado',
      status: 'FAIL',
      details: `Erro ao ler ficheiro: ${error.message}`,
      expected: 'Ficheiro legível',
      actual: 'Erro de leitura'
    })
    console.log('   ❌ FAIL\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 2: Verificar bloco try-catch comentado
  // ═══════════════════════════════════════════════════════════
  
  console.log('📝 Teste 2: Bloco initializeCronJobs() comentado...')
  
  try {
    const indexPath = path.join(process.cwd(), 'src', 'index.ts')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')
    
    // Procurar por initializeCronJobs não comentado
    const hasActiveCall = /^\s*await\s+cronManagementService\.initializeCronJobs\(\)/m.test(indexContent)
    
    // Procurar por initializeCronJobs dentro de comentário
    const hasCommentedCall = /\/\*[\s\S]*initializeCronJobs[\s\S]*\*\//m.test(indexContent)
    
    const isCorrect = !hasActiveCall && hasCommentedCall
    
    results.push({
      test: 'Bloco initializeCronJobs() está comentado',
      status: isCorrect ? 'PASS' : 'FAIL',
      details: isCorrect
        ? 'Bloco está dentro de /* */ (comentado)'
        : hasActiveCall
          ? 'Bloco ainda está ATIVO (não comentado)'
          : 'Bloco não encontrado',
      expected: 'Código dentro de /* */',
      actual: hasActiveCall ? 'Código ativo' : hasCommentedCall ? 'Código comentado' : 'Não encontrado'
    })
    
    console.log(`   ${isCorrect ? '✅' : '❌'} ${isCorrect ? 'PASS' : 'FAIL'}\n`)
  } catch (error: any) {
    results.push({
      test: 'Bloco initializeCronJobs() está comentado',
      status: 'FAIL',
      details: `Erro ao ler ficheiro: ${error.message}`,
      expected: 'Código comentado',
      actual: 'Erro de leitura'
    })
    console.log('   ❌ FAIL\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 3: Verificar novo console.log adicionado
  // ═══════════════════════════════════════════════════════════
  
  console.log('📝 Teste 3: Novo console.log de desativação...')
  
  try {
    const indexPath = path.join(process.cwd(), 'src', 'index.ts')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')
    
    const hasNewLog = indexContent.includes('CRON Management (antigo) desativado')
    
    results.push({
      test: 'Console.log de desativação presente',
      status: hasNewLog ? 'PASS' : 'FAIL',
      details: hasNewLog
        ? 'Log "CRON Management (antigo) desativado" encontrado'
        : 'Log de desativação NÃO encontrado',
      expected: 'console.log("⏭️ CRON Management (antigo) desativado...")',
      actual: hasNewLog ? 'Presente' : 'Ausente'
    })
    
    console.log(`   ${hasNewLog ? '✅' : '❌'} ${hasNewLog ? 'PASS' : 'FAIL'}\n`)
  } catch (error: any) {
    results.push({
      test: 'Console.log de desativação presente',
      status: 'FAIL',
      details: `Erro ao ler ficheiro: ${error.message}`,
      expected: 'Log presente',
      actual: 'Erro de leitura'
    })
    console.log('   ❌ FAIL\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 4: Verificar comentário explicativo
  // ═══════════════════════════════════════════════════════════
  
  console.log('📝 Teste 4: Comentário explicativo presente...')
  
  try {
    const indexPath = path.join(process.cwd(), 'src', 'index.ts')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')
    
    const hasExplanation = indexContent.includes('SISTEMA ANTIGO DESATIVADO') &&
                           indexContent.includes('TAG_RULES_SYNC duplicava STEP 4')
    
    results.push({
      test: 'Comentário explicativo presente',
      status: hasExplanation ? 'PASS' : 'WARNING',
      details: hasExplanation
        ? 'Comentário explicativo completo encontrado'
        : 'Comentário explicativo não encontrado (recomendado mas não crítico)',
      expected: 'Bloco com "SISTEMA ANTIGO DESATIVADO" e "TAG_RULES_SYNC duplicava"',
      actual: hasExplanation ? 'Presente' : 'Ausente'
    })
    
    console.log(`   ${hasExplanation ? '✅' : '⚠️'} ${hasExplanation ? 'PASS' : 'WARNING'}\n`)
  } catch (error: any) {
    results.push({
      test: 'Comentário explicativo presente',
      status: 'WARNING',
      details: `Erro ao ler ficheiro: ${error.message}`,
      expected: 'Comentário presente',
      actual: 'Erro de leitura'
    })
    console.log('   ⚠️ WARNING\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 5: Verificar cronManagement.service.ts ainda existe
  // ═══════════════════════════════════════════════════════════
  
  console.log('📝 Teste 5: cronManagement.service.ts ainda existe...')
  
  try {
    const servicePath = path.join(process.cwd(), 'src', 'services', 'cronManagement.service.ts')
    const exists = fs.existsSync(servicePath)
    
    results.push({
      test: 'Ficheiro cronManagement.service.ts existe',
      status: exists ? 'PASS' : 'WARNING',
      details: exists
        ? 'Ficheiro mantido (correto - será removido na Fase 3)'
        : 'Ficheiro não encontrado (possível problema)',
      expected: 'Ficheiro existe (será removido depois)',
      actual: exists ? 'Existe' : 'Não existe'
    })
    
    console.log(`   ${exists ? '✅' : '⚠️'} ${exists ? 'PASS' : 'WARNING'}\n`)
  } catch (error: any) {
    results.push({
      test: 'Ficheiro cronManagement.service.ts existe',
      status: 'WARNING',
      details: `Erro ao verificar ficheiro: ${error.message}`,
      expected: 'Ficheiro verificável',
      actual: 'Erro de verificação'
    })
    console.log('   ⚠️ WARNING\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 6: Verificar DailyPipeline existe
  // ═══════════════════════════════════════════════════════════
  
  console.log('📝 Teste 6: DailyPipeline job existe...')
  
  try {
    const pipelinePath = path.join(process.cwd(), 'src', 'jobs', 'dailyPipeline.job.ts')
    const exists = fs.existsSync(pipelinePath)
    
    results.push({
      test: 'Ficheiro dailyPipeline.job.ts existe',
      status: exists ? 'PASS' : 'FAIL',
      details: exists
        ? 'DailyPipeline encontrado (substitui TAG_RULES_SYNC)'
        : 'DailyPipeline NÃO encontrado (CRÍTICO!)',
      expected: 'Ficheiro existe',
      actual: exists ? 'Existe' : 'Não existe'
    })
    
    console.log(`   ${exists ? '✅' : '❌'} ${exists ? 'PASS' : 'FAIL'}\n`)
  } catch (error: any) {
    results.push({
      test: 'Ficheiro dailyPipeline.job.ts existe',
      status: 'FAIL',
      details: `Erro ao verificar ficheiro: ${error.message}`,
      expected: 'Ficheiro verificável',
      actual: 'Erro de verificação'
    })
    console.log('   ❌ FAIL\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // CALCULAR ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const warnings = results.filter(r => r.status === 'WARNING').length
  
  const conclusion: 'SUCCESS' | 'FAILURE' | 'PARTIAL' = 
    failed > 0 ? 'FAILURE' :
    warnings > 0 ? 'PARTIAL' :
    'SUCCESS'
  
  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    warnings,
    results,
    conclusion
  }
}

// ════════════════════════════════════════════════════════════
// GERAR RELATÓRIO MARKDOWN
// ════════════════════════════════════════════════════════════

function generateMarkdownReport(report: ValidationReport): string {
  const emoji = report.conclusion === 'SUCCESS' ? '🎉' : 
                report.conclusion === 'PARTIAL' ? '⚠️' : '❌'
  
  let md = `# ${emoji} RELATÓRIO DE VALIDAÇÃO - Desativação TAG_RULES_SYNC\n\n`
  md += `**Data:** ${new Date(report.timestamp).toLocaleString('pt-PT')}\n`
  md += `**Status:** ${report.conclusion}\n\n`
  
  md += `---\n\n`
  
  md += `## 📊 Resumo Executivo\n\n`
  md += `| Métrica | Valor |\n`
  md += `|---------|-------|\n`
  md += `| **Total de Testes** | ${report.totalTests} |\n`
  md += `| **✅ Passaram** | ${report.passed} |\n`
  md += `| **❌ Falharam** | ${report.failed} |\n`
  md += `| **⚠️ Warnings** | ${report.warnings} |\n`
  md += `| **Taxa de Sucesso** | ${Math.round((report.passed / report.totalTests) * 100)}% |\n\n`
  
  md += `---\n\n`
  
  md += `## 📝 Resultados Detalhados\n\n`
  
  report.results.forEach((result, index) => {
    const icon = result.status === 'PASS' ? '✅' :
                 result.status === 'FAIL' ? '❌' : '⚠️'
    
    md += `### ${icon} Teste ${index + 1}: ${result.test}\n\n`
    md += `**Status:** ${result.status}\n\n`
    md += `**Detalhes:** ${result.details}\n\n`
    md += `**Esperado:** ${result.expected}\n\n`
    md += `**Obtido:** ${result.actual}\n\n`
    md += `---\n\n`
  })
  
  md += `## 🎯 Conclusão\n\n`
  
  if (report.conclusion === 'SUCCESS') {
    md += `### ✅ VALIDAÇÃO COMPLETA COM SUCESSO\n\n`
    md += `Todos os testes passaram! O sistema TAG_RULES_SYNC foi desativado corretamente.\n\n`
    md += `**Próximos passos:**\n`
    md += `1. Fazer commit das alterações\n`
    md += `2. Monitorizar execução às 02:00 amanhã\n`
    md += `3. Confirmar que só DailyPipeline executa\n`
  } else if (report.conclusion === 'PARTIAL') {
    md += `### ⚠️ VALIDAÇÃO PARCIAL\n\n`
    md += `Alguns testes têm warnings mas nada crítico.\n\n`
    md += `**Ação recomendada:** Revisar warnings antes de commit.\n`
  } else {
    md += `### ❌ VALIDAÇÃO FALHOU\n\n`
    md += `Alguns testes críticos falharam!\n\n`
    md += `**Ação obrigatória:** Corrigir problemas antes de commit.\n`
  }
  
  md += `\n---\n\n`
  md += `**Relatório gerado automaticamente por:** \`scripts/validate-tag-rules-sync-disabled.ts\`\n`
  
  return md
}

// ════════════════════════════════════════════════════════════
// EXECUTAR E GUARDAR RELATÓRIO
// ════════════════════════════════════════════════════════════

async function main() {
  try {
    const report = await runValidation()
    
    // Gerar markdown
    const markdown = generateMarkdownReport(report)
    
    // Guardar relatório
    const reportsDir = path.join(process.cwd(), 'reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
    const reportPath = path.join(reportsDir, `validation-tag-rules-sync-${timestamp}.md`)
    
    fs.writeFileSync(reportPath, markdown, 'utf-8')
    
    console.log('\n🎉 ════════════════════════════════════════════════════════')
    console.log('🎉 VALIDAÇÃO CONCLUÍDA')
    console.log('🎉 ════════════════════════════════════════════════════════\n')
    console.log(`📄 Relatório guardado em: ${reportPath}\n`)
    
    console.log('📊 Resumo:')
    console.log(`   Total: ${report.totalTests}`)
    console.log(`   ✅ Passaram: ${report.passed}`)
    console.log(`   ❌ Falharam: ${report.failed}`)
    console.log(`   ⚠️ Warnings: ${report.warnings}`)
    console.log(`   🎯 Conclusão: ${report.conclusion}\n`)
    
    if (report.conclusion === 'SUCCESS') {
      console.log('✅ TUDO OK! Podes fazer commit com confiança! 🚀\n')
      process.exit(0)
    } else if (report.conclusion === 'PARTIAL') {
      console.log('⚠️ Warnings encontrados. Revê antes de commit.\n')
      process.exit(0)
    } else {
      console.log('❌ Testes falharam! Corrige os problemas antes de commit!\n')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('💥 Erro fatal na validação:', error.message)
    process.exit(1)
  }
}

main()