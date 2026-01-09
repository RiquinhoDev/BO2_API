// ════════════════════════════════════════════════════════════
// 📁 scripts/test-rui-pipeline-step5.ts
// Testar STEP 5 do executeDailyPipeline apenas para o Rui
// - Usa a MESMA lógica do pipeline (processamento sequencial)
// - Força tags na BD para testar remoção/aplicação
// - Valida com snapshot AC antes/depois
// - Só toca em tags BO (padrão: CODIGO - Descrição)
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User, UserProduct, Product } from '../src/models'
import tagOrchestratorV2 from '../src/services/activeCampaign/tagOrchestrator.service'

const RUI_EMAIL = process.env.RUI_EMAIL || 'joaomcf37@gmail.com'

// ─────────────────────────────────────────────────────────────
// ActiveCampaign mini-client para snapshots
// ─────────────────────────────────────────────────────────────

type ACContact = { id: string; email?: string }
type ACContactsResponse = { contacts?: ACContact[] }
type ACContactTagRow = { id: string; tag: string; cdate?: string }
type ACContactTagsResponse = { contactTags?: ACContactTagRow[] }
type ACTag = { id: string; tag: string }
type ACTagResponse = { tag?: ACTag }

type SnapshotTag = {
  name: string
  nameUpper: string
  tagId: string
  contactTagId: string
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeName(s: string) {
  return String(s || '').trim().replace(/\s+/g, ' ')
}

function upper(s: string) {
  return normalizeName(s).toUpperCase()
}

function getAcConfig() {
  const base = (
    process.env.AC_BASE_URL ||
    process.env.ACTIVE_CAMPAIGN_URL ||
    process.env.ACTIVE_CAMPAIGN_API_URL ||
    process.env.ACTIVE_CAMPAIGN_ACCOUNT_URL ||
    "https://serriquinho71518.api-us1.com"
  )?.replace(/\/$/, '')

  const token = (
    process.env.AC_API_KEY ||
    process.env.ACTIVE_CAMPAIGN_API_KEY ||
    process.env.ACTIVE_CAMPAIGN_KEY ||
    "001fca1fbd99ae7cddc45db8a0fafa83875697938e53eb9a95be40c083f1a6892098b6a7"
  )

  if (!base || !token) {
    throw new Error('Config AC em falta. Define AC_BASE_URL e AC_API_KEY.')
  }

  const cleanedBase = base.replace(/\/+$/, '').replace(/\/api\/3$/i, '')
  return { baseUrl: cleanedBase, apiToken: token }
}

async function acRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: any,
  maxRetries = 4
): Promise<{ status: number; data: T }> {
  const { baseUrl, apiToken } = getAcConfig()
  const url = `${baseUrl}/api/3${path.startsWith('/') ? '' : '/'}${path}`

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        'Api-Token': apiToken,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })

    const text = await res.text()
    const isJson = text?.startsWith('{') || text?.startsWith('[')
    const data = (isJson ? JSON.parse(text) : text) as T

    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      if (attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after') || '0')
        const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1)
        await sleep(backoffMs)
        continue
      }
    }

    return { status: res.status, data }
  }

  return { status: 0, data: {} as T }
}

async function findContactIdByEmail(email: string): Promise<string> {
  const emailEncoded = encodeURIComponent(email)

  const a = await acRequest<ACContactsResponse>('GET', `/contacts?email=${emailEncoded}`)
  const contactsA = a.data?.contacts || []
  if (contactsA.length > 0) return String(contactsA[0].id)

  const b = await acRequest<ACContactsResponse>('GET', `/contacts?filters[email]=${emailEncoded}`)
  const contactsB = b.data?.contacts || []
  if (contactsB.length > 0) return String(contactsB[0].id)

  throw new Error(`ContactId não encontrado na AC para email: ${email}`)
}

async function getContactTagsRows(contactId: string): Promise<ACContactTagRow[]> {
  const res = await acRequest<ACContactTagsResponse>('GET', `/contacts/${contactId}/contactTags`)
  return res.data?.contactTags || []
}

async function getTagNameById(tagId: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(tagId)
  if (cached) return cached

  const res = await acRequest<ACTagResponse>('GET', `/tags/${tagId}`)
  const name = res.data?.tag?.tag ? String(res.data.tag.tag) : `[TAG_ID_${tagId}]`
  cache.set(tagId, name)
  return name
}

async function getContactTagsSnapshot(contactId: string): Promise<SnapshotTag[]> {
  const rows = await getContactTagsRows(contactId)
  const cache = new Map<string, string>()

  const out: SnapshotTag[] = []
  for (const row of rows) {
    const tagId = String(row.tag)
    const contactTagId = String(row.id)
    const name = await getTagNameById(tagId, cache)
    out.push({
      name,
      nameUpper: upper(name),
      tagId,
      contactTagId
    })
  }
  return out
}

function isBOTag(tagName: string): boolean {
  return /^[A-Z_0-9]+ - .+$/.test(tagName)
}

// ─────────────────────────────────────────────────────────────
// MAIN TEST
// ─────────────────────────────────────────────────────────────

async function testRuiPipelineStep5() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: STEP 5 do executeDailyPipeline (só Rui)')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. CONECTAR BD
    // ═══════════════════════════════════════════════════════════
    console.log('[SETUP] Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('[SETUP] ✅ Conectado à BD\n')

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR RUI
    // ═══════════════════════════════════════════════════════════
    console.log(`[BD] Buscando Rui (${RUI_EMAIL})...`)
    const user = await User.findOne({ email: RUI_EMAIL }).lean<any>()
    if (!user) throw new Error(`User ${RUI_EMAIL} não encontrado`)

    console.log('[BD] ✅ Rui encontrado')
    console.log(`   🆔 userId: ${user._id}`)
    console.log(`   📧 email: ${user.email}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR USERPRODUCTS ATIVOS DO RUI
    // ═══════════════════════════════════════════════════════════
    console.log('[BD] Buscando UserProducts ACTIVE do Rui...')
    const userProducts = await UserProduct.find({
      userId: user._id,
      status: 'ACTIVE'
    })
      .populate('productId')
      .lean<any[]>()

    console.log(`[BD] ✅ ${userProducts.length} UserProducts ACTIVE encontrados`)
    userProducts.forEach((up, idx) => {
      console.log(`   ${idx + 1}. ${up.productId?.code}`)
    })
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 4. FORÇAR TAGS NA BD (para testar aplicação/remoção)
    // ═══════════════════════════════════════════════════════════
    console.log('[BD] 🔧 Forçando tags antigas na BD para simular estado antigo...')

    for (const up of userProducts) {
      const productCode = up.productId?.code || ''

      // Forçar algumas tags obsoletas para testar remoção
      const oldTags = [
        `${productCode} - Inativo 7d`,
        `${productCode} - Inativo 14d`,
        `${productCode} - Teste OLD Tag`
      ]

      await UserProduct.updateOne(
        { _id: up._id },
        {
          $set: {
            'activeCampaignData.tags': oldTags,
            'activeCampaignData.lastSync': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 dias atrás
          }
        }
      )

      console.log(`   ${productCode}: ${oldTags.length} tags forçadas`)
    }
    console.log('[BD] ✅ Tags forçadas na BD\n')

    // ═══════════════════════════════════════════════════════════
    // 5. SNAPSHOT AC ANTES
    // ═══════════════════════════════════════════════════════════
    console.log('[AC] 📸 Snapshot ANTES...')
    const contactId = await findContactIdByEmail(user.email)
    console.log(`[AC] ContactId: ${contactId}`)

    const snapshotBefore = await getContactTagsSnapshot(contactId)
    const boTagsBefore = snapshotBefore.filter(t => isBOTag(t.name))

    console.log(`[AC] Total tags: ${snapshotBefore.length}`)
    console.log(`[AC] Tags BO: ${boTagsBefore.length}`)
    if (boTagsBefore.length > 0) {
      console.log('[AC] Tags BO existentes:')
      boTagsBefore.forEach(t => console.log(`   - ${t.name}`))
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 6. EXECUTAR STEP 5 DO PIPELINE (LÓGICA REAL!)
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔧 EXECUTANDO STEP 5 (Tag Rules) - LÓGICA REAL DO PIPELINE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    const items = userProducts.map(up => ({
      userId: user._id.toString(),
      productId: up.productId._id.toString()
    }))

    // ✅ CÓPIA EXATA DO CÓDIGO DO executeDailyPipeline (processamento sequencial)
    const orchestrationResults: any[] = []
    let lastLoggedPercent = 0
    const startTime = Date.now()

    for (const item of items) {
      console.log(`\n${'─'.repeat(60)}`)
      console.log(`📦 Processando: userId=${item.userId.slice(-6)} productId=${item.productId.slice(-6)}`)

      const result = await tagOrchestratorV2.orchestrateUserProduct(item.userId, item.productId)
        .catch((error) => ({
          userId: item.userId,
          productId: item.productId,
          productCode: '',
          tagsApplied: [],
          tagsRemoved: [],
          communicationsTriggered: 0,
          success: false,
          error: error.message
        }))

      orchestrationResults.push(result)

      console.log(`   Status: ${result.success ? '✅ SUCESSO' : '❌ ERRO'}`)
      console.log(`   Produto: ${result.productCode}`)
      console.log(`   Tags aplicadas: ${result.tagsApplied?.length || 0}`)
      console.log(`   Tags removidas: ${result.tagsRemoved?.length || 0}`)

      if (result.tagsApplied && result.tagsApplied.length > 0) {
        console.log('   ✅ APLICADAS:')
        result.tagsApplied.forEach((tag: string) => console.log(`      + ${tag}`))
      }

      if (result.tagsRemoved && result.tagsRemoved.length > 0) {
        console.log('   🗑️  REMOVIDAS:')
        result.tagsRemoved.forEach((tag: string) => console.log(`      - ${tag}`))
      }

      if (result.error) {
        console.log(`   ❌ ERRO: ${result.error}`)
      }

      // Log progresso
      const processed = orchestrationResults.length
      const percentage = Math.floor((processed / items.length) * 100)

      if (percentage >= lastLoggedPercent + 10 || processed === items.length) {
        const elapsed = (Date.now() - startTime) / 1000
        const avgTimePerItem = elapsed / processed
        const remaining = items.length - processed
        const etaMin = Math.floor((avgTimePerItem * remaining) / 60)
        console.log(`\n   → ${percentage}% (${processed}/${items.length}) | ETA: ~${etaMin}min`)
        lastLoggedPercent = percentage
      }
    }

    const duration = (Date.now() - startTime) / 1000

    const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)
    const tagsApplied = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsApplied?.length || 0),
      0
    )
    const tagsRemoved = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsRemoved?.length || 0),
      0
    )

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('📊 RESULTADO STEP 5')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`Total: ${stats.total}`)
    console.log(`Sucesso: ${stats.successful}`)
    console.log(`Falha: ${stats.failed}`)
    console.log(`Tags aplicadas: ${tagsApplied}`)
    console.log(`Tags removidas: ${tagsRemoved}`)
    console.log(`Duração: ${duration.toFixed(2)}s`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 7. AGUARDAR PROPAGAÇÃO
    // ═══════════════════════════════════════════════════════════
    console.log('⏱️  Aguardando 10s para propagação na AC...')
    await sleep(10000)

    // ═══════════════════════════════════════════════════════════
    // 8. SNAPSHOT AC DEPOIS
    // ═══════════════════════════════════════════════════════════
    console.log('\n[AC] 📸 Snapshot DEPOIS...')
    const snapshotAfter = await getContactTagsSnapshot(contactId)
    const boTagsAfter = snapshotAfter.filter(t => isBOTag(t.name))

    console.log(`[AC] Total tags: ${snapshotAfter.length}`)
    console.log(`[AC] Tags BO: ${boTagsAfter.length}`)
    if (boTagsAfter.length > 0) {
      console.log('[AC] Tags BO existentes:')
      boTagsAfter.forEach(t => console.log(`   - ${t.name}`))
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 9. COMPARAÇÃO ANTES vs DEPOIS
    // ═══════════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════════')
    console.log('🔍 COMPARAÇÃO ANTES vs DEPOIS (só tags BO)')
    console.log('════════════════════════════════════════════════════════════')

    const beforeSet = new Set(boTagsBefore.map(t => t.nameUpper))
    const afterSet = new Set(boTagsAfter.map(t => t.nameUpper))

    const addedReal = [...afterSet].filter(x => !beforeSet.has(x))
    const removedReal = [...beforeSet].filter(x => !afterSet.has(x))

    console.log(`\n[REAL AC] Tags adicionadas: ${addedReal.length}`)
    if (addedReal.length > 0) {
      addedReal.forEach(tag => console.log(`   + ${tag}`))
    }

    console.log(`\n[REAL AC] Tags removidas: ${removedReal.length}`)
    if (removedReal.length > 0) {
      removedReal.forEach(tag => console.log(`   - ${tag}`))
    }

    // ═══════════════════════════════════════════════════════════
    // 10. VALIDAÇÃO (claim vs realidade)
    // ═══════════════════════════════════════════════════════════
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('✅ VALIDAÇÃO (Orchestrator claim vs AC reality)')
    console.log('════════════════════════════════════════════════════════════')

    const totalClaimRemoved = orchestrationResults.reduce(
      (sum, r) => sum + (r.tagsRemoved?.length || 0),
      0
    )

    const removedClaimSet = new Set(
      orchestrationResults
        .flatMap((r: any) => r.tagsRemoved || [])
        .map((t: string) => upper(t))
    )

    const stillInAC = snapshotAfter.filter(t =>
      isBOTag(t.name) && removedClaimSet.has(t.nameUpper)
    )

    if (stillInAC.length > 0) {
      console.log('⚠️  MISMATCH DETECTADO!')
      console.log(`   Orchestrator diz que removeu ${totalClaimRemoved} tags`)
      console.log(`   MAS ${stillInAC.length} tags ainda existem na AC:`)
      stillInAC.forEach(t => {
        console.log(`      - ${t.name}  (contactTagId: ${t.contactTagId}, tagId: ${t.tagId})`)
      })
    } else if (totalClaimRemoved > 0) {
      console.log(`✅ PERFEITO! Orchestrator removeu ${totalClaimRemoved} tags e NENHUMA aparece na AC`)
    } else {
      console.log('ℹ️  Nenhuma tag foi removida neste teste')
    }

    console.log('\n════════════════════════════════════════════════════════════')
    console.log('✅ TESTE COMPLETO')
    console.log('════════════════════════════════════════════════════════════')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n[SETUP] Desconectado da BD')
  }
}

// ════════════════════════════════════════════════════════════
// EXECUTAR
// ════════════════════════════════════════════════════════════

testRuiPipelineStep5()
