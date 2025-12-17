// ═══════════════════════════════════════════════════════════
// 🔍 SCRIPT: Verificação de Sincronização AC por Produto
// Objetivo: Verificar se tags estão sendo aplicadas corretamente
//           no Active Campaign por produto (não globalmente)
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import activeCampaignService from '../src/services/ac/activeCampaignService'

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface CheckResult {
  userId: string
  email: string
  totalProducts: number
  checks: ProductCheck[]
  issues: string[]
  warnings: string[]
}

interface ProductCheck {
  productCode: string
  productName: string
  userProductTags: string[]
  acTags: string[]
  missingInAC: string[]
  extraInAC: string[]
  status: 'OK' | 'DIVERGENT' | 'ERROR'
}

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/bo2',
  USERS_LIMIT: parseInt(process.env.CHECK_LIMIT || '10'),
  VERBOSE: process.env.VERBOSE === 'true'
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES PRINCIPAIS
// ═══════════════════════════════════════════════════════════

/**
 * Verificar sincronização de um user
 */
async function checkUserSync(user: any): Promise<CheckResult> {
  const result: CheckResult = {
    userId: user._id.toString(),
    email: user.email,
    totalProducts: 0,
    checks: [],
    issues: [],
    warnings: []
  }

  try {
    // 1. Buscar UserProducts
    const userProducts = await UserProduct.find({ userId: user._id }).populate('productId')
    result.totalProducts = userProducts.length

    if (userProducts.length === 0) {
      result.warnings.push('User has no products')
      return result
    }

    // 2. Buscar tags do AC
    let acContact: any = null
    let acTags: any[] = []

    try {
      acContact = await activeCampaignService.getContactByEmail(user.email)
      
      if (acContact) {
        acTags = await activeCampaignService.getContactTags(acContact.id)
      } else {
        result.warnings.push('Contact not found in Active Campaign')
      }
    } catch (error: any) {
      result.issues.push(`Error fetching AC data: ${error.message}`)
    }

    // 3. Para cada produto, verificar tags
    for (const up of userProducts) {
      const product = up.productId as any
      
      if (!product) {
        result.warnings.push(`Product not found for UserProduct ${up._id}`)
        continue
      }

      const check: ProductCheck = {
        productCode: product.code,
        productName: product.name,
        userProductTags: up.activeCampaignData?.tags || [],
        acTags: acTags
          .map(t => t.tag)
          .filter(t => t.startsWith(product.code + '_')),
        missingInAC: [],
        extraInAC: [],
        status: 'OK'
      }

      // 4. Verificar divergências
      // Tags que deveriam estar no AC mas não estão
      check.missingInAC = check.userProductTags.filter(
        tag => !check.acTags.includes(tag)
      )

      // Tags que estão no AC mas não deveriam (órfãs)
      check.extraInAC = check.acTags.filter(
        tag => !check.userProductTags.includes(tag)
      )

      // 5. Determinar status
      if (check.missingInAC.length > 0 || check.extraInAC.length > 0) {
        check.status = 'DIVERGENT'
        
        if (check.missingInAC.length > 0) {
          result.issues.push(
            `Product ${product.code}: ${check.missingInAC.length} tags missing in AC`
          )
        }
        
        if (check.extraInAC.length > 0) {
          result.warnings.push(
            `Product ${product.code}: ${check.extraInAC.length} orphan tags in AC`
          )
        }
      }

      result.checks.push(check)
    }

  } catch (error: any) {
    result.issues.push(`Error checking user: ${error.message}`)
  }

  return result
}

/**
 * Função principal
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🔍 AC SYNC VERIFICATION SCRIPT')
  console.log('═══════════════════════════════════════════════════════════\n')

  try {
    // 1. Conectar ao MongoDB
    console.log(`📡 Connecting to MongoDB...`)
    await mongoose.connect(CONFIG.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    // 2. Buscar users
    console.log(`👥 Fetching ${CONFIG.USERS_LIMIT} users...`)
    const users = await User.find({})
      .limit(CONFIG.USERS_LIMIT)
      .sort({ createdAt: -1 })

    console.log(`✅ Found ${users.length} users\n`)

    if (users.length === 0) {
      console.log('⚠️ No users found. Exiting.')
      process.exit(0)
    }

    // 3. Verificar cada user
    const results: CheckResult[] = []
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      console.log(`\n[${ i + 1}/${users.length}] Checking: ${user.email}`)
      console.log('─'.repeat(60))

      const result = await checkUserSync(user)
      results.push(result)

      // Exibir resultado
      console.log(`  Products: ${result.totalProducts}`)
      console.log(`  Issues: ${result.issues.length}`)
      console.log(`  Warnings: ${result.warnings.length}`)

      if (CONFIG.VERBOSE) {
        // Mostrar detalhes
        for (const check of result.checks) {
          console.log(`\n  📦 ${check.productCode} (${check.productName})`)
          console.log(`     Status: ${check.status}`)
          console.log(`     UserProduct Tags: ${check.userProductTags.length}`)
          console.log(`     AC Tags: ${check.acTags.length}`)
          
          if (check.missingInAC.length > 0) {
            console.log(`     ❌ Missing in AC: ${check.missingInAC.join(', ')}`)
          }
          
          if (check.extraInAC.length > 0) {
            console.log(`     ⚠️  Orphan in AC: ${check.extraInAC.join(', ')}`)
          }
        }

        if (result.issues.length > 0) {
          console.log(`\n  ❌ ISSUES:`)
          result.issues.forEach(issue => console.log(`     - ${issue}`))
        }

        if (result.warnings.length > 0) {
          console.log(`\n  ⚠️  WARNINGS:`)
          result.warnings.forEach(warn => console.log(`     - ${warn}`))
        }
      }
    }

    // 4. Sumário Final
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('📊 SUMMARY')
    console.log('═══════════════════════════════════════════════════════════\n')

    const totalUsers = results.length
    const usersWithIssues = results.filter(r => r.issues.length > 0).length
    const usersWithWarnings = results.filter(r => r.warnings.length > 0).length
    const totalProducts = results.reduce((sum, r) => sum + r.totalProducts, 0)
    const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0)
    const divergentChecks = results.reduce(
      (sum, r) => sum + r.checks.filter(c => c.status === 'DIVERGENT').length, 
      0
    )

    console.log(`Total Users Checked: ${totalUsers}`)
    console.log(`Total Products: ${totalProducts}`)
    console.log(`Total Checks: ${totalChecks}`)
    console.log(`\n✅ OK: ${totalChecks - divergentChecks} (${((totalChecks - divergentChecks) / totalChecks * 100).toFixed(1)}%)`)
    console.log(`⚠️  DIVERGENT: ${divergentChecks} (${(divergentChecks / totalChecks * 100).toFixed(1)}%)`)
    console.log(`\n❌ Users with Issues: ${usersWithIssues}`)
    console.log(`⚠️  Users with Warnings: ${usersWithWarnings}`)

    // 5. Exportar JSON (opcional)
    if (process.env.EXPORT_JSON === 'true') {
      const fs = await import('fs/promises')
      const outputPath = `./check-ac-sync-${Date.now()}.json`
      
      await fs.writeFile(
        outputPath,
        JSON.stringify(results, null, 2)
      )
      
      console.log(`\n📁 Results exported to: ${outputPath}`)
    }

    // 6. Exit code
    const exitCode = usersWithIssues > 0 ? 1 : 0
    console.log(`\n${exitCode === 0 ? '✅' : '❌'} Check ${exitCode === 0 ? 'PASSED' : 'FAILED'}`)
    
    process.exit(exitCode)

  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
  }
}

// ═══════════════════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════════════════

main()

