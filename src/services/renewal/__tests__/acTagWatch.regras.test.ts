import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ContextoAluno,
  FotoTag,
  classificarSeveridade,
  diffTags,
  marcarLotes,
  mudancaNaLista,
  periodoDaTag,
  severidadeDaLista,
  soAgoraVisivel,
  tagVigiada
} from '../acTagWatch.regras'

const tag = (tagId: string, nome: string, tipo: any = 'outra', aplicadaEm: Date | null = null): FotoTag =>
  ({ tagId, nome, tipo, aplicadaEm })

const ctx = (over: Partial<ContextoAluno> = {}): ContextoAluno => ({
  activo: true,
  comAcessoPago: true,
  acessoAte: '2027-05-31',
  periodosPagos: new Set<string>(),
  tagsPorPeriodo: new Map<string, number>(),
  temTimeline: true,
  ...over
})

// ── periodoDaTag ────────────────────────────────────────────────────

test('periodoDaTag le as duas formas e recusa o resto', () => {
  assert.equal(periodoDaTag('Aluno OGI L2409 - Turma 11'), '2409')
  assert.equal(periodoDaTag('Aluno OGI 2505 - Renovação Turma 10 [2anos]'), '2505')
  assert.equal(periodoDaTag('Alunos OGI Ativos'), null)
  assert.equal(periodoDaTag('Turma 18 - 25 primeiros'), null)
})

// ── o escopo ────────────────────────────────────────────────────────

test('as obrigatorias e a 710 entram sempre, sem depender da turma', () => {
  assert.equal(tagVigiada(tag('347', 'Alunos OGI Ativos'), null), true)
  assert.equal(tagVigiada(tag('676', 'OGI - Aluno ou Ex-Aluno'), null), true)
  assert.equal(tagVigiada(tag('710', 'Aluno OGI Antigo'), null), true)
})

test('so a tag da turma ACTUAL entra; as antigas sao historico legitimo', () => {
  const actual = 'Aluno OGI L2605 - Turma 18'
  assert.equal(tagVigiada(tag('129', actual, 'membresia'), actual), true)
  assert.equal(tagVigiada(tag('260', 'Aluno OGI L2409 - Turma 11', 'membresia'), actual), false)
})

test('marketing e tags de estado nao obrigatorias ficam de fora', () => {
  const actual = 'Aluno OGI L2605 - Turma 18'
  assert.equal(tagVigiada(tag('999', 'Turma 18 - 25 primeiros'), actual), false)
  assert.equal(tagVigiada(tag('643', 'Alunos OGI Antigos'), actual), false)
  assert.equal(tagVigiada(tag('143', 'Alunos OGI - Todos com subscrição ativa'), actual), false)
})

test('a obrigatoria continua vigiada mesmo renomeada na AC', () => {
  assert.equal(tagVigiada(tag('347', 'Nome Novo Qualquer'), null), true)
})

// ── o diff ──────────────────────────────────────────────────────────

test('listas iguais nao dao evento nenhum', () => {
  const t = [tag('1', 'A'), tag('2', 'B')]
  const d = diffTags(t, [...t])
  assert.equal(d.aplicadas.length, 0)
  assert.equal(d.removidas.length, 0)
})

test('diffTags e indiferente a ordem dos arrays', () => {
  const antes = [tag('1', 'A'), tag('2', 'B'), tag('3', 'C')]
  const depois = [tag('3', 'C'), tag('1', 'A'), tag('4', 'D')]
  const d1 = diffTags(antes, depois)
  const d2 = diffTags([...antes].reverse(), [...depois].reverse())
  assert.deepEqual(d1.aplicadas.map((t) => t.tagId).sort(), d2.aplicadas.map((t) => t.tagId).sort())
  assert.deepEqual(d1.removidas.map((t) => t.tagId).sort(), d2.removidas.map((t) => t.tagId).sort())
  assert.deepEqual(d1.aplicadas.map((t) => t.tagId), ['4'])
  assert.deepEqual(d1.removidas.map((t) => t.tagId), ['2'])
})

// ── primeira leitura vs evento a serio ──────────────────────────────

const FOTO_EM = new Date('2026-08-23T21:57:43Z')

test('a 676: cdate de 2024, ausente da fotografia -> so agora visivel', () => {
  const t = tag('676', 'OGI - Aluno ou Ex-Aluno', 'canonica', new Date('2024-09-16T10:00:00Z'))
  assert.equal(soAgoraVisivel(t, new Set(['347']), FOTO_EM), true)
})

test('a 710: cdate depois da fotografia -> E evento, nao invisibilidade', () => {
  const t = tag('710', 'Aluno OGI Antigo', 'outra', new Date('2026-08-30T08:04:59Z'))
  assert.equal(soAgoraVisivel(t, new Set(['347']), FOTO_EM), false)
})

test('uma tag que ja estava na fotografia nunca e "primeira leitura"', () => {
  const t = tag('347', 'Alunos OGI Ativos', 'canonica', new Date('2026-08-30T08:00:00Z'))
  assert.equal(soAgoraVisivel(t, new Set(['347']), FOTO_EM), false)
})

// ── lotes ───────────────────────────────────────────────────────────

const aplic = (tagId: string, iso: string) => ({ tagId, quando: new Date(iso), accao: 'aplicada' as const })

test('a rajada de 30/08 da UM lote, nao dois — atravessa o minuto', () => {
  const eventos = [
    ...Array.from({ length: 21 }, () => aplic('710', '2026-08-30T08:04:59Z')),
    ...Array.from({ length: 15 }, () => aplic('710', '2026-08-30T08:05:00Z'))
  ]
  const r = marcarLotes(eventos)
  const lotes = new Set(r.map((e) => e.lote))
  assert.equal(lotes.size, 1)
  assert.equal(r[0].loteTamanho, 36)
  // e continuam a existir 36 linhas: o lote agrupa a vista, nao colapsa dados
  assert.equal(r.length, 36)
})

test('dois grupos separados por 10 minutos dao dois lotes', () => {
  const r = marcarLotes([
    ...Array.from({ length: 12 }, () => aplic('347', '2026-08-30T08:00:00Z')),
    ...Array.from({ length: 12 }, () => aplic('347', '2026-08-30T08:10:00Z'))
  ])
  assert.equal(new Set(r.map((e) => e.lote)).size, 2)
})

test('abaixo do limiar nao ha lote, e o numero de linhas e o mesmo', () => {
  const oito = Array.from({ length: 8 }, () => aplic('347', '2026-08-30T08:00:00Z'))
  const com10 = marcarLotes(oito, 10)
  const com5 = marcarLotes(oito, 5)
  assert.equal(com10.every((e) => e.lote === null), true)
  assert.equal(com5.every((e) => e.lote !== null), true)
  assert.equal(com10.length, 8)
  assert.equal(com5.length, 8)
})

test('aplicacoes sem data nunca entram em lote', () => {
  const r = marcarLotes(Array.from({ length: 20 }, () => ({ tagId: '347', quando: null, accao: 'aplicada' as const })))
  assert.equal(r.every((e) => e.lote === null), true)
})

test('remocoes agrupam por tag — nao tem hora para agrupar ao minuto', () => {
  const r = marcarLotes(
    Array.from({ length: 34 }, () => ({ tagId: '347', quando: FOTO_EM, accao: 'removida' as const }))
  )
  assert.equal(new Set(r.map((e) => e.lote)).size, 1)
  assert.equal(r[0].loteTamanho, 34)
})

// ── severidade: os casos reais ──────────────────────────────────────

test('simaopedroliveira — perde a 347 com acesso ate 2027 -> GRAVE', () => {
  const v = classificarSeveridade(
    { accao: 'removida', tipo: 'canonica', tagId: '347', tagNome: 'Alunos OGI Ativos' },
    ctx({ comAcessoPago: true, acessoAte: '2027-05-31' })
  )
  assert.equal(v.severidade, 'grave')
  assert.match(v.desalinha!, /Alunos OGI Ativos.*2027-05-31/)
})

test('os outros 33 da mesma remocao — sem acesso em curso -> aviso', () => {
  const v = classificarSeveridade(
    { accao: 'removida', tipo: 'canonica', tagId: '347', tagNome: 'Alunos OGI Ativos' },
    ctx({ comAcessoPago: false })
  )
  assert.equal(v.severidade, 'aviso')
})

test('ganhar uma obrigatoria e o estado certo, nao um alarme', () => {
  const v = classificarSeveridade(
    { accao: 'aplicada', tipo: 'canonica', tagId: '347', tagNome: 'Alunos OGI Ativos' },
    ctx()
  )
  assert.equal(v.severidade, 'aviso')
})

test('marcado "Aluno OGI Antigo" com acesso pago -> GRAVE', () => {
  const v = classificarSeveridade(
    { accao: 'aplicada', tipo: 'outra', tagId: '710', tagNome: 'Aluno OGI Antigo' },
    ctx({ comAcessoPago: true, acessoAte: '2027-05-31' })
  )
  assert.equal(v.severidade, 'grave')
  assert.match(v.desalinha!, /Aluno OGI Antigo/)
})

test('marcado "Antigo" sem acesso em curso -> aviso, e a campanha a trabalhar', () => {
  const v = classificarSeveridade(
    { accao: 'aplicada', tipo: 'outra', tagId: '710', tagNome: 'Aluno OGI Antigo' },
    ctx({ comAcessoPago: false })
  )
  assert.equal(v.severidade, 'aviso')
})

test('crisisabelfer — ganha a tag de 2605 sem compra que a pague -> GRAVE', () => {
  const v = classificarSeveridade(
    { accao: 'aplicada', tipo: 'membresia', tagId: '900', tagNome: 'Aluno OGI 2605 - Renovação Turma 5' },
    ctx({ periodosPagos: new Set(['2505']) })
  )
  assert.equal(v.severidade, 'grave')
  assert.match(v.desalinha!, /2605.*não há compra/)
})

test('duas tags de turma do mesmo periodo -> GRAVE', () => {
  const v = classificarSeveridade(
    { accao: 'aplicada', tipo: 'membresia', tagId: '901', tagNome: 'Aluno OGI 2605 - Renovação Turma 5' },
    ctx({ periodosPagos: new Set(['2605']), tagsPorPeriodo: new Map([['2605', 1]]) })
  )
  assert.equal(v.severidade, 'grave')
  assert.match(v.desalinha!, /duas tags/)
})

test('afonso.mlurdes.73 — remocao de tag de periodo reembolsado -> aviso', () => {
  const v = classificarSeveridade(
    { accao: 'removida', tipo: 'membresia', tagId: '902', tagNome: 'Aluno OGI L2509 - Turma 15' },
    ctx({ periodosPagos: new Set() })
  )
  assert.equal(v.severidade, 'aviso')
})

test('aluno inactivo e sempre ruido, seja o que for', () => {
  for (const accao of ['aplicada', 'removida'] as const) {
    const v = classificarSeveridade(
      { accao, tipo: 'canonica', tagId: '347', tagNome: 'Alunos OGI Ativos' },
      ctx({ activo: false })
    )
    assert.equal(v.severidade, 'ruido')
  }
})

test('sem timeline nao desaparece em silencio — diz que nao pode validar', () => {
  const v = classificarSeveridade(
    { accao: 'removida', tipo: 'canonica', tagId: '347', tagNome: 'Alunos OGI Ativos' },
    ctx({ temTimeline: false })
  )
  assert.equal(v.severidade, 'aviso')
  assert.equal(v.desalinha, 'sem timeline para validar')
})

// ── a lista ─────────────────────────────────────────────────────────

test('a primeira leitura da lista nunca e evento', () => {
  assert.equal(mudancaNaLista(null, true), 'primeira-leitura')
  assert.equal(mudancaNaLista(undefined, false), 'primeira-leitura')
})

test('sair da lista com acesso pago -> GRAVE; entrar -> aviso', () => {
  assert.equal(mudancaNaLista(true, false), 'saiu')
  assert.equal(mudancaNaLista(false, true), 'entrou')

  const base = { activo: true, comAcessoPago: true, acessoAte: '2027-05-31' }
  assert.equal(severidadeDaLista('saiu', base).severidade, 'grave')
  assert.equal(severidadeDaLista('entrou', base).severidade, 'aviso')
  assert.equal(severidadeDaLista('saiu', { ...base, comAcessoPago: false }).severidade, 'aviso')
  assert.equal(severidadeDaLista('saiu', { ...base, activo: false }).severidade, 'ruido')
})
