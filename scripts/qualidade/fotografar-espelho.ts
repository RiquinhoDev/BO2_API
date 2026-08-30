/**
 * Grava uma fotografia do espelho `acstudenttags` num ficheiro.
 *
 * A vigilância compara a AC de hoje com o espelho de ontem, mas o sync
 * sobrescreve o espelho. Sem uma fotografia tirada ANTES, a base de
 * comparação morre e nunca se sabe o que mexeu.
 *
 * Só lê.
 *
 * Uso:
 *   railway run npx tsx scripts/qualidade/fotografar-espelho.ts <destino.json>
 */
import fs from 'fs'
import { ligar, desligar } from './lib'

async function main() {
  const db: any = await ligar()
  const docs = await db.collection('acstudenttags')
    .find({}).project({ email: 1, syncedAt: 1, contactId: 1, tags: 1, naListaAlunosOgi: 1 }).toArray()
  fs.writeFileSync(process.argv[2], JSON.stringify(docs))
  const assoc = docs.reduce((s: number, d: any) => s + (d.tags?.length ?? 0), 0)
  console.log(`gravado  docs ${docs.length}  associacoes ${assoc}  syncedAt ${docs[0]?.syncedAt}`)
  await desligar()
}
main().catch((e) => { console.error(e); process.exit(1) })
