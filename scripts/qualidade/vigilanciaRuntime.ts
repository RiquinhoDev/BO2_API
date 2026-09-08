import fs from 'fs'
import mongoose from 'mongoose'
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
import { collectCappedCursor } from '../../src/services/renewal/boundedMongoCursor'
import { parseSnapshot } from './vigilanciaDiff'

export function validateDevEnvironment(env: NodeJS.ProcessEnv): string {
  if (!['development', 'test'].includes(env.NODE_ENV ?? '')) throw new Error('VIGILANCIA_DEV_ENV_REQUIRED')
  const raw = env.VIGILANCIA_DEV_MONGO_URI ?? ''
  let uri: URL
  try { uri = new URL(raw) } catch { throw new Error('VIGILANCIA_DEV_MONGO_URI_REQUIRED') }
  if (uri.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)
    || !/^\/[a-zA-Z0-9_-]+_(dev|test)$/.test(uri.pathname) || uri.search || uri.hash) {
    throw new Error('VIGILANCIA_REQUIRES_LOCAL_DEV_DATABASE')
  }
  return raw
}

export async function withDevDatabase<T>(run: () => Promise<T>, provider = false): Promise<T> {
  const uri = validateDevEnvironment(process.env)
  if (provider && (!process.env.VIGILANCIA_DEV_AC_API_URL
    || process.env.VIGILANCIA_DEV_AC_API_URL !== process.env.AC_API_URL)) {
    throw new Error('VIGILANCIA_EXPLICIT_DEV_AC_URL_REQUIRED')
  }
  if (provider) initializeRuntimeConfig(loadConfig({ ...process.env, MONGO_URI: uri }))
  // Imported models must never create collections or indexes during an audit.
  mongoose.set('autoIndex', false)
  mongoose.set('autoCreate', false)
  try {
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 })
    return await run()
  } finally { await mongoose.disconnect() }
}

export async function readMirror() {
  const rows = await collectCappedCursor(mongoose.connection.collection('acstudenttags')
    .find({}).project({ _id: 0, email: 1, contactId: 1, tags: 1, syncedAt: 1, naListaAlunosOgi: 1 })
    .sort({ _id: 1 }).batchSize(200).maxTimeMS(5000), 20_000, 'VIGILANCIA_SNAPSHOT')
  return parseSnapshot(rows)
}

export async function writeSnapshot(destination: string, rows: unknown[]): Promise<void> {
  if (!destination) throw new Error('SNAPSHOT_DESTINATION_REQUIRED')
  const content = JSON.stringify(parseSnapshot(rows))
  if (Buffer.byteLength(content, 'utf8') > 32 * 1024 * 1024) throw new Error('SNAPSHOT_FILE_TOO_LARGE')
  // Exclusive creation: never destroy the previous comparison baseline.
  await fs.promises.writeFile(destination, content, { flag: 'wx', mode: 0o600 })
}

export async function readSnapshot(source: string) {
  const handle = await fs.promises.open(source, 'r')
  try {
    if ((await handle.stat()).size > 32 * 1024 * 1024) throw new Error('SNAPSHOT_FILE_TOO_LARGE')
    return parseSnapshot(JSON.parse(await handle.readFile('utf8')))
  } finally { await handle.close() }
}

export function failCli(): void {
  // Provider/DB exceptions may contain credentials. Details belong in isolated debugging.
  console.error('Vigilância incompleta. Verificar argumentos e configuração isolada de dev.')
  process.exitCode = 1
}
