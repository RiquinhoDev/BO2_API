/**
 * Plano de retenção: mostra o que ocupa espaço e o que se recupera ao aplicar
 * as políticas. Não apaga nada sozinho.
 *
 *   npx ts-node --transpile-only scripts/maintenance/retention-plan.ts
 *   npx ts-node --transpile-only scripts/maintenance/retention-plan.ts --apply
 *
 * Sem `--apply` é só leitura: conta, mede e explica. Com `--apply` faz duas
 * coisas, e apenas duas:
 *
 *   1. carimba `expiresAt` nos registos PLATFORM_UPDATE mais antigos do que a
 *      política — o TTL do Mongo apaga-os depois, sozinho;
 *   2. ajusta, por collMod, a retenção do índice TTL de `usersnapshots`.
 *
 * Nada toca em INACTIVATION, CLASS_CHANGE, STATUS_CHANGE, EMAIL_CHANGE ou
 * MANUAL_EDIT. Esses são o percurso do aluno e ficam.
 */

import mongoose from 'mongoose'
import {
  FIRST_OBSERVATION_FILTER,
  loadRetentionPolicy,
} from '../../src/services/ops/retentionPolicy'

const DAY_MS = 24 * 60 * 60 * 1_000
const APPLY = process.argv.includes('--apply')

/** Tipos que nunca expiram, aconteça o que acontecer a este script. */
const PROTECTED_CHANGE_TYPES = [
  'INACTIVATION',
  'CLASS_CHANGE',
  'STATUS_CHANGE',
  'EMAIL_CHANGE',
  'MANUAL_EDIT',
] as const

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI em falta')

  await mongoose.connect(uri)
  const db = mongoose.connection.db
  if (!db) throw new Error('sem ligação à base de dados')

  const policy = loadRetentionPolicy()
  const now = Date.now()

  line(APPLY ? '=== APLICAR ===' : '=== SIMULAÇÃO (nada é alterado) ===')
  line()

  // ── Histórico de utilizador ────────────────────────────────────────────────
  const history = db.collection('userhistories')
  const stats = await db.command({ collStats: 'userhistories' }).catch(() => null)
  const bytesPerDocument = stats && typeof stats.avgObjSize === 'number' ? stats.avgObjSize : 0

  const totalHistory = await history.estimatedDocumentCount()
  const protectedCount = await history.countDocuments({
    changeType: { $in: [...PROTECTED_CHANGE_TYPES] },
  })

  line(`userhistories: ${totalHistory} documentos`)
  line(`  protegidos (nunca expiram): ${protectedCount}`)

  if (policy.platformUpdateDays === null) {
    line('  PLATFORM_UPDATE: sem política definida — nada a fazer.')
    line('  Para definir: USER_HISTORY_PLATFORM_UPDATE_DAYS=180')
  } else {
    const cutoff = new Date(now - policy.platformUpdateDays * DAY_MS)
    const filter = {
      changeType: 'PLATFORM_UPDATE',
      createdAt: { $lt: cutoff },
      expiresAt: { $in: [null, undefined] },
    }
    const affected = await history.countDocuments(filter)

    line(`  PLATFORM_UPDATE com mais de ${policy.platformUpdateDays} dias: ${affected}`)
    line(`  espaço estimado a recuperar: ${megabytes(affected * bytesPerDocument)}`)

    if (APPLY && affected > 0) {
      // Data no passado: o TTL apaga-os na passagem seguinte, sem precisarmos
      // de mandar um deleteMany de cento e tal mil documentos a um M0.
      const result = await history.updateMany(filter, { $set: { expiresAt: new Date(now - 1_000) } })
      line(`  carimbados: ${result.modifiedCount} (o TTL apaga-os dentro de um minuto)`)
    }
  }

  // Primeiras observações: o corte mais estreito, e por isso o primeiro a ser
  // oferecido. Corre antes do corte largo para que a contagem deste não inclua
  // registos que aquele já levaria.
  if (policy.firstObservationDays === null) {
    line('  Primeiras observações: sem política definida.')
    line('  Para definir: USER_HISTORY_FIRST_OBSERVATION_DAYS=180')
  } else {
    const cutoff = new Date(now - policy.firstObservationDays * DAY_MS)
    const filter = {
      ...FIRST_OBSERVATION_FILTER,
      createdAt: { $lt: cutoff },
      expiresAt: { $in: [null, undefined] },
    }
    const affected = await history.countDocuments(filter)
    line(
      `  primeiras observações com mais de ${policy.firstObservationDays} dias: ${affected}`,
    )
    line(`  espaço estimado a recuperar: ${megabytes(affected * bytesPerDocument)}`)

    if (APPLY && affected > 0) {
      const result = await history.updateMany(filter, { $set: { expiresAt: new Date(now - 1_000) } })
      line(`  carimbados: ${result.modifiedCount} (o TTL apaga-os dentro de um minuto)`)
    }
  }

  line()

  // ── Snapshots de utilizador ────────────────────────────────────────────────
  const desiredSnapshotDays = Number(process.env.USER_SNAPSHOT_DAYS ?? '')
  const indexes = await db.collection('usersnapshots').indexes()
  const ttlIndex = indexes.find((index) => typeof index.expireAfterSeconds === 'number')
  const currentDays = ttlIndex ? Number(ttlIndex.expireAfterSeconds) / (24 * 3_600) : null

  const snapshotCount = await db.collection('usersnapshots').estimatedDocumentCount()
  line(`usersnapshots: ${snapshotCount} documentos, retenção actual ${currentDays ?? '—'} dias`)
  line('  só o mais recente de cada aluno é lido (getLastUserSnapshot)')

  if (!Number.isInteger(desiredSnapshotDays) || desiredSnapshotDays < 1) {
    line('  Para mudar: USER_SNAPSHOT_DAYS=2 (e correr outra vez)')
  } else if (!ttlIndex?.name) {
    line('  Sem índice TTL — nada a ajustar.')
  } else if (currentDays === desiredSnapshotDays) {
    line(`  Já está em ${desiredSnapshotDays} dias.`)
  } else {
    const older = await db.collection('usersnapshots').countDocuments({
      snapshotDate: { $lt: new Date(now - desiredSnapshotDays * DAY_MS) },
    })
    line(`  ${currentDays} -> ${desiredSnapshotDays} dias apagaria ${older} snapshots`)

    if (APPLY) {
      await db.command({
        collMod: 'usersnapshots',
        index: { name: ttlIndex.name, expireAfterSeconds: desiredSnapshotDays * 24 * 3_600 },
      })
      line(`  retenção alterada para ${desiredSnapshotDays} dias`)
    }
  }

  line()
  if (!APPLY) line('Nada foi alterado. Correr outra vez com --apply para executar.')

  await mongoose.disconnect()
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
