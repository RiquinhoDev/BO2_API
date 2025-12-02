// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/normalize-all-emails.ts
// NORMALIZAÇÃO DE TODOS OS EMAILS DA BASE DE DADOS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import fs from 'fs'
import path from 'path'

interface NormalizationResult {
  totalProcessed: number
  normalized: number
  unchanged: number
  conflicts: Array<{
    originalEmail: string
    normalizedEmail: string
    count: number
    userIds: string[]
  }>
  errors: string[]
}

async function normalizeAllEmails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔧 NORMALIZAÇÃO DE EMAILS')
    console.log('═'.repeat(80))
    console.log('\n⚠️  IMPORTANTE:')
    console.log('   Este script vai normalizar TODOS os emails para lowercase + trim')
    console.log('   Um backup será criado automaticamente')
    console.log('')
    
    const result: NormalizationResult = {
      totalProcessed: 0,
      normalized: 0,
      unchanged: 0,
      conflicts: [],
      errors: []
    }
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 1: CRIAR BACKUP
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 1/4: CRIAR BACKUP ━━━\n')
    
    const backupPath = path.join(__dirname, '..', 'backups')
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true })
    }
    
    const allUsers = await User.find({}).select('email').lean()
    const backupFile = path.join(backupPath, `emails-backup-${Date.now()}.json`)
    
    fs.writeFileSync(
      backupFile,
      JSON.stringify(allUsers, null, 2),
      'utf-8'
    )
    
    console.log(`✅ Backup criado: ${backupFile}`)
    console.log(`   Total de emails salvos: ${allUsers.length}\n`)
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 2: DETECTAR CONFLITOS POTENCIAIS
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 2/4: DETECTAR CONFLITOS ━━━\n')
    
    // Agrupar por email normalizado
    const emailMap = new Map<string, Array<{ id: string; original: string }>>()
    
    for (const user of allUsers) {
      const email = user.email || ''
      const normalized = email.toLowerCase().trim()
      
      if (!emailMap.has(normalized)) {
        emailMap.set(normalized, [])
      }
      
      emailMap.get(normalized)!.push({
        id: user._id.toString(),
        original: email
      })
    }
    
    // Encontrar conflitos
    for (const [normalized, users] of emailMap.entries()) {
      if (users.length > 1) {
        result.conflicts.push({
          originalEmail: users[0].original,
          normalizedEmail: normalized,
          count: users.length,
          userIds: users.map(u => u.id)
        })
      }
    }
    
    console.log(`📊 Conflitos detectados: ${result.conflicts.length}`)
    
    if (result.conflicts.length > 0) {
      console.log('\n⚠️  ATENÇÃO: Encontrados emails que vão colidir após normalização!')
      console.log('   Exemplos:\n')
      
      for (const conflict of result.conflicts.slice(0, 5)) {
        console.log(`   ${conflict.originalEmail} → ${conflict.normalizedEmail}`)
        console.log(`      ${conflict.count} variações encontradas`)
      }
      
      if (result.conflicts.length > 5) {
        console.log(`\n   ... e mais ${result.conflicts.length - 5} conflitos\n`)
      }
      
      console.log('\n💡 RECOMENDAÇÃO:')
      console.log('   Execute PRIMEIRO o script "merge-duplicate-users.ts"')
      console.log('   para resolver duplicados antes de normalizar.\n')
      
      console.log('❓ Continuar mesmo assim? (vai criar INDEX UNIQUE errors)')
      console.log('   Pressione Ctrl+C para cancelar ou aguarde 10 segundos...\n')
      
      await new Promise(resolve => setTimeout(resolve, 10000))
    } else {
      console.log('✅ Nenhum conflito detectado! Seguro para normalizar.\n')
    }
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 3: NORMALIZAR EMAILS
    // ═════════════════════════════════════════════════════════════
    
    console.log('━━━ ETAPA 3/4: NORMALIZAR EMAILS ━━━\n')
    console.log('Processando...\n')
    
    const users = await User.find({}).select('email')
    
    for (const user of users) {
      result.totalProcessed++
      
      const originalEmail = user.email || ''
      const normalizedEmail = originalEmail.toLowerCase().trim()
      
      if (originalEmail !== normalizedEmail) {
        try {
          user.email = normalizedEmail
          await user.save()
          
          result.normalized++
          
          if (result.normalized % 100 === 0) {
            console.log(`   Progresso: ${result.normalized}/${users.length} normalizados`)
          }
        } catch (error: any) {
          result.errors.push(`Erro ao normalizar ${originalEmail}: ${error.message}`)
          console.error(`   ❌ Erro: ${originalEmail} → ${error.message}`)
        }
      } else {
        result.unchanged++
      }
    }
    
    console.log(`\n✅ Normalização completa!`)
    console.log(`   Total processados: ${result.totalProcessed}`)
    console.log(`   Normalizados: ${result.normalized}`)
    console.log(`   Sem alteração: ${result.unchanged}`)
    
    if (result.errors.length > 0) {
      console.log(`   ⚠️  Erros: ${result.errors.length}`)
    }
    
    // ═════════════════════════════════════════════════════════════
    // ETAPA 4: VERIFICAÇÃO FINAL
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ ETAPA 4/4: VERIFICAÇÃO FINAL ━━━\n')
    
    const stillHaveCaps = await User.countDocuments({
      email: { $regex: /[A-Z]/ }
    })
    
    const stillHaveSpaces = await User.countDocuments({
      $or: [
        { email: { $regex: /^\s+/ } },
        { email: { $regex: /\s+$/ } }
      ]
    })
    
    if (stillHaveCaps === 0 && stillHaveSpaces === 0) {
      console.log('✅ Todos os emails foram normalizados com sucesso!')
    } else {
      if (stillHaveCaps > 0) {
        console.log(`⚠️  Ainda existem ${stillHaveCaps} emails com maiúsculas`)
      }
      if (stillHaveSpaces > 0) {
        console.log(`⚠️  Ainda existem ${stillHaveSpaces} emails com espaços`)
      }
    }
    
    // Salvar relatório
    const reportPath = path.join(backupPath, `normalization-report-${Date.now()}.json`)
    fs.writeFileSync(
      reportPath,
      JSON.stringify(result, null, 2),
      'utf-8'
    )
    
    console.log(`\n📄 Relatório salvo: ${reportPath}`)
    
    console.log('\n═'.repeat(80))
    console.log('✅ NORMALIZAÇÃO COMPLETA')
    console.log('═'.repeat(80))
    console.log('')
    
  } catch (error) {
    console.error('❌ Erro fatal:', error)
    throw error
  } finally {
    await mongoose.disconnect()
  }
}

normalizeAllEmails()