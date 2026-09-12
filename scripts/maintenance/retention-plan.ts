/**
 * Retenção dos snapshots de utilizador.
 *
 *   npm run retention:plan     # simula, não altera nada
 *   npm run retention:apply    # aplica
 *
 * Só mexe em `usersnapshots`, e só na retenção do índice TTL. Não apaga
 * histórico, não carimba documentos, não toca em mais nenhuma colecção.
 *
 * Porquê só os snapshots: destes, apenas o mais recente de cada aluno é
 * alguma vez lido — `getLastUserSnapshot`, para comparar com o estado actual
 * na sincronização seguinte. A função que listaria os restantes existe e nunca
 * chegou a ser chamada por ninguém. Os outros dias são cópias sem leitor.
 *
 * Porquê um script e não o schema: mudar `expireAfterSeconds` no modelo não
 * altera um índice que já existe na base. O Mongo só aceita a alteração por
 * collMod, e é isso que este script faz — deliberadamente, quando alguém o
 * corre.
 */

import mongoose from 'mongoose'

const DAY_MS = 24 * 60 * 60 * 1_000
const APPLY = process.argv.includes('--apply')
const DEFAULT_DAYS = 2

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI em falta')

  const raw = process.env.USER_SNAPSHOT_DAYS
  const desiredDays = raw === undefined || raw.trim() === '' ? DEFAULT_DAYS : Number(raw)
  if (!Number.isInteger(desiredDays) || desiredDays < 1 || desiredDays > 365) {
    throw new Error('USER_SNAPSHOT_DAYS deve ser um inteiro entre 1 e 365')
  }

  await mongoose.connect(uri)
  const db = mongoose.connection.db
  if (!db) throw new Error('sem ligação à base de dados')

  const snapshots = db.collection('usersnapshots')
  const indexes = await snapshots.indexes()
  const ttlIndex = indexes.find((index) => typeof index.expireAfterSeconds === 'number')
  const currentDays = ttlIndex ? Number(ttlIndex.expireAfterSeconds) / (24 * 3_600) : null

  line(APPLY ? '=== APLICAR ===' : '=== SIMULAÇÃO (nada é alterado) ===')
  line()
  line(`usersnapshots: ${await snapshots.estimatedDocumentCount()} documentos`)
  line(`  retenção actual: ${currentDays ?? '—'} dias`)
  line(`  retenção pedida: ${desiredDays} dias`)

  if (!ttlIndex?.name) {
    line('  Sem índice TTL nesta colecção — nada a ajustar.')
  } else if (currentDays === desiredDays) {
    line('  Já está no valor pedido.')
  } else {
    const older = await snapshots.countDocuments({
      snapshotDate: { $lt: new Date(Date.now() - desiredDays * DAY_MS) },
    })
    line(`  o TTL passaria a apagar ${older} snapshots`)

    if (APPLY) {
      await db.command({
        collMod: 'usersnapshots',
        index: { name: ttlIndex.name, expireAfterSeconds: desiredDays * 24 * 3_600 },
      })
      line(`  retenção alterada para ${desiredDays} dias`)
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
