// ════════════════════════════════════════════════════════════
// 📁 scripts/debug-rui-tags-complete.ts
// DEBUG COMPLETO: Fluxo BD → AC para o Rui (com logs detalhados)
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/product/Product'
import TagRule from '../src/models/acTags/TagRule'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import decisionEngineService from '../src/services/activeCampaign/decisionEngine.service'
import DebugLogger from '../src/utils/debugLogger'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function debugRuiTagsComplete() {
  const logger = new DebugLogger('debug-rui-tags')

  console.log('════════════════════════════════════════════════════════════')
  console.log('🔍 DEBUG COMPLETO: Fluxo BD → AC (Rui)')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. CONECTAR BD
    // ═══════════════════════════════════════════════════════════

    logger.log('SETUP', 'Conectando à BD')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    logger.log('SETUP', 'Conectado à BD com sucesso')

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR RUI NA BD
    // ═══════════════════════════════════════════════════════════

    logger.log('BD', 'Buscando Rui na BD', { email: RUI_EMAIL })
    const user = await User.findOne({ email: RUI_EMAIL })
      .select('email name hotmart curseduca metadata')
      .lean()

    if (!user) {
      throw new Error(`User ${RUI_EMAIL} não encontrado`)
    }

    logger.log('BD', 'Rui encontrado', {
      _id: user._id,
      email: user.email,
      name: user.name,
      hotmart: user.hotmart ? 'presente' : 'ausente',
      curseduca: user.curseduca ? 'presente' : 'ausente'
    })

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR USERPRODUCTS DO RUI
    // ═══════════════════════════════════════════════════════════

    logger.log('BD', 'Buscando UserProducts do Rui')
    const userProducts = await UserProduct.find({ userId: user._id, status: 'ACTIVE' })
      .populate('productId')
      .lean<any[]>()

    logger.log('BD', `${userProducts.length} UserProducts ACTIVE encontrados`, {
      userProducts: userProducts.map(up => ({
        _id: up._id,
        productCode: up.productId?.code,
        status: up.status
      }))
    })

    // ═══════════════════════════════════════════════════════════
    // 4. BUSCAR CONTACTID DO RUI NA AC
    // ═══════════════════════════════════════════════════════════

    logger.logEndpoint('AC', 'GET', '/api/3/contacts', { email: RUI_EMAIL })

    const contactId = await activeCampaignService.getContactId(user.email, user._id.toString())

    if (!contactId) {
      throw new Error(`Rui não tem contacto na AC (email: ${user.email})`)
    }

    logger.log('AC', 'ContactId do Rui encontrado', { contactId })

    // ═══════════════════════════════════════════════════════════
    // 5. PARA CADA PRODUTO DO RUI
    // ═══════════════════════════════════════════════════════════

    for (const userProduct of userProducts) {
      const product = userProduct.productId
      const productCode = product.code

      console.log(`\n${'═'.repeat(60)}`)
      console.log(`📦 PRODUTO: ${productCode}`)
      console.log('═'.repeat(60))

      logger.log('PRODUTO', `Processando produto ${productCode}`)

      // ───────────────────────────────────────────────────────
      // 5.1. BUSCAR TAGRULES DESTE PRODUTO NA BD
      // ───────────────────────────────────────────────────────

      logger.log('BD', `Buscando TagRules para ${productCode}`)
      const tagRules = await TagRule.find({
        productId: product._id,
        isActive: true
      }).lean()

      logger.log('BD', `${tagRules.length} TagRules ativas encontradas`, {
        tagRules: tagRules.map(tr => ({
          _id: tr._id,
          name: (tr as any).name,
          condition: (tr as any).condition,
          action: (tr as any).action,
          tagName: (tr as any).actions?.addTag || (tr as any).tagName
        }))
      })

      // ───────────────────────────────────────────────────────
      // 5.2. DECISION ENGINE: Avaliar tags esperadas
      // ───────────────────────────────────────────────────────

      logger.log('DECISION_ENGINE', `Avaliando regras para ${productCode}`)

      const decisions = await decisionEngineService.evaluateUserProduct(
        user._id.toString(),
        product._id.toString()
      )

      logger.log('DECISION_ENGINE', 'Decisões tomadas', {
        tagsToApply: decisions.tagsToApply,
        tagsToRemove: decisions.tagsToRemove,
        decisions: decisions.decisions.map(d => ({
          ruleName: d.ruleName,
          action: d.action,
          tagName: d.tagName,
          shouldExecute: d.shouldExecute,
          reason: d.reason
        }))
      })

      // ───────────────────────────────────────────────────────
      // 5.3. BUSCAR TAGS ATUAIS DO RUI NA AC
      // ───────────────────────────────────────────────────────

      logger.logEndpoint('AC', 'GET', `/api/3/contacts/${contactId}/contactTags`)

      const allTagsInAC = await activeCampaignService.getContactTagsByEmail(user.email)

      logger.logResponse('AC', `/api/3/contacts/${contactId}/contactTags`, {
        totalTags: allTagsInAC.length,
        tags: allTagsInAC
      })

      // Filtrar apenas tags deste produto
      const productPrefixes = getProductTagPrefixes(productCode)
      const productTagsInAC = allTagsInAC.filter((tag: string) =>
        productPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix))
      )

      logger.log('AC', `Tags deste produto (${productCode}) na AC`, {
        prefixes: productPrefixes,
        totalTagsInAC: allTagsInAC.length,
        productTagsInAC: productTagsInAC
      })

      // ───────────────────────────────────────────────────────
      // 5.4. COMPARAR: Tags esperadas vs Tags na AC
      // ───────────────────────────────────────────────────────

      const expectedTags = decisions.tagsToApply.map(t => normalizeTagForProduct(t, productCode))
      const currentTags = productTagsInAC

      const tagsToAdd = expectedTags.filter(t => !currentTags.includes(t))
      const tagsToRemove = currentTags.filter(t => isBOTag(t) && !expectedTags.includes(t))

      logger.log('COMPARISON', 'Comparação BD vs AC', {
        expectedTags,
        currentTags,
        tagsToAdd,
        tagsToRemove,
        match: tagsToAdd.length === 0 && tagsToRemove.length === 0
      })

      // ───────────────────────────────────────────────────────
      // 5.5. RESULTADO PARA ESTE PRODUTO
      // ───────────────────────────────────────────────────────

      console.log(`\n📊 RESULTADO PARA ${productCode}:`)
      console.log(`   Tags esperadas (BD): [${expectedTags.join(', ')}]`)
      console.log(`   Tags atuais (AC):    [${currentTags.join(', ')}]`)
      console.log(`   🆕 A adicionar:      [${tagsToAdd.join(', ') || '—'}]`)
      console.log(`   🗑️  A remover:        [${tagsToRemove.join(', ') || '—'}]`)

      if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
        console.log(`   ✅ Tags CORRETAS (nada a fazer)`)
      } else {
        console.log(`   ⚠️  Tags DESATUALIZADAS (precisa sync)`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. BUSCAR TODAS AS TAGS DO RUI (COMPLETO)
    // ═══════════════════════════════════════════════════════════

    console.log(`\n${'═'.repeat(60)}`)
    console.log('📋 TODAS AS TAGS DO RUI NA AC')
    console.log('═'.repeat(60))

    logger.logEndpoint('AC', 'GET', `/api/3/contacts/${contactId}/contactTags`)
    const allTags = await activeCampaignService.getContactTagsByEmail(user.email)

    logger.log('AC', 'Todas as tags do Rui', { totalTags: allTags.length, tags: allTags })

    console.log(`\nTotal de tags: ${allTags.length}`)
    allTags.forEach((tag: string, idx: number) => {
      const isBO = isBOTag(tag)
      console.log(`   ${idx + 1}. ${tag} ${isBO ? '(BO)' : '(Nativa AC)'}`)
    })

    console.log('\n✅ DEBUG COMPLETO')

  } catch (error: any) {
    logger.logError('ERROR', 'Erro fatal', error)
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    logger.log('SETUP', 'Desconectado da BD')

    const logFile = logger.finalize()
    console.log(`\n📁 Log detalhado guardado em: ${logFile}`)
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function getProductTagPrefixes(productCode: string): string[] {
  const code = productCode.toUpperCase()

  if (code.includes('OGI')) return ['OGI_V1', 'OGI']
  if (code.includes('CLAREZA')) return ['CLAREZA', 'CLZ']
  if (code.includes('ECOMMERCE')) return ['ECOMMERCE', 'ECC']

  return [code]
}

function normalizeTagForProduct(tag: string, productCode: string): string {
  const code = productCode.toUpperCase()

  // Se já tem prefixo, retornar como está
  if (tag.includes(code) || tag.includes('OGI') || tag.includes('CLAREZA') || tag.includes('ECOMMERCE')) {
    return tag
  }

  // Adicionar prefixo
  return `${code} - ${tag}`
}

function isBOTag(tag: string): boolean {
  const boKeywords = ['OGI', 'CLAREZA', 'CLZ', 'ECOMMERCE', 'ECC', 'INATIVO', 'ATIVO', 'PROGRESSO', 'ENGAJADO']
  return boKeywords.some(keyword => tag.toUpperCase().includes(keyword))
}

// ════════════════════════════════════════════════════════════
// EXECUTAR
// ════════════════════════════════════════════════════════════

debugRuiTagsComplete()
