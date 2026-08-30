import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SERVICO = path.join(__dirname, '..', 'acTagWatch.service.ts')
const fonte = fs.readFileSync(SERVICO, 'utf8')

// ── A garantia que nao se negoceia ──────────────────────────────────
// Feia de proposito: le o proprio ficheiro. Um teste de comportamento
// so apanharia a escrita se o caso de teste a provocasse; este apanha-a
// mesmo que ninguem se lembre de a testar.

test('a vigilancia NAO escreve na ActiveCampaign', () => {
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

  assert.equal(/axios\s*\.\s*post/.test(semComentarios), false, 'nao pode haver axios.post')
  assert.equal(/axios\s*\.\s*delete/.test(semComentarios), false, 'nao pode haver axios.delete')
  assert.equal(/axios\s*\.\s*put/.test(semComentarios), false, 'nao pode haver axios.put')
  assert.equal(/axios\s*\.\s*patch/.test(semComentarios), false, 'nao pode haver axios.patch')
  assert.equal(/contactTags/.test(semComentarios), false, 'nao pode tocar no endpoint das tags')
  assert.equal(
    /activeCampaignService/.test(semComentarios),
    false,
    'nao pode importar o servico que escreve na AC'
  )
})

test('nao reutiliza o sistema de tags de Janeiro', () => {
  // O Joao foi explicito: e outra funcionalidade. Se alguem ligar isto ao
  // tagOrchestrator/decisionEngine, o sistema passa a APLICAR tags.
  assert.equal(/tagOrchestrator|decisionEngine|tagMonitoring|CriticalTag/.test(fonte), false)
})

// ── Omissoes seguras ────────────────────────────────────────────────

test('dryRun e actualizarEspelho tem a omissao segura', () => {
  assert.match(fonte, /const dryRun = opcoes\.dryRun !== false/)
  assert.match(fonte, /const actualizarEspelho = opcoes\.actualizarEspelho === true/)
})

test('so grava quando dryRun e falso', () => {
  assert.match(fonte, /if \(!dryRun && docs\.length\)/)
})

test('o espelho so e actualizado no fim, e nunca em dry-run', () => {
  assert.match(fonte, /if \(actualizarEspelho && !dryRun\)/)
  const posGravacao = fonte.indexOf('if (!dryRun && docs.length)')
  const posEspelho = fonte.indexOf('if (actualizarEspelho && !dryRun)')
  assert.ok(posEspelho > posGravacao, 'o espelho tem de ser sobrescrito DEPOIS do diff e da gravacao')
})

test('o diff le o espelho antes de qualquer escrita nele', () => {
  const posLeitura = fonte.indexOf("ACStudentTag as any")
  const posSync = fonte.indexOf("import('./acStudentTagsSync.service')")
  assert.ok(posLeitura > -1 && posSync > posLeitura, 'a base de comparacao tem de ser lida primeiro')
})

// ── Idempotencia ────────────────────────────────────────────────────

test('grava por chave unica com $setOnInsert — correr duas vezes nao duplica', () => {
  assert.match(fonte, /\$setOnInsert/)
  assert.match(fonte, /filter: \{ chave: d\.chave \}/)
  assert.match(fonte, /chave: `\$\{e\.email\}\|\$\{e\.alvo\}\|\$\{e\.tagId\}\|\$\{e\.accao\}\|\$\{quandoISO\}`/)
})

// ── As armadilhas que ja custaram caro ──────────────────────────────

test('"activo" e combined.status, nunca userproducts.status', () => {
  assert.match(fonte, /'combined\.status': 'ACTIVE'/)
  assert.equal(/userproducts/i.test(fonte), false)
})

test('um dry-run nosso nao protege — so escritas reais contam como nossas', () => {
  assert.match(fonte, /dryRun: false, servico: \{ \$in: \['turmaTag', 'reembolso'\] \}/)
})

test('um periodo so conta como pago se a compra nao foi reembolsada', () => {
  assert.match(fonte, /x\?\.reembolsada !== true/)
})
