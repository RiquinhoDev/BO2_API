// ════════════════════════════════════════════════════════════
// 📁 scripts/test-rui-full-orchestrator.ts
// Testar TagOrchestrator completo apenas para o Rui
// - Inclui verificação REAL na ActiveCampaign (contactTagId vs tagId)
// - Opcional: AC_FORCE_DELETE=true → força DELETE /contactTags/{contactTagId}
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import UserProduct from '../src/models/UserProduct'
import tagOrchestrator, { tagOrchestratorV2 } from '../src/services/activeCampaign/tagOrchestrator.service'

console.log('same instance?', tagOrchestrator === tagOrchestratorV2) // tem de dar true

import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = process.env.RUI_EMAIL || 'ruifilipespteixeira@gmail.com'

// Flags (env)
const AC_WAIT_SECONDS = Number(process.env.AC_WAIT_SECONDS || '10')
const AC_FORCE_DELETE = String(process.env.AC_FORCE_DELETE || 'false').toLowerCase() === 'true'
const AC_HTTP_DEBUG = String(process.env.AC_HTTP_DEBUG || 'false').toLowerCase() === 'true'

// ─────────────────────────────────────────────────────────────
// ActiveCampaign: mini-client só para DEBUG com IDs reais
// (evita depender do activeCampaignService para descobrir contactTagId)
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


const base =
  (process.env.AC_BASE_URL ||
    process.env.ACTIVE_CAMPAIGN_URL ||
    process.env.ACTIVE_CAMPAIGN_API_URL ||
    process.env.ACTIVE_CAMPAIGN_ACCOUNT_URL ||"https://serriquinho71518.api-us1.com"
    )?.replace(/\/$/, '')




const token =
  process.env.AC_API_KEY ||
  process.env.ACTIVE_CAMPAIGN_API_KEY ||
  process.env.ACTIVE_CAMPAIGN_KEY ||"001fca1fbd99ae7cddc45db8a0fafa83875697938e53eb9a95be40c083f1a6892098b6a7"
  ''

  if (!base || !token) {
    // Nota: mesmo que isto falhe, o orchestrator pode continuar a funcionar via activeCampaignService.
    // Mas este script precisa disto para snapshot detalhado com IDs.
    throw new Error(
      'Config AC em falta para snapshot detalhado. Define AC_BASE_URL/AC_API_URL e AC_API_KEY (ou equivalentes).'
    )
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
    const data = (isJson ? JSON.parse(text) : (text as any)) as T

    if (AC_HTTP_DEBUG) {
      console.log(`[AC HTTP] ${method} ${url} -> ${res.status}`)
      if (method !== 'GET' && body) console.log(`[AC HTTP] body: ${JSON.stringify(body)}`)
      if (res.status >= 400) console.log('[AC HTTP] error payload:', data)
    }

    // Retry em rate limit / instabilidade
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

  // nunca chega aqui
  return { status: 0, data: {} as T }
}

async function findContactIdByEmail(email: string): Promise<string> {
  // AC aceita ?email=... em muitos accounts; se falhar, tenta filters[email]
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

function buildPrefixes(productCode: string): string[] {
  const pc = upper(productCode)
  const base = pc.includes('_') ? pc.split('_')[0] : pc
  const set = new Set<string>([pc, base].filter(Boolean))
  return Array.from(set)
}

function filterSnapshotByPrefixes(snapshot: SnapshotTag[], prefixes: string[]) {
  const p = prefixes.map(upper)
  return snapshot.filter(t => p.some(pref => t.nameUpper.startsWith(pref)))
}

async function forceDeleteContactTag(contactTagId: string) {
  const res = await acRequest<any>('DELETE', `/contactTags/${contactTagId}`)
  return res.status
}

// ─────────────────────────────────────────────────────────────

async function testRuiFullOrchestrator() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE COMPLETO: TagOrchestrator para o Rui (com verificação real na AC)')
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
    // 3. BUSCAR USERPRODUCTS DO RUI
    // ═══════════════════════════════════════════════════════════

    console.log('[BD] Buscando UserProducts do Rui...')
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
    // 4. SNAPSHOT AC ANTES (com IDs reais)
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando ContactId do Rui e snapshot ANTES...')
    const contactId = await findContactIdByEmail(user.email)
    console.log(`[AC] ✅ ContactId: ${contactId}`)

    const snapshotBefore = await getContactTagsSnapshot(contactId)
    console.log(`[AC] Total associações (contactTags): ${snapshotBefore.length}`)

    const ogiBefore = snapshotBefore.filter(t => t.nameUpper.startsWith('OGI'))
    const clarezaBefore = snapshotBefore.filter(t => t.nameUpper.startsWith('CLAREZA'))
    console.log(`   OGI*: ${ogiBefore.length} | CLAREZA*: ${clarezaBefore.length}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 5. PROCESSAR CADA USERPRODUCT COM TAGORCHESTRATOR
    // + snapshot imediato depois de cada produto
    // ═══════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔧 PROCESSANDO COM TAGORCHESTRATOR')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    const results: Array<{
      productCode: string
      success: boolean
      duration: number
      applied: string[]
      removedClaim: string[]
      removedStillInAC: SnapshotTag[]
      forceDeleted: Array<{ contactTagId: string; status: number; name: string }>
      error?: string
    }> = []

    for (const userProduct of userProducts) {
      const product = userProduct.productId
      const productCode = String(product.code || '')

      console.log(`\n${'─'.repeat(60)}`)
      console.log(`📦 PROCESSANDO: ${productCode}`)
      console.log('─'.repeat(60))

      const startTime = Date.now()

      // Chamar TagOrchestrator (IGUAL à pipeline!)
      const result = await tagOrchestrator.orchestrateUserProduct(
        user._id.toString(),
        product._id.toString()
      )

      const duration = Date.now() - startTime

      console.log(`\n📊 RESULTADO ${productCode}:`)
      console.log(`   Status: ${result.success ? '✅ SUCESSO' : '❌ ERRO'}`)
      console.log(`   Tags aplicadas (claim): ${result.tagsApplied.length}`)
      console.log(`   Tags removidas (claim): ${result.tagsRemoved.length}`)
      console.log(`   Duração: ${(duration / 1000).toFixed(2)}s`)

      if (result.tagsApplied.length > 0) {
        console.log(`\n   ✅ APLICADAS (claim):`)
        result.tagsApplied.forEach((tag: string) => console.log(`      + ${tag}`))
      }

      if (result.tagsRemoved.length > 0) {
        console.log(`\n   🗑️  REMOVIDAS (claim):`)
        result.tagsRemoved.forEach((tag: string) => console.log(`      - ${tag}`))
      }

      if (result.error) {
        console.log(`\n   ❌ ERRO: ${result.error}`)
      }

      // ─────────────────────────────────────────────────────────
      // Snapshot imediato e validação REAL na AC
      // ─────────────────────────────────────────────────────────
      const prefixes = buildPrefixes(productCode)
      const snapshotAfter = await getContactTagsSnapshot(contactId)
      const productTagsAfter = filterSnapshotByPrefixes(snapshotAfter, prefixes)

      console.log(`\n[AC] 🔎 Snapshot imediato (DEPOIS deste produto)...`)
      console.log(`[AC] Total tags (contactTags): ${snapshotAfter.length}`)
      console.log(`[AC] Tags deste produto (por prefix): ${productTagsAfter.length}`)

      const removedClaimSet = new Set(result.tagsRemoved.map((t: string) => upper(t)))
      const stillInAC = snapshotAfter.filter(t => removedClaimSet.has(t.nameUpper))

      if (stillInAC.length > 0) {
        console.log('[AC] ⚠️  Verificação: tags que o orchestrator diz ter removido, MAS ainda existem na AC:')
        for (const t of stillInAC) {
          console.log(`   - ${t.name}  contactTagIds=[${t.contactTagId}]  tagIds=[${t.tagId}]`)
        }
      } else if (result.tagsRemoved.length > 0) {
        console.log('[AC] ✅ Verificação: todas as tags removidas (claim) já NÃO aparecem na AC.')
      }

      const forceDeleted: Array<{ contactTagId: string; status: number; name: string }> = []

      if (AC_FORCE_DELETE && stillInAC.length > 0) {
        console.log(`\n[AC] 🧨 AC_FORCE_DELETE=true → a forçar DELETE por contactTagId...`)
        for (const t of stillInAC) {
          const status = await forceDeleteContactTag(t.contactTagId)
          forceDeleted.push({ contactTagId: t.contactTagId, status, name: t.name })
          console.log(`   DELETE /contactTags/${t.contactTagId} -> ${status} (${t.name})`)
          // pequeno delay para evitar rate limit
          await sleep(200)
        }

        const snapshotAfterForce = await getContactTagsSnapshot(contactId)
        const stillAfterForce = snapshotAfterForce.filter(t => removedClaimSet.has(t.nameUpper))

        if (stillAfterForce.length === 0) {
          console.log('[AC] ✅ Após FORCE DELETE: tags já não aparecem na AC.')
        } else {
          console.log('[AC] ❌ Após FORCE DELETE: ainda existem (suspeitar de contacto duplicado, permissões, ou IDs errados).')
          for (const t of stillAfterForce) {
            console.log(`   - ${t.name}  contactTagIds=[${t.contactTagId}]  tagIds=[${t.tagId}]`)
          }
        }
      }

      results.push({
        productCode,
        success: Boolean(result.success),
        duration,
        applied: result.tagsApplied || [],
        removedClaim: result.tagsRemoved || [],
        removedStillInAC: stillInAC,
        forceDeleted,
        error: result.error
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 6. AGUARDAR (cache/consistência eventual)
    // ═══════════════════════════════════════════════════════════

    console.log(`\n${'═'.repeat(60)}`)
    console.log(`⏱️  Aguardando ${AC_WAIT_SECONDS}s para a AC estabilizar...`)
    console.log('═'.repeat(60))
    await sleep(AC_WAIT_SECONDS * 1000)

    // ═══════════════════════════════════════════════════════════
    // 7. SNAPSHOT FINAL
    // ═══════════════════════════════════════════════════════════

    console.log('\n────────────────────────────────────────────────────────────')
    console.log('[AC] Snapshot FINAL (DEPOIS de tudo)...')
    console.log('────────────────────────────────────────────────────────────')

    const snapshotFinal = await getContactTagsSnapshot(contactId)
    const ogiFinal = snapshotFinal.filter(t => t.nameUpper.startsWith('OGI'))
    const clarezaFinal = snapshotFinal.filter(t => t.nameUpper.startsWith('CLAREZA'))

    console.log(`[AC] ✅ ContactId: ${contactId}`)
    console.log(`[AC] Total associações (contactTags): ${snapshotFinal.length}`)
    console.log(`[AC] OGI*: ${ogiFinal.length} | CLAREZA*: ${clarezaFinal.length}`)

    // ═══════════════════════════════════════════════════════════
    // 8. DIFF REAL (ANTES vs FINAL) por nome
    // ═══════════════════════════════════════════════════════════

    console.log('\n════════════════════════════════════════════════════════════')
    console.log('📊 COMPARAÇÃO ANTES vs DEPOIS (por nome)')
    console.log('════════════════════════════════════════════════════════════')

    const beforeSet = new Set(snapshotBefore.map(t => t.nameUpper))
    const finalSet = new Set(snapshotFinal.map(t => t.nameUpper))

    const addedReal = [...finalSet].filter(x => !beforeSet.has(x))
    const removedReal = [...beforeSet].filter(x => !finalSet.has(x))

    console.log(`[AC] Tags adicionadas (diff real): ${addedReal.length}`)
    if (addedReal.length) console.log('   +', addedReal.join(' | '))

    console.log(`\n[AC] Tags removidas (diff real): ${removedReal.length}`)
    if (removedReal.length) console.log('   -', removedReal.join(' | '))

    // ═══════════════════════════════════════════════════════════
    // 9. RESUMO FINAL (claim vs realidade)
    // ═══════════════════════════════════════════════════════════

    console.log('\n════════════════════════════════════════════════════════════')
    console.log('📌 RESUMO FINAL')
    console.log('════════════════════════════════════════════════════════════')

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
    const successCount = results.filter(r => r.success).length

    const totalClaimApplied = results.reduce((sum, r) => sum + r.applied.length, 0)
    const totalClaimRemoved = results.reduce((sum, r) => sum + r.removedClaim.length, 0)
    const totalStillInAC = results.reduce((sum, r) => sum + r.removedStillInAC.length, 0)

    console.log(`Produtos processados: ${results.length}`)
    console.log(`   Sucesso: ${successCount}`)
    console.log(`   Erro: ${results.length - successCount}`)
    console.log('')
    console.log(`Tags aplicadas (claim): ${totalClaimApplied}`)
    console.log(`Tags removidas (claim): ${totalClaimRemoved}`)
    console.log(`⚠️  Tags removidas mas ainda na AC (contagem por nome): ${totalStillInAC}`)
    console.log('')
    console.log(`Duração total: ${(totalDuration / 1000).toFixed(2)}s`)
    console.log(`Duração média: ${(totalDuration / results.length / 1000).toFixed(2)}s por produto`)

    // ═══════════════════════════════════════════════════════════
    // 10. VERIFICAÇÃO FINAL
    // ═══════════════════════════════════════════════════════════

    console.log('\n════════════════════════════════════════════════════════════')
    console.log('✅ VERIFICAÇÃO FINAL')
    console.log('════════════════════════════════════════════════════════════')

    const allSuccess = results.every(r => r.success)
    console.log('allSuccess:', allSuccess)

    if (totalStillInAC > 0) {
      console.log('⚠️  Há mismatches: o orchestrator diz que removeu, mas a AC ainda tem as tags.')
      console.log('   → Este output dá-te os contactTagIds exactos que continuam na AC.')
      console.log('   → Se o teu removeTag() estiver a usar tagId em vez de contactTagId, apanhas aqui.')
      console.log('   → Corre com AC_FORCE_DELETE=true para provar que o endpoint DELETE funciona.')
    } else {
      console.log('✅ Sem mismatches: o que o orchestrator removeu já não aparece na AC.')
    }

    console.log('\n✅ TESTE COMPLETO FINALIZADO')
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

testRuiFullOrchestrator()
