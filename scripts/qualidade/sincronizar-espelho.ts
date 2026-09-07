/**
 * Actualiza os espelhos locais antes de uma bateria de qualidade.
 *
 * As três rotinas só escrevem na nossa BD (ACRenewalData, ACStudentTag e
 * HotmartSaleHistory); as chamadas externas são GETs. Não liga nenhum job e
 * não escreve na ActiveCampaign nem na Hotmart.
 */
// A configuração de runtime tem de ser inicializada ANTES de importar os
// serviços: as credenciais da AC e da Hotmart são lidas dela, e sem isto a
// corrida morre a meio com RUNTIME_CONFIG_NOT_INITIALIZED — deixando uns
// espelhos frescos e outros velhos, que é pior do que não correr nada.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import { desligar, ligar } from './lib'
import { syncActiveStudentAcRenewalData } from '../../src/services/renewal/acRenewalDataSync.service'
import { syncAcStudentTags } from '../../src/services/renewal/acStudentTagsSync.service'
import { syncActiveStudentSalesHistory } from '../../src/services/renewal/hotmartSalesHistory.service'

/** Corre um passo sem deixar que a falha dele impeça os seguintes. */
async function passo<T>(nome: string, fn: () => Promise<T>): Promise<T | { erro: string }> {
  const inicio = Date.now()
  try {
    const r = await fn()
    console.log(`  ✓ ${nome}  ${Math.round((Date.now() - inicio) / 1000)}s`)
    return r
  } catch (error: any) {
    console.error(`  ✗ ${nome}  FALHOU: ${error?.message ?? error}`)
    return { erro: String(error?.message ?? error) }
  }
}

async function main() {
  await ligar()
  const iniciadoEm = new Date().toISOString()
  try {
    console.log('a refrescar os três espelhos...')
    const ac = await passo('AC (datas)', () => syncActiveStudentAcRenewalData())
    const tags = await passo('AC (tags)', () => syncAcStudentTags())
    const vendas = await passo('Hotmart (vendas)', () => syncActiveStudentSalesHistory())
    console.log(JSON.stringify({ iniciadoEm, terminadoEm: new Date().toISOString(), ac, tags, vendas }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
