// scripts/snapshot-curseduca-adapter.ts
// Captura o OUTPUT normalizado de fetchCurseducaDataForSync (golden snapshot)
// para comparar BEFORE vs AFTER da otimização do enrich.
// NÃO toca na BD — o adapter só chama a API CursEduca e normaliza.
//
// Uso:
//   npx ts-node --transpile-only scripts/snapshot-curseduca-adapter.ts BEFORE
//   npx ts-node --transpile-only scripts/snapshot-curseduca-adapter.ts AFTER

import fs from 'fs'
import path from 'path'
import { fetchCurseducaDataForSync } from '../src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter'

async function main() {
  const label = (process.argv[2] || 'BEFORE').toUpperCase()
  const t0 = Date.now()

  const data = await fetchCurseducaDataForSync({
    includeProgress: true,
    includeGroups: true,
    enrichWithDetails: true,
    progressConcurrency: 5
  })

  const durationSec = Math.round((Date.now() - t0) / 1000)

  // Projeção estável (campos que alimentam o sync downstream), ordenada de forma determinística
  const rows = data
    .map((m: any) => ({
      email: m.email,
      curseducaUserId: m.curseducaUserId,
      groupId: m.groupId,
      groupName: m.groupName,
      subscriptionType: m.subscriptionType ?? null,
      situation: m.platformData?.situation ?? null,
      isPrimary: m.platformData?.isPrimary ?? null,
      isDuplicate: m.platformData?.isDuplicate ?? null,
      lastLogin: m.lastLogin ?? null,
      lastAccess: m.lastAccess ?? null,
      enrolledAt: m.enrolledAt ?? null,
      expiresAt: m.expiresAt ?? null,
      progress: m.progress?.percentage ?? null
    }))
    .sort((a, b) => `${a.email}|${a.groupId}`.localeCompare(`${b.email}|${b.groupId}`))

  const bySituation: Record<string, number> = {}
  const byGroup: Record<string, number> = {}
  for (const r of rows) {
    const s = String(r.situation)
    bySituation[s] = (bySituation[s] || 0) + 1
    const g = String(r.groupName)
    byGroup[g] = (byGroup[g] || 0) + 1
  }

  const summary = {
    label,
    capturedAt: new Date().toISOString(),
    durationSec,
    totalItems: rows.length,
    uniqueEmails: new Set(rows.map(r => r.email)).size,
    uniqueCurseducaIds: new Set(rows.map(r => r.curseducaUserId)).size,
    bySituation,
    byGroup
  }

  const dir = path.join(__dirname, '..', 'snapshots', 'curseduca-shadow')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `adapter-${label}.json`)
  fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2))

  console.log('═'.repeat(60))
  console.log(`SNAPSHOT ${label} guardado em: ${out}`)
  console.log(JSON.stringify(summary, null, 2))
  console.log('═'.repeat(60))
  process.exit(0)
}

main().catch((e) => {
  console.error('ERRO no snapshot:', e?.message || e)
  process.exit(1)
})
