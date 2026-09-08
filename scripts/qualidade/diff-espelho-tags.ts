import mongoose from 'mongoose'
import { failCli, readMirror, readSnapshot, withDevDatabase } from './vigilanciaRuntime'
import { compareSnapshots, OwnWrite } from './vigilanciaDiff'
import { collectCappedCursor } from '../../src/services/renewal/boundedMongoCursor'
export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !args[0]) throw new Error('USAGE: diff-espelho-tags.ts <fotografia.json>')
  const before = await readSnapshot(args[0])
  await withDevDatabase(async () => {
    const { construirContexto } = await import('../../src/services/renewal/acTagWatch.context')
    const now = await readMirror()
    const context = await construirContexto()
    const writes = await collectCappedCursor(mongoose.connection.collection('acwritelogs')
      .find({ dryRun: false, servico: { $in: ['turmaTag', 'reembolso'] }, quando: { $gte: new Date(Date.now() - 180 * 60_000) } })
      .project({ email: 1, tagId: 1, quando: 1 }).sort({ _id: 1 }).batchSize(200).maxTimeMS(5000),
    20_000, 'VIGILANCIA_WRITE_LOG') as unknown as OwnWrite[]
    console.log(JSON.stringify(compareSnapshots(before, now, context, writes), null, 2))
  })
}
if (require.main === module) void main().catch(failCli)
