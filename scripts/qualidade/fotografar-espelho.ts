import { failCli, readMirror, withDevDatabase, writeSnapshot } from './vigilanciaRuntime'
export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !args[0]) throw new Error('USAGE: fotografar-espelho.ts <destino.json>')
  await withDevDatabase(async () => {
    const rows = await readMirror()
    await writeSnapshot(args[0], rows)
    console.log(`Fotografia criada: ${rows.length} contactos. Nenhuma escrita na BD ou AC.`)
  })
}
if (require.main === module) void main().catch(failCli)
