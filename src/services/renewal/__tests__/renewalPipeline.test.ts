import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
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
        // Se o pipeline voltar a chamar isto, o teste tem de gritar.
        ordem.push('compra')
        opcoesCompra.push(opcoes)
        return { verificados: 0, escritos: 0, jaCertos: 0, semDados: 0, erros: 0, alteracoes: [] }
      }
    }
  }
}

test('o pipeline nunca escreve a data de compra', async () => {
  const fixtures = dependencias(true)

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.gates, ['AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler'])
  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'expiracao', 'turmaTags', 'reembolsos', 'discord', 'timeline'])
  assert.deepEqual(fixtures.opcoesCompra, [], 'o campo 334 é informativo: o nocturno lê-o, não o escreve')
  assert.deepEqual(fixtures.opcoesTags, [{ dryRun: false }])
  assert.deepEqual(fixtures.opcoesReembolsos, [{ dryRun: false }])
  assert.equal(report.acTurmaTags.success, true)
  assert.equal(report.acRefunds.success, true)
  assert.equal(report.success, true)
})

test('gate AcExpirationSync desligado salta a expiração', async () => {
  const fixtures = dependencias(false)

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.gates, ['AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler'])
  assert.equal(fixtures.ordem.includes('expiracao'), false)
  assert.equal(fixtures.ordem.includes('turmaTags'), false)
  assert.equal(fixtures.ordem.includes('reembolsos'), false)
  assert.equal(fixtures.ordem.includes('compra'), false)
  assert.equal(report.acExpiration.skipped, true)
})

test('os interruptores de tags e reembolsos são independentes', async () => {
  const fixtures = dependencias({ AcTurmaTagSync: true, AcRefundHandler: false, AcExpirationSync: false })

  const report = await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'turmaTags', 'discord', 'timeline'])
  assert.equal(report.acTurmaTags.skipped ?? false, false)
  assert.equal(report.acRefunds.skipped, true)
  assert.equal(report.acExpiration.skipped, true)
  assert.equal(fixtures.ordem.includes('compra'), false)
})

// ── A garantia que não se negoceia ──────────────────────────────────
// O 334 é informativo e chega da venda. Já esteve preso ao interruptor
// da expiração, sem interruptor próprio: ligar uma ligava a outra sem
// ninguém decidir. Esta guarda lê o próprio ficheiro, para apanhar o
// regresso do passo mesmo que ninguém se lembre de o testar.

test('o pipeline não importa sequer o reconciliador do 334', () => {
  const fonte = fs.readFileSync(
    path.join(__dirname, '..', 'renewalPipeline.service.ts'),
    'utf8'
  )
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

  assert.equal(
    /reconcilePurchaseDates|acPurchaseDateReconcile/.test(semComentarios),
    false,
    'o nocturno não escreve a data de compra — ver a secção 3 das regras'
  )
})
