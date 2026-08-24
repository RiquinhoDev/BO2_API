import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as renewalPipeline from '../renewalPipeline.service'

const executarPipeline = (renewalPipeline as unknown as {
  runRenewalPipelineComDependencias: (dependencias: Record<string, any>) => Promise<any>
}).runRenewalPipelineComDependencias

function dependencias(enabled: boolean | Record<string, boolean>) {
  const ordem: string[] = []
  const gates: string[] = []
  const opcoesCompra: unknown[] = []
  const opcoesTags: unknown[] = []
  const opcoesReembolsos: unknown[] = []
  return {
    ordem,
    gates,
    opcoesCompra,
    opcoesTags,
    opcoesReembolsos,
    valor: {
      isJobSwitchEnabled: async (jobName: string) => {
        gates.push(jobName)
        return typeof enabled === 'boolean' ? enabled : Boolean(enabled[jobName])
      },
      syncActiveStudentSalesHistory: async () => { ordem.push('hotmart'); return {} },
      syncActiveStudentAcRenewalData: async () => { ordem.push('ac'); return {} },
      syncAcStudentTags: async () => { ordem.push('tags'); return {} },
      syncAcExpirationDates: async () => { ordem.push('expiracao'); return {} },
      syncTurmaTags: async (opcoes: unknown) => { ordem.push('turmaTags'); opcoesTags.push(opcoes); return {} },
      handleRefunds: async (opcoes: unknown) => { ordem.push('reembolsos'); opcoesReembolsos.push(opcoes); return {} },
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

  assert.deepEqual(fixtures.gates, ['AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler', 'AcExpirationSync'])
  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'expiracao', 'turmaTags', 'reembolsos', 'discord', 'timeline', 'compra'])
  assert.deepEqual(fixtures.opcoesCompra, [{ dryRun: false }])
  assert.deepEqual(fixtures.opcoesTags, [{ dryRun: false }])
  assert.deepEqual(fixtures.opcoesReembolsos, [{ dryRun: false }])
  assert.equal(report.acPurchaseDate.success, true)
  assert.equal(report.acTurmaTags.success, true)
  assert.equal(report.acRefunds.success, true)
  assert.equal(report.success, true)
})

test('gate AcExpirationSync desligado também salta a reconciliação do 334', async () => {
  const fixtures = dependencias(false)

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.gates, ['AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler', 'AcExpirationSync'])
  assert.equal(fixtures.ordem.includes('expiracao'), false)
  assert.equal(fixtures.ordem.includes('turmaTags'), false)
  assert.equal(fixtures.ordem.includes('reembolsos'), false)
  assert.equal(fixtures.ordem.includes('compra'), false)
  assert.equal(report.acPurchaseDate.skipped, true)
})

test('os interruptores de tags e reembolsos são independentes', async () => {
  const fixtures = dependencias({ AcTurmaTagSync: true, AcRefundHandler: false, AcExpirationSync: false })

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'turmaTags', 'discord', 'timeline'])
  assert.equal(report.acTurmaTags.skipped ?? false, false)
  assert.equal(report.acRefunds.skipped, true)
  assert.equal(report.acExpiration.skipped, true)
  assert.equal(report.acPurchaseDate.skipped, true)
})
