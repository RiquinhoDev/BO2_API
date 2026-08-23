/**
 * Actualiza os espelhos locais antes de uma bateria de qualidade.
 *
 * As três rotinas só escrevem na nossa BD (ACRenewalData, ACStudentTag e
 * HotmartSaleHistory); as chamadas externas são GETs. Não liga nenhum job e
 * não escreve na ActiveCampaign nem na Hotmart.
 */
import { desligar, ligar } from './lib'
import { syncActiveStudentAcRenewalData } from '../../src/services/renewal/acRenewalDataSync.service'
import { syncAcStudentTags } from '../../src/services/renewal/acStudentTagsSync.service'
import { syncActiveStudentSalesHistory } from '../../src/services/renewal/hotmartSalesHistory.service'

async function main() {
  await ligar()
  const iniciadoEm = new Date().toISOString()
  try {
    const ac = await syncActiveStudentAcRenewalData()
    const tags = await syncAcStudentTags()
    const vendas = await syncActiveStudentSalesHistory()
    console.log(JSON.stringify({ iniciadoEm, terminadoEm: new Date().toISOString(), ac, tags, vendas }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
