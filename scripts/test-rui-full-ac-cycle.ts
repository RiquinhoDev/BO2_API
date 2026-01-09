// ════════════════════════════════════════════════════════════
// 📁 scripts/test-rui-full-ac-cycle.ts
// Teste COMPLETO do ciclo de tags no AC para o Rui:
// 1. Limpa todas tags BO do AC
// 2. Adiciona tags "antigas" no AC
// 3. Força tags antigas na BD
// 4. Executa STEP 5 do pipeline (lógica real)
// 5. Valida que removeu antigas e aplicou novas NO AC
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User, UserProduct, Product } from '../src/models'
import tagOrchestratorV2 from '../src/services/activeCampaign/tagOrchestrator.service'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = process.env.RUI_EMAIL || 'ruifilipespteixeira@gmail.com'

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
    "***REMOVED-SECRET***"
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

async function deleteContactTag(contactTagId: string): Promise<boolean> {
  const res = await acRequest<any>('DELETE', `/contactTags/${contactTagId}`)
  return res.status === 200 || res.status === 204
}

// ─────────────────────────────────────────────────────────────
// MAIN TEST
// ─────────────────────────────────────────────────────────────

async function testRuiFullACCycle() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE COMPLETO: Ciclo de Tags AC para o Rui')
  console.log('   1. Limpar tags BO existentes no AC')
  console.log('   2. Adicionar tags "antigas" no AC')
  console.log('   3. Executar STEP 5 do pipeline')
  console.log('   4. Validar que removeu antigas e aplicou novas')
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
    // 4. GET CONTACTID
    // ═══════════════════════════════════════════════════════════
    console.log('[AC] Buscando ContactId do Rui...')
    const contactId = await findContactIdByEmail(user.email)
    console.log(`[AC] ✅ ContactId: ${contactId}\n`)

    // ═══════════════════════════════════════════════════════════
    // 5. LIMPAR TODAS TAGS BO EXISTENTES NO AC
    // ═══════════════════════════════════════════════════════════
    console.log('[AC] 🧹 PASSO 1: Limpando tags BO existentes...')
    const snapshotInitial = await getContactTagsSnapshot(contactId)
    const boTagsInitial = snapshotInitial.filter(t => isBOTag(t.name))

    console.log(`[AC] Tags BO encontradas: ${boTagsInitial.length}`)

    if (boTagsInitial.length > 0) {
      console.log('[AC] Removendo tags BO:')
      for (const tag of boTagsInitial) {
        const success = await deleteContactTag(tag.contactTagId)
        console.log(`   ${success ? '✅' : '❌'} ${tag.name}`)
        await sleep(300) // Rate limiting
      }
    } else {
      console.log('[AC] Nenhuma tag BO para remover')
    }
    console.log('')

    await sleep(2000) // Aguardar propagação

    // Confirmar limpeza
    const snapshotAfterClean = await getContactTagsSnapshot(contactId)
    const boTagsAfterClean = snapshotAfterClean.filter(t => isBOTag(t.name))
    console.log(`[AC] ✅ Limpeza concluída. Tags BO restantes: ${boTagsAfterClean.length}`)
    if (boTagsAfterClean.length > 0) {
      console.log('[AC] ⚠️  Tags BO que não foram removidas:')
      boTagsAfterClean.forEach(t => console.log(`   - ${t.name}`))
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 6. ADICIONAR TAGS "ANTIGAS" NO AC
    // ═══════════════════════════════════════════════════════════
    console.log('[AC] 🔧 PASSO 2: Adicionando tags "antigas" no AC...')

    const oldTags = [
      'OGI_V1 - Inativo 14d',
      'OGI_V1 - Progresso Baixo'
    ]

    for (const tagName of oldTags) {
      try {
        await activeCampaignService.addTag(user.email, tagName)
        console.log(`   ✅ ${tagName}`)
        await sleep(500) // Rate limiting
      } catch (error: any) {
        console.log(`   ❌ ${tagName}: ${error.message}`)
      }
    }
    console.log('')

    await sleep(2000) // Aguardar propagação

    // Confirmar adição
    const snapshotAfterAdd = await getContactTagsSnapshot(contactId)
    const boTagsAfterAdd = snapshotAfterAdd.filter(t => isBOTag(t.name))
    console.log(`[AC] ✅ Tags antigas adicionadas. Tags BO no AC: ${boTagsAfterAdd.length}`)
    boTagsAfterAdd.forEach(t => console.log(`   - ${t.name}`))
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 7. FORÇAR TAGS ANTIGAS NA BD
    // ═══════════════════════════════════════════════════════════
    console.log('[BD] 🔧 PASSO 3: Forçando tags antigas na BD...')

    for (const up of userProducts) {
      await UserProduct.updateOne(
        { _id: up._id },
        {
          $set: {
            'activeCampaignData.tags': oldTags,
            'activeCampaignData.lastSync': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      )
    }
    console.log(`[BD] ✅ ${oldTags.length} tags forçadas na BD\n`)

    // ═══════════════════════════════════════════════════════════
    // 8. EXECUTAR STEP 5 DO PIPELINE (LÓGICA REAL!)
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔧 PASSO 4: EXECUTANDO STEP 5 (Tag Rules) - LÓGICA REAL')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    const items = userProducts.map(up => ({
      userId: user._id.toString(),
      productId: up.productId._id.toString()
    }))

    const orchestrationResults: any[] = []
    const startTime = Date.now()

    for (const item of items) {
      console.log(`\n${'─'.repeat(60)}`)
      console.log(`📦 Processando UserProduct`)

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
    }

    const duration = (Date.now() - startTime) / 1000

    const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)
    const tagsAppliedCount = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsApplied?.length || 0),
      0
    )
    const tagsRemovedCount = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsRemoved?.length || 0),
      0
    )

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('📊 RESULTADO STEP 5')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`Total: ${stats.total}`)
    console.log(`Sucesso: ${stats.successful}`)
    console.log(`Falha: ${stats.failed}`)
    console.log(`Tags aplicadas (claim): ${tagsAppliedCount}`)
    console.log(`Tags removidas (claim): ${tagsRemovedCount}`)
    console.log(`Duração: ${duration.toFixed(2)}s`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 9. AGUARDAR PROPAGAÇÃO
    // ═══════════════════════════════════════════════════════════
    console.log('⏱️  Aguardando 10s para propagação na AC...')
    await sleep(10000)

    // ═══════════════════════════════════════════════════════════
    // 10. SNAPSHOT FINAL AC
    // ═══════════════════════════════════════════════════════════
    console.log('\n[AC] 📸 PASSO 5: Snapshot FINAL...')
    const snapshotFinal = await getContactTagsSnapshot(contactId)
    const boTagsFinal = snapshotFinal.filter(t => isBOTag(t.name))

    console.log(`[AC] Total tags: ${snapshotFinal.length}`)
    console.log(`[AC] Tags BO: ${boTagsFinal.length}`)
    if (boTagsFinal.length > 0) {
      console.log('[AC] Tags BO no AC (final):')
      boTagsFinal.forEach(t => console.log(`   - ${t.name}`))
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 11. COMPARAÇÃO: ANTES (após add antigas) vs FINAL
    // ═══════════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════════')
    console.log('🔍 COMPARAÇÃO: ANTES (após add antigas) vs FINAL')
    console.log('════════════════════════════════════════════════════════════')

    const beforeSet = new Set(boTagsAfterAdd.map(t => t.nameUpper))
    const finalSet = new Set(boTagsFinal.map(t => t.nameUpper))

    const addedReal = [...finalSet].filter(x => !beforeSet.has(x))
    const removedReal = [...beforeSet].filter(x => !finalSet.has(x))

    console.log(`\n[REAL AC] Tags adicionadas: ${addedReal.length}`)
    if (addedReal.length > 0) {
      addedReal.forEach(tag => console.log(`   + ${tag}`))
    }

    console.log(`\n[REAL AC] Tags removidas: ${removedReal.length}`)
    if (removedReal.length > 0) {
      removedReal.forEach(tag => console.log(`   - ${tag}`))
    }

    // ═══════════════════════════════════════════════════════════
    // 12. VALIDAÇÃO FINAL
    // ═══════════════════════════════════════════════════════════
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('✅ VALIDAÇÃO FINAL')
    console.log('════════════════════════════════════════════════════════════')

    console.log(`\n📊 EXPECTATIVA:`)
    console.log(`   - Tags antigas (${oldTags.length}) devem ser REMOVIDAS`)
    console.log(`   - Tags novas (Ativo, Reativado) devem ser APLICADAS`)

    console.log(`\n📊 REALIDADE (Orchestrator claim):`)
    console.log(`   - Tags aplicadas: ${tagsAppliedCount}`)
    console.log(`   - Tags removidas: ${tagsRemovedCount}`)

    console.log(`\n📊 REALIDADE (AC real):`)
    console.log(`   - Tags adicionadas: ${addedReal.length}`)
    console.log(`   - Tags removidas: ${removedReal.length}`)

    // Verificar mismatches
    const removedClaimSet = new Set(
      orchestrationResults
        .flatMap((r: any) => r.tagsRemoved || [])
        .map((t: string) => upper(t))
    )

    const stillInAC = boTagsFinal.filter(t => removedClaimSet.has(t.nameUpper))

    if (stillInAC.length > 0) {
      console.log('\n⚠️  MISMATCH: Tags que o orchestrator diz ter removido, MAS ainda estão no AC:')
      stillInAC.forEach(t => {
        console.log(`   - ${t.name}  (contactTagId: ${t.contactTagId})`)
      })
    } else if (tagsRemovedCount > 0) {
      console.log(`\n✅ PERFEITO! ${tagsRemovedCount} tags removidas pelo orchestrator e CONFIRMADAS no AC`)
    }

    if (addedReal.length > 0) {
      console.log(`\n✅ SUCESSO! ${addedReal.length} tags novas aplicadas no AC`)
    }

    const testPassed = (
      removedReal.length === oldTags.length &&
      addedReal.length > 0 &&
      stillInAC.length === 0
    )

    console.log('\n════════════════════════════════════════════════════════════')
    if (testPassed) {
      console.log('✅✅✅ TESTE 100% SUCESSO! ✅✅✅')
      console.log('   - Tags antigas removidas do AC ✅')
      console.log('   - Tags novas aplicadas no AC ✅')
      console.log('   - Sem mismatches ✅')
    } else {
      console.log('⚠️  TESTE PARCIAL ou FALHOU')
      if (removedReal.length !== oldTags.length) {
        console.log(`   - Esperava remover ${oldTags.length}, removeu ${removedReal.length}`)
      }
      if (addedReal.length === 0) {
        console.log('   - Não aplicou tags novas')
      }
      if (stillInAC.length > 0) {
        console.log(`   - ${stillInAC.length} tags não foram removidas`)
      }
    }
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

testRuiFullACCycle()
