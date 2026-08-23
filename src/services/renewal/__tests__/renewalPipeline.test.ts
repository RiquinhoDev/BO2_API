import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as renewalPipeline from '../renewalPipeline.service'

const executarPipeline = (renewalPipeline as unknown as {
  runRenewalPipelineComDependencias: (dependencias: Record<string, any>) => Promise<any>
}).runRenewalPipelineComDependencias

function dependencias(enabled: boolean) {
  const ordem: string[] = []
  const gates: string[] = []
  const opcoesCompra: unknown[] = []
  return {
    ordem,
    gates,
    opcoesCompra,
    valor: {
      isJobSwitchEnabled: async (jobName: string) => { gates.push(jobName); return enabled },
      syncActiveStudentSalesHistory: async () => { ordem.push('hotmart'); return {} },
      syncActiveStudentAcRenewalData: async () => { ordem.push('ac'); return {} },
      syncAcStudentTags: async () => { ordem.push('tags'); return {} },
      syncAcExpirationDates: async () => { ordem.push('expiracao'); return {} },
      runDiscordRolesSyncJob: async () => { ordem.push('discord'); return {} },
      gerarTimelinesEmLote: async () => { ordem.push('timeline'); return {} },
      reconcilePurchaseDates: async (opcoes: unknown) => {
        ordem.push('compra')
        opcoesCompra.push(opcoes)
        return { verificados: 0, escritos: 0, jaCertos: 0, semDados: 0, erros: 0, alteracoes: [] }
      }
    }
  }
}

test('reconciliação do 334 usa o gate AcExpirationSync e fica no fim do pipeline', async () => {
  const fixtures = dependencias(true)

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.gates, ['AcExpirationSync', 'AcExpirationSync'])
  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'expiracao', 'discord', 'timeline', 'compra'])
  assert.deepEqual(fixtures.opcoesCompra, [{ dryRun: false }])
  assert.equal(report.acPurchaseDate.success, true)
  assert.equal(report.success, true)
})

test('gate AcExpirationSync desligado também salta a reconciliação do 334', async () => {
  const fixtures = dependencias(false)

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.gates, ['AcExpirationSync', 'AcExpirationSync'])
  assert.equal(fixtures.ordem.includes('expiracao'), false)
  assert.equal(fixtures.ordem.includes('compra'), false)
  assert.equal(report.acPurchaseDate.skipped, true)
})
