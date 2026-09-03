/**
 * Corre os dois escritores em modo seguro e imprime os relatórios completos.
 * O comando nunca passa `dryRun: false`; os próprios serviços também ficam
 * seguros por omissão. Pára se a guarda de tags deixar passar alguma escrita
 * ou se os reembolsos propuserem mais remoções do que a referência validada.
 */
import { syncTurmaTags } from '../../src/services/renewal/acTurmaTagSync.service'
import { handleRefunds } from '../../src/services/renewal/refundHandler.service'
import { desligar, ligar } from './lib'

async function main() {
  const lidosEm = new Date().toISOString()
  await ligar()
  try {
    const tags = await syncTurmaTags()
    const reembolsos = await handleRefunds()
    const resultado = {
      lidosEm,
      tags,
      reembolsos,
      parouPorTagAplicavel: tags.aAplicar !== 0,
      parouPorRemocoesExcessivas: reembolsos.aRemover > 11
    }
    console.log(JSON.stringify(resultado, null, 2))
    if (resultado.parouPorTagAplicavel || resultado.parouPorRemocoesExcessivas) process.exitCode = 2
  } finally {
    await desligar()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
