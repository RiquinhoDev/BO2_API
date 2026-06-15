// scripts/dryrun-curseduca-crossref.ts
// DRY-RUN read-only do sync completo CursEduca + cross-reference.
// NÃO ESCREVE NADA: usa só .find().lean() e a função PURA
// determineCrossReferenceAction. NUNCA chama applyAction (o único que grava).
//
// Objetivo: provar que nenhum dos 13 membros recuperados pelo fix é marcado
// PARA_INATIVAR por engano — e mostrar que sob o método ANTIGO (em que saíam
// do sync) seriam candidatos a stale->PARA_INATIVAR.
//
// Uso: npx ts-node --transpile-only scripts/dryrun-curseduca-crossref.ts

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import { fetchCurseducaDataForSync } from '../src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter'
import { determineCrossReferenceAction } from '../src/services/guru/crossReference.service'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'

const norm = (e: any) => String(e || '').toLowerCase().trim()
const sitToMemberStatus = (s?: string) =>
  s === 'INACTIVE' || s === 'SUSPENDED' ? 'INACTIVE' : 'ACTIVE'

function recoveredEmailsFromSnapshots(): Set<string> {
  const dir = path.join(__dirname, '..', 'snapshots', 'curseduca-shadow')
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'adapter-BEFORE.json'), 'utf-8'))
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'adapter-AFTER.json'), 'utf-8'))
  const k = (r: any) => `${norm(r.email)}|${r.groupName}`
  const kb = new Set(before.rows.map(k))
  const onlyAfter = after.rows.filter((r: any) => !kb.has(k(r)))
  return new Set(onlyAfter.map((r: any) => norm(r.email)))
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI não definido no .env')

  console.log('🔌 A ligar ao Mongo (READ-ONLY)...')
  await mongoose.connect(process.env.MONGO_URI)

  // 1) Correr o adapter NOVO -> dados que o sync escreveria
  console.log('🔄 A correr adapter novo (fetchCurseducaDataForSync)...')
  const data = await fetchCurseducaDataForSync({
    includeProgress: true, includeGroups: true, enrichWithDetails: true, progressConcurrency: 5
  })
  const syncedEmails = new Set<string>(data.map((m: any) => norm(m.email)))
  const sitByEmail = new Map<string, string>()
  for (const m of data) sitByEmail.set(norm(m.email), m.platformData?.situation || 'ACTIVE')
  console.log(`   sync NOVO: ${syncedEmails.size} emails únicos`)

  const recovered = recoveredEmailsFromSnapshots()
  const oldSynced = new Set([...syncedEmails].filter(e => !recovered.has(e))) // método antigo perdia os recuperados
  console.log(`   recuperados pelo fix: ${recovered.size} emails`)

  // 2) SIMULAÇÃO read-only do cross-reference (loop principal) — SEM gravar
  const users = await User.find({
    'guru.status': { $exists: true },
    'curseduca.curseducaUserId': { $exists: true }
  }).select('_id email guru.status guru.updatedAt guru.nextCycleAt curseduca.memberStatus curseduca.situation').lean()

  const userIds = users.map((u: any) => u._id)
  const ups = await UserProduct.find({ userId: { $in: userIds }, platform: 'curseduca' }).lean()
  const upByUser = new Map<string, any>()
  for (const up of ups) upByUser.set(String(up.userId), up)

  const counts: Record<string, number> = { mark_para_inativar: 0, revert_to_active: 0, confirm_inactive: 0, skip: 0 }
  for (const u of users as any[]) {
    const up = upByUser.get(String(u._id))
    if (!up) continue
    const email = norm(u.email)
    // Usar situation que o sync NOVO escreveria; senão a da BD
    const newSit = sitByEmail.has(email) ? sitByEmail.get(email) : u.curseduca?.situation
    const memberStatus = sitByEmail.has(email) ? sitToMemberStatus(newSit) : u.curseduca?.memberStatus
    const action = determineCrossReferenceAction(
      u.guru?.status, memberStatus, newSit, up.status,
      { updatedAt: u.guru?.updatedAt, nextCycleAt: u.guru?.nextCycleAt }
    )
    counts[action.action] = (counts[action.action] || 0) + 1
  }

  // 3) Reconciliação stale (read-only): ACTIVE curseduca não presentes no sync
  const activeUPs = await UserProduct.find({ platform: 'curseduca', status: 'ACTIVE' })
    .populate('userId', 'email').lean()
  const staleNew = activeUPs.filter((up: any) => { const e = norm(up.userId?.email); return e && !syncedEmails.has(e) })
  const staleOld = activeUPs.filter((up: any) => { const e = norm(up.userId?.email); return e && !oldSynced.has(e) })

  // 4) FOCO: os 13 recuperados
  console.log('\n' + '═'.repeat(64))
  console.log('FOCO: os membros recuperados pelo fix (NOVO vs ANTIGO)')
  console.log('═'.repeat(64))
  const recUsers = await User.find({ email: { $in: [...recovered] } })
    .select('_id email guru.status guru.updatedAt guru.nextCycleAt curseduca.memberStatus curseduca.situation').lean()
  const recUserIds = recUsers.map((u: any) => u._id)
  const recUPs = await UserProduct.find({ userId: { $in: recUserIds }, platform: 'curseduca' }).lean()
  const recUpByUser = new Map<string, any>()
  for (const up of recUPs) recUpByUser.set(String(up.userId), up)

  let wrongful = 0
  for (const e of [...recovered].sort()) {
    const u: any = recUsers.find((x: any) => norm(x.email) === e)
    if (!u) { console.log(`  ${e}: (sem User na BD — provavelmente novo)`); continue }
    const up = recUpByUser.get(String(u._id))
    const newSit = sitByEmail.get(e)
    const memberStatus = sitToMemberStatus(newSit)
    const action = up ? determineCrossReferenceAction(
      u.guru?.status, memberStatus, newSit, up.status,
      { updatedAt: u.guru?.updatedAt, nextCycleAt: u.guru?.nextCycleAt }
    ) : { action: 'sem-UserProduct', reason: '' }
    // método ANTIGO: ausente do sync -> se UP ACTIVE, seria stale->PARA_INATIVAR
    const oldStale = up && up.status === 'ACTIVE'
    console.log(`  ${e}`)
    console.log(`     guru.status=${u.guru?.status} | curseduca.situation(novo)=${newSit} | UserProduct=${up?.status ?? 'N/A'}`)
    console.log(`     NOVO  -> em sync; ação cross-ref = ${action.action}${action.reason ? ' ('+action.reason+')' : ''}`)
    console.log(`     ANTIGO-> fora do sync; stale->PARA_INATIVAR? ${oldStale ? '🔴 SIM (inativação indevida)' : 'não'}`)
    if (oldStale && action.action !== 'mark_para_inativar') wrongful++
  }

  console.log('\n' + '═'.repeat(64))
  console.log('RESUMO (read-only, nada gravado)')
  console.log('═'.repeat(64))
  console.log('Ações cross-ref (loop principal, sync NOVO):', counts)
  console.log(`Stale->PARA_INATIVAR  NOVO: ${staleNew.length}  |  ANTIGO: ${staleOld.length}  (diferença = ${staleOld.length - staleNew.length} salvos pelo fix)`)
  console.log(`Recuperados que o ANTIGO inativaria indevidamente mas o NOVO protege: ${wrongful}`)

  await mongoose.disconnect()
  console.log('\n✅ Dry-run concluído. ZERO escritas na BD.')
  process.exit(0)
}

main().catch(e => { console.error('ERRO:', e?.message || e); process.exit(1) })
