import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import * as renewalPipeline from '../renewalPipeline.service'

const executarPipeline = (renewalPipeline as unknown as {
  runRenewalPipelineComDependencias: (dependencias: Record<string, any>) => Promise<any>
}).runRenewalPipelineComDependencias

function dependencias(
  enabled: boolean | Record<string, boolean>,
  fila: { compras: any[]; reembolsos: any[] } = { compras: [], reembolsos: [] }
) {
  const ordem: string[] = []
  const gates: string[] = []
  const opcoesCompra: unknown[] = []
  const opcoesTags: unknown[] = []
  const opcoesReembolsos: unknown[] = []
  const marcados: Array<[unknown[], string]> = []
  return {
    ordem,
    gates,
    opcoesCompra,
    opcoesTags,
    opcoesReembolsos,
    marcados,
    valor: {
      lerFila: async () => { ordem.push('fila'); return fila },
      marcarTratado: async (ids: unknown[], campo: string) => { marcados.push([ids, campo]) },
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
  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'fila', 'expiracao', 'turmaTags', 'reembolsos', 'discord', 'timeline'])
  assert.deepEqual(fixtures.opcoesCompra, [], 'o campo 334 é informativo: o nocturno lê-o, não o escreve')
  assert.deepEqual(fixtures.opcoesTags, [{ dryRun: false, userIds: [] }])
  assert.deepEqual(fixtures.opcoesReembolsos, [{ dryRun: false, transacoes: [] }])
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

  assert.deepEqual(fixtures.ordem, ['hotmart', 'ac', 'tags', 'fila', 'turmaTags', 'discord', 'timeline'])
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

// -- A fila ---------------------------------------------------------
// O nocturno gere acontecimentos. Faltar uma tag e um reembolso antigo
// sao estados, nao acontecimentos, e o passado fica como esta.

test('o nocturno so trata quem a fila trouxe', async () => {
  const fixtures = dependencias(true, {
    compras: [{ _id: 'e1', userId: 'u1' }, { _id: 'e2', userId: 'u2' }],
    reembolsos: [{ _id: 'e3', transacao: 'HP9' }]
  })

  await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.opcoesTags, [{ dryRun: false, userIds: ['u1', 'u2'] }])
  assert.deepEqual(fixtures.opcoesReembolsos, [{ dryRun: false, transacoes: ['HP9'] }])
})

test('a fila vazia manda uma lista vazia, e nao a ausencia de lista', async () => {
  // Uma lista vazia faz o consumidor nao tratar ninguem; a ausencia de lista
  // punha-o a varrer toda a gente. A diferenca e o sistema inteiro.
  const fixtures = dependencias(true)

  await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.opcoesTags, [{ dryRun: false, userIds: [] }])
  assert.deepEqual(fixtures.opcoesReembolsos, [{ dryRun: false, transacoes: [] }])
})

test('a fila so e marcada depois de o passo correr bem', async () => {
  const fixtures = dependencias(true, {
    compras: [{ _id: 'e1', userId: 'u1' }],
    reembolsos: [{ _id: 'e2', transacao: 'HP9' }]
  })

  await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.marcados, [[['e1'], 'tagTurma'], [['e2'], 'reembolso']])
})

test('um passo que rebenta deixa a fila por tratar', async () => {
  const fixtures = dependencias(true, { compras: [{ _id: 'e1', userId: 'u1' }], reembolsos: [] })
  fixtures.valor.syncTurmaTags = async () => { throw new Error('AC em baixo') }

  const report = await executarPipeline(fixtures.valor)

  assert.equal(report.acTurmaTags.success, false)
  assert.deepEqual(fixtures.marcados, [], 'o evento tem de voltar na noite seguinte')
})

test('um passo com o interruptor desligado nao marca a fila', async () => {
  const fixtures = dependencias(
    { AcTurmaTagSync: false, AcRefundHandler: false, AcExpirationSync: false },
    { compras: [{ _id: 'e1', userId: 'u1' }], reembolsos: [{ _id: 'e2', transacao: 'HP9' }] }
  )

  await executarPipeline(fixtures.valor)

  assert.deepEqual(fixtures.marcados, [], 'saltado nao e tratado')
})
