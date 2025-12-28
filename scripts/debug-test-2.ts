// ════════════════════════════════════════════════════════════════════════════
// 📁 scripts/debug-test-2.ts
// Script: Debug do Teste 2
// Objetivo: Ver exatamente o que está sendo detectado
// ════════════════════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

console.log('🔍 DEBUG: Teste 2 - Bloco initializeCronJobs() comentado\n')

const indexPath = path.join(process.cwd(), 'src', 'index.ts')
const indexContent = fs.readFileSync(indexPath, 'utf-8')

console.log('═══════════════════════════════════════════════════════════\n')
console.log('📝 TESTE 1: Procurar initializeCronJobs ATIVO (sem comentário)\n')

const regex1 = /^\s*await\s+cronManagementService\.initializeCronJobs\(\)/m
const hasActiveCall = regex1.test(indexContent)

console.log(`Regex: /^\\s*await\\s+cronManagementService\\.initializeCronJobs\\(\\)/m`)
console.log(`Resultado: ${hasActiveCall}`)

if (hasActiveCall) {
  const match = indexContent.match(regex1)
  console.log(`⚠️ ENCONTRADO (NÃO DEVIA):`)
  console.log(`   "${match?.[0]}"`)
  console.log(`\n   Linha completa:`)
  
  const lines = indexContent.split('\n')
  const matchLine = lines.find(line => regex1.test(line))
  if (matchLine) {
    console.log(`   "${matchLine}"`)
    console.log(`\n   Caracteres (hex):`)
    for (let i = 0; i < Math.min(matchLine.length, 50); i++) {
      console.log(`   [${i}]: '${matchLine[i]}' (0x${matchLine.charCodeAt(i).toString(16)})`)
    }
  }
} else {
  console.log(`✅ OK: Não encontrado código ativo`)
}

console.log('\n═══════════════════════════════════════════════════════════\n')
console.log('📝 TESTE 2: Procurar initializeCronJobs COMENTADO (/* */)\n')

const regex2 = /\/\*[\s\S]*initializeCronJobs[\s\S]*\*\//m
const hasCommentedCall = regex2.test(indexContent)

console.log(`Regex: /\\/\\*[\\s\\S]*initializeCronJobs[\\s\\S]*\\*\\//m`)
console.log(`Resultado: ${hasCommentedCall}`)

if (hasCommentedCall) {
  console.log(`✅ OK: Encontrado código comentado`)
  
  const match = indexContent.match(regex2)
  if (match) {
    console.log(`\n   Bloco encontrado (primeiras 200 chars):`)
    console.log(`   "${match[0].substring(0, 200)}..."`)
  }
} else {
  console.log(`❌ ERRO: NÃO encontrado código comentado!`)
  
  // Procurar manualmente por /* e */
  const hasOpen = indexContent.includes('/*')
  const hasClose = indexContent.includes('*/')
  const hasInit = indexContent.includes('initializeCronJobs')
  
  console.log(`\n   Diagnóstico:`)
  console.log(`   - Tem "/*"? ${hasOpen}`)
  console.log(`   - Tem "*/"? ${hasClose}`)
  console.log(`   - Tem "initializeCronJobs"? ${hasInit}`)
  
  if (hasOpen && hasClose && hasInit) {
    console.log(`\n   ⚠️ Todos os elementos existem mas regex não encontra!`)
    console.log(`      Possível problema: newlines ou formatação`)
  }
}

console.log('\n═══════════════════════════════════════════════════════════\n')
console.log('📝 CONCLUSÃO:\n')

const isCorrect = !hasActiveCall && hasCommentedCall

if (isCorrect) {
  console.log('✅ TESTE 2 DEVERIA PASSAR!')
} else if (hasActiveCall) {
  console.log('❌ PROBLEMA: Código ativo encontrado (não deveria existir)')
} else if (!hasCommentedCall) {
  console.log('❌ PROBLEMA: Código comentado não encontrado (deveria existir)')
  console.log('\n💡 SOLUÇÃO: Verificar se o bloco /* */ está correto')
}

console.log('\n═══════════════════════════════════════════════════════════\n')
console.log('📝 EXTRATO DO FICHEIRO (linhas 90-125):\n')

const lines = indexContent.split('\n')
for (let i = 89; i < Math.min(125, lines.length); i++) {
  const lineNum = (i + 1).toString().padStart(3, ' ')
  console.log(`${lineNum}: ${lines[i]}`)
}

console.log('\n═══════════════════════════════════════════════════════════\n')