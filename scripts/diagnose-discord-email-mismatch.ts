// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/diagnose-discord-email-mismatch.ts
// DIAGNÓSTICO: Emails Discord que não fazem match com Hotmart
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'

interface CaseSuspect {
  email: string
  emailNormalized: string
  hasDiscord: boolean
  hasOGI: boolean
  discordIds: string[]
  hotmartUserId?: string
  possibleMatch?: {
    email: string
    similarity: number
  }
}

async function diagnoseEmailMismatch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔍 DIAGNÓSTICO: Discord sem match com Hotmart')
    console.log('═'.repeat(80))
    
    // Buscar produtos
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' })
    const discordProduct = await Product.findOne({ code: 'DISCORD_COMMUNITY' })
    
    if (!ogiProduct || !discordProduct) {
      console.error('❌ Produtos não encontrados!')
      return
    }
    
    console.log('\n📦 PRODUTOS:')
    console.log(`   OGI: ${ogiProduct._id}`)
    console.log(`   Discord: ${discordProduct._id}`)
    
    // ═════════════════════════════════════════════════════════════
    // CASO 1: Users com Discord MAS SEM OGI
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ CASO 1: Discord SEM OGI ━━━\n')
    
    const discordWithoutOGI = await User.aggregate([
      {
        $lookup: {
          from: 'userproducts',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                productId: discordProduct._id
              }
            }
          ],
          as: 'discordProduct'
        }
      },
      {
        $match: { 'discordProduct.0': { $exists: true } }
      },
      {
        $lookup: {
          from: 'userproducts',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                productId: ogiProduct._id
              }
            }
          ],
          as: 'ogiProduct'
        }
      },
      {
        $match: { 'ogiProduct.0': { $exists: false } }
      },
      {
        $project: {
          email: 1,
          name: 1,
          'discord.discordIds': 1,
          'hotmart.hotmartUserId': 1
        }
      }
    ])
    
    console.log(`📊 Total: ${discordWithoutOGI.length} users com Discord mas SEM OGI\n`)
    
    if (discordWithoutOGI.length === 0) {
      console.log('✅ Nenhum caso encontrado!')
    } else {
      console.log('⚠️  CASOS SUSPEITOS:\n')
      
      const suspects: CaseSuspect[] = []
      
      for (const user of discordWithoutOGI) {
        const email = user.email || 'sem_email'
        const emailNormalized = email.toLowerCase().trim()
        
        const suspect: CaseSuspect = {
          email,
          emailNormalized,
          hasDiscord: true,
          hasOGI: false,
          discordIds: user.discord?.discordIds || [],
          hotmartUserId: user.hotmart?.hotmartUserId
        }
        
        // Procurar possível match (case-insensitive)
        const possibleMatch = await User.findOne({
          email: { $regex: new RegExp(`^${emailNormalized}$`, 'i') },
          _id: { $ne: user._id }
        }).select('email').lean()
        
        if (possibleMatch) {
          suspect.possibleMatch = {
            email: possibleMatch.email,
            similarity: calculateSimilarity(email, possibleMatch.email)
          }
        }
        
        suspects.push(suspect)
        
        console.log(`   ${email}`)
        console.log(`      Discord IDs: ${suspect.discordIds.join(', ')}`)
        console.log(`      Hotmart User ID: ${suspect.hotmartUserId || 'NENHUM'}`)
        
        if (suspect.possibleMatch) {
          console.log(`      ⚠️  POSSÍVEL MATCH: ${suspect.possibleMatch.email}`)
          console.log(`         Similaridade: ${suspect.possibleMatch.similarity}%`)
        }
        
        console.log('')
      }
    }
    
    // ═════════════════════════════════════════════════════════════
    // CASO 2: Emails com CAPS diferentes
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ CASO 2: Emails Duplicados (Case Sensitivity) ━━━\n')
    
    const duplicateEmails = await User.aggregate([
      {
        $group: {
          _id: { $toLower: '$email' },
          count: { $sum: 1 },
          emails: { $push: { email: '$email', id: '$_id' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ])
    
    console.log(`📊 Total: ${duplicateEmails.length} emails com variações de CAPS\n`)
    
    if (duplicateEmails.length === 0) {
      console.log('✅ Nenhum email duplicado encontrado!')
    } else {
      console.log('⚠️  EMAILS DUPLICADOS:\n')
      
      for (const dup of duplicateEmails) {
        console.log(`   ${dup._id} → ${dup.count} variações:`)
        
        for (const variant of dup.emails) {
          // Verificar produtos
          const userProducts = await UserProduct.find({ userId: variant.id })
            .populate('productId', 'code')
            .lean()
          
          const products = userProducts.map((up: any) => up.productId?.code || 'unknown')
          
          console.log(`      • ${variant.email}`)
          console.log(`         Produtos: ${products.join(', ') || 'NENHUM'}`)
        }
        
        console.log('')
      }
    }
    
    // ═════════════════════════════════════════════════════════════
    // CASO 3: Emails com espaços ou caracteres especiais
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ CASO 3: Emails com Problemas de Formatação ━━━\n')
    
    const problematicEmails = await User.find({
      $or: [
        { email: { $regex: /^\s+/ } },  // Começa com espaço
        { email: { $regex: /\s+$/ } },  // Termina com espaço
        { email: { $regex: /\s{2,}/ } }, // Múltiplos espaços
        { email: { $regex: /[A-Z]/ } }  // Tem maiúsculas
      ]
    }).select('email discord.discordIds hotmart.hotmartUserId').limit(50).lean()
    
    console.log(`📊 Total: ${problematicEmails.length} emails com formatação suspeita\n`)
    
    if (problematicEmails.length === 0) {
      console.log('✅ Nenhum email problemático encontrado!')
    } else {
      console.log('⚠️  EMAILS PROBLEMÁTICOS:\n')
      
      for (const user of problematicEmails.slice(0, 20)) {
        const email = user.email || 'sem_email'
        const hasSpaces = /^\s+|\s+$|\s{2,}/.test(email)
        const hasCaps = /[A-Z]/.test(email)
        
        console.log(`   "${email}"`)
        
        if (hasSpaces) {
          console.log(`      ⚠️  Tem espaços extras`)
        }
        if (hasCaps) {
          console.log(`      ⚠️  Tem maiúsculas`)
          console.log(`      → Normalizado: "${email.toLowerCase().trim()}"`)
        }
        
        console.log('')
      }
      
      if (problematicEmails.length > 20) {
        console.log(`   ... e mais ${problematicEmails.length - 20} emails\n`)
      }
    }
    
    // ═════════════════════════════════════════════════════════════
    // RESUMO E RECOMENDAÇÕES
    // ═════════════════════════════════════════════════════════════
    
    console.log('\n━━━ RESUMO E RECOMENDAÇÕES ━━━\n')
    
    const totalIssues = discordWithoutOGI.length + duplicateEmails.length + problematicEmails.length
    
    if (totalIssues === 0) {
      console.log('✅ Nenhum problema encontrado! Emails estão OK.')
    } else {
      console.log(`⚠️  Total de problemas: ${totalIssues}`)
      console.log('')
      
      if (discordWithoutOGI.length > 0) {
        console.log(`🚨 ${discordWithoutOGI.length} users com Discord mas SEM OGI`)
        console.log(`   → Pode indicar emails diferentes entre CSV Discord e Hotmart`)
        console.log(`   → Ação: Verificar se são emails legítimos ou erros de match`)
        console.log('')
      }
      
      if (duplicateEmails.length > 0) {
        console.log(`⚠️  ${duplicateEmails.length} emails com variações de CAPS`)
        console.log(`   → Emails duplicados com case diferentes`)
        console.log(`   → Ação: Normalizar emails para lowercase`)
        console.log('')
      }
      
      if (problematicEmails.length > 0) {
        console.log(`⚠️  ${problematicEmails.length} emails com formatação suspeita`)
        console.log(`   → Espaços extras ou maiúsculas`)
        console.log(`   → Ação: Normalizar emails (trim + lowercase)`)
        console.log('')
      }
      
      console.log('💡 SOLUÇÕES SUGERIDAS:')
      console.log('')
      console.log('   1. NORMALIZAÇÃO AUTOMÁTICA no sync:')
      console.log('      email = email.toLowerCase().trim()')
      console.log('')
      console.log('   2. SCRIPT DE LIMPEZA:')
      console.log('      Normalizar todos os emails existentes na BD')
      console.log('')
      console.log('   3. MERGE MANUAL:')
      console.log('      Unir users duplicados com case diferente')
      console.log('')
    }
    
    console.log('═'.repeat(80))
    console.log('✅ DIAGNÓSTICO COMPLETO\n')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO AUXILIAR: Calcular similaridade entre strings
// ─────────────────────────────────────────────────────────────

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()
  
  if (s1 === s2) return 100
  
  const len = Math.max(s1.length, s2.length)
  if (len === 0) return 100
  
  let matches = 0
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matches++
  }
  
  return Math.round((matches / len) * 100)
}

diagnoseEmailMismatch()