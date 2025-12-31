// ════════════════════════════════════════════════════════════
// ✅ FASE 2: REAPLICAÇÃO DE TAGS
// Pipeline completo: sync + engagement + tags
// Simula o cron diário das 02:00
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import TagRule from '../src/models/acTags/TagRule'
import activeCampaignService from '../src/services/ac/activeCampaignService'
import tagRuleEngine from '../src/services/ac/tagRuleEngine'

const MONGO_URL = process.env.MONGO_URL!
const DB_NAME = process.env.DB_NAME!

console.clear()
console.log('═'.repeat(70))
console.log('✅ FASE 2: REAPLICAÇÃO DE TAGS')
console.log('═'.repeat(70))
console.log()

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const DRY_RUN = false // ← MUDAR PARA false PARA EXECUTAR!
const LIMIT: number | null = null // null = todos, número = limite de users

const BO_TAG_PREFIXES = [
  'CLAREZA_MENSAL',
  'CLAREZA_ANUAL',
  'OGI_V1',
  'DISCORD_COMMUNITY'
]

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: APLICAR TAGS
// ═══════════════════════════════════════════════════════════

async function applyTags() {
  console.log('🏷️  Aplicando tags...')
  console.log()

  const products = await Product.find({ isActive: true })
  let totalExecutions = 0
  let totalUsers = 0

  for (const product of products) {
    console.log('═'.repeat(70))
    console.log(`📦 ${product.code}`)
    console.log('═'.repeat(70))
    console.log()

    // ✅ SÓ USERPRODUCTS PRIMÁRIOS!
    const userProducts = await UserProduct.find({
      productId: product._id,
      status: 'ACTIVE',
      isPrimary: true
    })

    if (LIMIT) {
      userProducts.splice(LIMIT)
    }

    console.log(`   ${userProducts.length} UserProducts primários`)
    console.log()

    for (const up of userProducts) {
      const user = await User.findById(up.userId)
      if (!user || !user.email) continue

      try {
        // ═══════════════════════════════════════════════════════
        // 1. AVALIAR REGRAS
        // ═══════════════════════════════════════════════════════

        const results = await tagRuleEngine.evaluateUserRules(up.userId, product.courseId)

        const executed = results.filter(r => r.executed)
        if (executed.length === 0) continue

        // ═══════════════════════════════════════════════════════
        // 2. COLETAR TAGS A ADICIONAR/REMOVER
        // ═══════════════════════════════════════════════════════

        const tagsToAdd: string[] = []
        const tagsToRemove: string[] = []

        for (const result of executed) {
          const rule = await TagRule.findById(result.ruleId)
          if (!rule) continue

          // Tag a adicionar
          if (rule.actions.addTag) {
            tagsToAdd.push(rule.actions.addTag)
          }

          // Tags a remover (só do BO!)
          if (rule.actions.removeTags && rule.actions.removeTags.length > 0) {
            for (const tagToRemove of rule.actions.removeTags) {
              // ✅ SÓ REMOVER SE FOR TAG DO BO!
              if (BO_TAG_PREFIXES.some(prefix => tagToRemove.startsWith(prefix))) {
                tagsToRemove.push(tagToRemove)
              }
            }
          }
        }

        if (tagsToAdd.length === 0 && tagsToRemove.length === 0) continue

        console.log(`   📧 ${user.email}`)

        if (DRY_RUN) {
          console.log(`      🔍 [DRY RUN] ${tagsToAdd.length} add, ${tagsToRemove.length} remove`)
          continue
        }

        // ═══════════════════════════════════════════════════════
        // 3. REMOVER TAGS ANTIGAS (ACTIVECAMPAIGN)
        // ═══════════════════════════════════════════════════════

        for (const tag of tagsToRemove) {
          try {
            await activeCampaignService.removeTag(user.email, tag)
            console.log(`      🗑️  Removida: ${tag}`)
          } catch (error: any) {
            // Ignorar se tag não existe
            if (!error.message?.includes('não existe')) {
              console.log(`      ⚠️  Erro ao remover "${tag}": ${error.message}`)
            }
          }
        }

        // ═══════════════════════════════════════════════════════
        // 4. ADICIONAR NOVAS TAGS (ACTIVECAMPAIGN)
        // ═══════════════════════════════════════════════════════

        for (const tag of tagsToAdd) {
          try {
            await activeCampaignService.addTag(user.email, tag)
            console.log(`      ✅ Adicionada: ${tag}`)
          } catch (error: any) {
            console.log(`      ❌ Erro ao adicionar "${tag}": ${error.message}`)
          }
        }

        // ═══════════════════════════════════════════════════════
        // 5. ATUALIZAR BD
        // ═══════════════════════════════════════════════════════

        const currentTags: string[] = (up as any).activeCampaignData?.tags || []

        // Remover tags antigas
        const finalTags = currentTags.filter((tag: string) => !tagsToRemove.includes(tag))

        // Adicionar novas tags
        for (const tag of tagsToAdd) {
          if (!finalTags.includes(tag)) {
            finalTags.push(tag)
          }
        }

        await UserProduct.updateOne(
          { _id: up._id },
          {
            $set: {
              'activeCampaignData.tags': finalTags,
              'activeCampaignData.lastSyncAt': new Date()
            }
          }
        )

        totalExecutions++
        totalUsers++

        // Delay para não saturar AC
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error: any) {
        console.log(`      ❌ Erro: ${error.message}`)
      }
    }

    console.log()
  }

  return { executions: totalExecutions, users: totalUsers }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now()

  try {
    await mongoose.connect(MONGO_URL, { dbName: DB_NAME })
    console.log('✅ Conectado ao MongoDB')
    console.log()

    if (DRY_RUN) {
      console.log('🔍 MODO DRY RUN - Nenhuma alteração será feita')
      console.log('   Mudar DRY_RUN = false para executar')
      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // EXECUTAR PIPELINE
    // ═══════════════════════════════════════════════════════════

    const result = await applyTags()

    // ═══════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════

    const duration = Math.round((Date.now() - startTime) / 1000)

    console.log('═'.repeat(70))
    console.log('📊 RESULTADO FINAL')
    console.log('═'.repeat(70))
    console.log()
    console.log(`Users com tags aplicadas: ${result.users}`)
    console.log(`Total de execuções: ${result.executions}`)
    console.log(`Duração: ${duration}s`)
    console.log()

    if (DRY_RUN) {
      console.log('🔍 DRY RUN - Nenhuma alteração foi feita')
      console.log()
      console.log('💡 Para executar:')
      console.log('   1. Mudar DRY_RUN = false')
      console.log('   2. Executar novamente')
    } else {
      console.log('✅ REAPLICAÇÃO COMPLETA!')
      console.log()
      console.log('💡 Verificar:')
      console.log('   1. Tags no ActiveCampaign dashboard')
      console.log('   2. Tags na BD (UserProduct.activeCampaignData.tags)')
      console.log('   3. Se tudo OK, configurar cron diário!')
    }
    console.log()
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('👋 Desconectado')
  }
}

main()
