import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClarezaJob, type ClarezaJobDependencies } from '../clareza.job'

// O `errors` que este job devolve vai parar ao dispatcher, que faz
// `success: ... && stats.errors === 0`. Um único erro pinta a noite de
// vermelho. Por isso o que conta como erro tem de ser exactamente aquilo
// que faz a noite falhar — nem mais, nem menos.

const silencioso = { info: () => undefined, error: () => undefined }

const core = (p: Partial<{
  status: string; collectedAssets: number; missingAssets: number; failedAssets: number
}> = {}) => ({
  status: 'published',
  generationId: 'g1',
  collectedAssets: 882,
  missingAssets: 0,
  failedAssets: 0,
  reasonCodes: [],
  ...p
}) as any

const deps = (o: Partial<ClarezaJobDependencies> = {}): ClarezaJobDependencies => ({
  assertRefreshEnabled: () => undefined,
  refreshCore: async () => core(),
  companions: [],
  logger: silencioso,
  ...o
})

// ── O caso que estava a dar vermelho todas as noites ─────────────────

test('tickers sem dados no fornecedor nao fazem a noite falhar', async () => {
  // Medido a 10/09/2026: o universo tem 886 tickers e o FMP nao serve
  // quatro — VBTC.DE, QDV2.DE, JEDI.DE e RENDERUSD. Sao os mesmos todas
  // as noites. A trava de publicacao exige 90% de cobertura; 882 de 886
  // sao 99,5% e passou. A geracao foi publicada e os companions
  // escreveram. Mesmo assim o job dava `failed`.
  const job = createClarezaJob(deps({
    refreshCore: async () => core({ collectedAssets: 882, missingAssets: 4 })
  }))

  const r = await job.run()

  assert.equal(r.success, true)
  assert.equal(r.errors, 0, 'falta de dados no fornecedor e cobertura, nao um erro de execucao')
  assert.equal(r.total, 882)
})

// ── O que continua a ter de falhar ──────────────────────────────────

test('geracao nao publicada continua a falhar', async () => {
  // A trava de qualidade e que decide se a cobertura chega. Quando ela
  // recusa, o dia falhou de verdade.
  const job = createClarezaJob(deps({
    refreshCore: async () => core({ status: 'rejected', collectedAssets: 400, missingAssets: 486 })
  }))

  const r = await job.run()

  assert.equal(r.success, false)
  assert.ok(r.errors >= 1)
})

test('um companion que rebenta conta como erro', async () => {
  // Isto e uma falha de execucao nossa, nao uma lacuna do fornecedor.
  const job = createClarezaJob(deps({
    companions: [
      { name: 'Raio-X', refresh: async () => ({ total: 10, errors: 0 }) },
      { name: 'Earnings', refresh: async () => { throw new Error('sem Redis') } }
    ]
  }))

  const r = await job.run()

  assert.equal(r.errors, 1)
})

test('erros contados por um companion tambem contam', async () => {
  const job = createClarezaJob(deps({
    companions: [{ name: 'Raio-X', refresh: async () => ({ total: 10, errors: 3 }) }]
  }))

  assert.equal((await job.run()).errors, 3)
})

test('o Top 10 e tratado como os outros companions', async () => {
  const job = createClarezaJob(deps({
    top10: { name: 'Top 10', refresh: async () => { throw new Error('falhou') } }
  }))

  assert.equal((await job.run()).errors, 1)
})

test('o refresh desligado falha, e nao passa por publicado', async () => {
  const job = createClarezaJob(deps({
    assertRefreshEnabled: () => { throw new Error('CLAREZA_REFRESH_ENABLED != true') }
  }))

  const r = await job.run()

  assert.equal(r.success, false)
  assert.equal(r.errors, 1)
})

// ── A arrumacao nunca derruba o dia ─────────────────────────────────

test('a poda e o aquecimento de cache falham sem estragar a noite', async () => {
  const job = createClarezaJob(deps({
    retention: async () => { throw new Error('sem espaco') },
    warmCache: async () => { throw new Error('cache em baixo') }
  }))

  const r = await job.run()

  assert.equal(r.success, true)
  assert.equal(r.errors, 0)
})
