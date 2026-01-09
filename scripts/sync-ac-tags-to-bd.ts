// ════════════════════════════════════════════════════════════════════════════
// 🔄 SYNC AC TAGS → BD - Sincronizar tags do Active Campaign para a BD
// ════════════════════════════════════════════════════════════════════════════
//
// Este script identifica inconsistências entre Active Campaign e BD:
// - Tags que existem no AC mas NÃO na BD
// - APENAS processa tags criadas pelo BO (pattern: "PRODUTO - Status")
// - Tags nativas do AC são ignoradas
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/user'
import { UserProduct } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import logger from '../src/utils/detailedLogger'

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════════════════════

const DRY_RUN = process.env.DRY_RUN === 'true' || true  // true = apenas reporta, não altera BD

// Padrão de tags criadas pelo BO
// Exemplos: "OGI_V1 - Ativo", "OGI_V1 - Inativo 10d", "CLAREZA_MENSAL - Progresso Alto"
const BO_TAG_PATTERN = /^[A-Z_0-9]+ - .+$/

/**
 * Verifica se uma tag foi criada pelo BO
 */
function isBOTag(tagName: string): boolean {
  return BO_TAG_PATTERN.test(tagName)
}

/**
 * Extrai código do produto da tag
 * "OGI_V1 - Ativo" -> "OGI_V1"
 */
function extractProductCodeFromTag(tagName: string): string | null {
  const match = tagName.match(/^([A-Z_0-9]+) - /)
  return match ? match[1] : null
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function syncACTagsToBD() {
  logger.init(`sync-ac-bd-${Date.now()}.json`)

  console.log('════════════════════════════════════════════════════════════════')
  console.log('🔄 SINCRONIZAÇÃO AC → BD')
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`🔒 Dry Run: ${DRY_RUN ? 'SIM (não altera BD)' : 'NÃO (aplica mudanças)'}`)
  console.log('════════════════════════════════════════════════════════════════\n')

  const startTime = Date.now()
  const stats = {
    totalUsers: 0,
    usersInAC: 0,
    usersNotInAC: 0,
    totalUserProducts: 0,
    inconsistencies: 0,
    tagsAdded: 0,
    errors: 0
  }

  try {
    // 1. Conectar à BD
    logger.startOperation('Database', 'connect')
    await mongoose.connect(process.env.MONGO_URI!)
    logger.endOperation('Database', 'connect')
    console.log('✅ Conectado à BD\n')

    // 2. Buscar todos os users com email
    logger.startOperation('Database', 'findUsersWithEmail')

    const users = await User.find({
      email: { $exists: true, $nin: [null, ''] }
    }).limit(100)  // Limite por segurança - ajustar conforme necessário

    stats.totalUsers = users.length
    logger.endOperation('Database', 'findUsersWithEmail', { count: users.length })

    console.log(`📋 ${users.length} users com email\n`)

    // 3. Para cada user, verificar tags
    for (const user of users) {
      console.log(`\n👤 User: ${user.name || user.email}`)
      console.log(`   Email: ${user.email}`)

      try {
        // 🔑 Buscar/cachear contactId do AC
        logger.startOperation('ActiveCampaign', 'getContactId', { email: user.email })

        const contactId = await activeCampaignService.getContactId(user.email, String(user._id))

        logger.endOperation('ActiveCampaign', 'getContactId', {
          email: user.email,
          contactId: contactId || 'NOT_FOUND'
        })

        if (!contactId) {
          console.log('   ⚪ User não existe no Active Campaign\n')
          stats.usersNotInAC++
          continue
        }

        stats.usersInAC++
        console.log(`   🔑 Contact ID: ${contactId}`)

        // Buscar tags do AC
        logger.startOperation('ActiveCampaign', 'getContactTags', { email: user.email })

        const acTags = await activeCampaignService.getContactTagsByEmail(user.email)

        logger.endOperation('ActiveCampaign', 'getContactTags', {
          email: user.email,
          tagsCount: acTags?.length || 0
        })

        if (!acTags || acTags.length === 0) {
          console.log('   ⚪ Sem tags no AC\n')
          continue
        }

        // Filtrar apenas tags do BO
        const boTags = acTags.filter(isBOTag)

        console.log(`   📊 Tags no AC: ${acTags.length} (${boTags.length} do BO)`)

        if (boTags.length === 0) {
          console.log('   ⚪ Nenhuma tag do BO no AC\n')
          continue
        }

        // Agrupar tags por produto
        const tagsByProduct = new Map<string, string[]>()

        for (const tag of boTags) {
          const productCode = extractProductCodeFromTag(tag)

          if (!productCode) {
            logger.warn('TagParsing', 'Could not extract product code', { tag })
            continue
          }

          if (!tagsByProduct.has(productCode)) {
            tagsByProduct.set(productCode, [])
          }

          tagsByProduct.get(productCode)!.push(tag)
        }

        console.log(`   🎯 Produtos encontrados: ${Array.from(tagsByProduct.keys()).join(', ')}`)

        // Para cada produto, verificar se UserProduct existe e se tags estão na BD
        for (const [productCode, tags] of tagsByProduct) {
          // Buscar UserProduct
          const userProducts = await UserProduct.find({
            userId: String(user._id)
          }).populate('productId')

          const userProduct = userProducts.find((up: any) =>
            up.productId?.code === productCode
          )

          if (!userProduct) {
            logger.warn('Sync', 'UserProduct não encontrado mas tem tags no AC', {
              userId: String(user._id),
              email: user.email,
              productCode,
              tags
            })

            console.log(`\n   ⚠️  INCONSISTÊNCIA: Produto ${productCode} não existe na BD`)
            console.log(`      Tags no AC: ${tags.join(', ')}`)
            stats.inconsistencies++
            continue
          }

          stats.totalUserProducts++

          // Verificar quais tags estão no AC mas não na BD
          const bdTags = userProduct.activeCampaignData?.tags || []
          const missingInBD = tags.filter(tag => !bdTags.includes(tag))

          if (missingInBD.length > 0) {
            logger.warn('Sync', 'Tags no AC mas não na BD', {
              userId: String(user._id),
              productId: String(userProduct.productId._id),
              productCode,
              missingTags: missingInBD,
              bdTags,
              acTags: tags
            })

            console.log(`\n   ⚠️  INCONSISTÊNCIA: ${productCode}`)
            console.log(`      Tags na BD: ${bdTags.length > 0 ? bdTags.join(', ') : '(nenhuma)'}`)
            console.log(`      Tags no AC: ${tags.join(', ')}`)
            console.log(`      ❌ FALTAM na BD: ${missingInBD.join(', ')}`)

            stats.inconsistencies++

            if (!DRY_RUN) {
              // Adicionar tags em falta à BD
              const allTags = [...new Set([...bdTags, ...missingInBD])]

              await UserProduct.findByIdAndUpdate(userProduct._id, {
                $set: {
                  'activeCampaignData.tags': allTags,
                  'activeCampaignData.lastSync': new Date()
                }
              })

              logger.info('Sync', 'Tags adicionadas à BD', {
                userId: String(user._id),
                productCode,
                addedTags: missingInBD,
                totalTags: allTags.length
              })

              console.log(`      ✅ ADICIONADAS à BD: ${missingInBD.join(', ')}`)
              stats.tagsAdded += missingInBD.length
            } else {
              console.log(`      🔒 DRY RUN: Não alterado`)
            }
          } else {
            console.log(`   ✅ ${productCode}: BD e AC sincronizados (${bdTags.length} tags)`)
          }
        }

      } catch (error: any) {
        logger.error('Sync', 'Error processing user', error, {
          userId: String(user._id),
          email: user.email
        })

        console.error(`   ❌ Erro: ${error.message}`)
        stats.errors++
      }
    }

    // 4. Sumário
    const duration = Date.now() - startTime

    console.log('\n════════════════════════════════════════════════════════════════')
    console.log('📊 SUMÁRIO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log(`👥 Users processados: ${stats.totalUsers}`)
    console.log(`   ✅ Encontrados no AC: ${stats.usersInAC}`)
    console.log(`   ⚪ Não encontrados no AC: ${stats.usersNotInAC}`)
    console.log(`📦 UserProducts verificados: ${stats.totalUserProducts}`)
    console.log(`⚠️  Inconsistências encontradas: ${stats.inconsistencies}`)

    if (!DRY_RUN) {
      console.log(`✅ Tags adicionadas à BD: ${stats.tagsAdded}`)
    } else {
      console.log(`🔒 DRY RUN: 0 tags alteradas (${stats.inconsistencies} inconsistências identificadas)`)
    }

    console.log(`❌ Erros: ${stats.errors}`)
    console.log('════════════════════════════════════════════════════════════════\n')

    // Guardar logs
    await logger.save()
    await logger.saveReadable()

    const logStats = logger.getStats()
    console.log('📄 Logs guardados:')
    console.log(`   Total de entradas: ${logStats.total}`)
    console.log(`   Erros: ${logStats.errors}`)

  } catch (error: any) {
    logger.critical('Sync', 'Fatal error', error)
    console.error('\n❌ Erro fatal:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 Conexão BD fechada')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTAR
// ════════════════════════════════════════════════════════════════════════════

syncACTagsToBD()
  .then(() => {
    console.log('\n✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error)
    process.exit(1)
  })
