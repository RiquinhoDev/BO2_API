# Timeline de Renovação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir na nossa BD o percurso de cada aluno (compras Hotmart → tags AC → turma) numa colecção nova, e mostrá-lo na tab Renovação do backoffice com a cadeia validada à vista.

**Architecture:** O raciocínio vive em funções puras (`renewalCycles`, `turmaTagResolver`, `renewalTimeline.generator`) que não sabem o que é uma base de dados nem uma API — recebem arrays, devolvem objectos. Uma camada fina por cima (`renewalTimeline.service`) lê os espelhos locais que já existem (`hotmartsalehistories`, `acstudenttags`, `acrenewaldata`, `studentclasshistories`, `users`), chama o gerador e faz upsert em `studentrenewaltimelines`. **Zero chamadas à Hotmart ou à AC no gerador.** O front lê a colecção pronta.

**Tech Stack:** TypeScript 5.9, Express 5, Mongoose 8, Node 24. Testes com o runner nativo (`node:test`) executado por `tsx` — o repo tem `"test": "jest"` mas o **jest não está instalado**; `npx tsx --test` corre `.ts` directamente sem acrescentar dependências.

## Global Constraints

- **Nunca escrever na ActiveCampaign nem na Hotmart.** Todo o código deste plano lê espelhos locais e escreve só em MongoDB. A única excepção é a Tarefa 5, que **lê** da AC (`GET`), como o serviço já fazia.
- **O gerador é puro e determinístico.** Sem `Date.now()` dentro da lógica — a data corrente entra por parâmetro. Correr duas vezes com o mesmo input dá exactamente o mesmo output.
- **`studentclasshistories` não é escrito.** É lido para conhecer as movimentações humanas; nunca alterado por este código.
- **Quando não se sabe, não se inventa.** Turma que não resolve por convenção nem por excepção → o ciclo leva o alerta `tag-por-definir` e a turma entra em `turmasPorMapear`. Nunca gerar um nome de tag por palpite.
- **Reembolsos não geram ciclo.** Só `APPROVED` e `COMPLETE` contam como compra.
- **Produto `3100292` é a extensão** (97€), apesar de se chamar "OGI - Renovação". `167€ + 97€` no mesmo dia = 2 anos.
- **Nunca houve turmas em Abril, Agosto, Outubro nem Dezembro.** Quem compra nesses meses cai na coorte seguinte — o matching tag↔ciclo e turma↔ciclo tolera até 2 meses de avanço.
- Comentários e nomes em **português**, como o resto do repo. Ficheiros novos abrem com o cabeçalho `// ═══` e o caminho, como os vizinhos.
- Acesso à BD real faz-se por `railway run npx tsx scripts/<ficheiro>.ts` (não há `.env` local).

## Estrutura de ficheiros

**Backend — `C:\Users\sfcft\Documents\GitHub\BO2_API`**

| Ficheiro | Responsabilidade |
|---|---|
| `src/services/renewal/renewalTimeline.types.ts` | Tipos partilhados. Sem lógica. |
| `src/services/renewal/renewalCycles.ts` | Puro. Vendas → ciclos (agrupamento, anos, acesso até). |
| `src/services/renewal/turmaTagResolver.ts` | Puro. Nome de turma → nome da tag esperada. |
| `src/services/renewal/renewalTimeline.generator.ts` | Puro. Ciclos + tags + turmas → timeline com alertas e cadeia. |
| `src/services/renewal/renewalTimeline.service.ts` | Impuro. Lê espelhos, chama o gerador, faz upsert. |
| `src/models/StudentRenewalTimeline.ts` | Colecção `studentrenewaltimelines`. |
| `src/models/TurmaTagMap.ts` | Colecção `turmatagmap` (excepções turma→tag). |
| `src/routes/renewalTimeline.routes.ts` | `GET /`, `GET /status`, `POST /generate`. |
| `scripts/seed-turma-tag-map.ts` | Semeia as excepções por comparação entre pares. |

**Front — `C:\Users\sfcft\Documents\GitHub\Front`**

| Ficheiro | Responsabilidade |
|---|---|
| `src/services/renewalTimeline.service.ts` | Cliente HTTP da rota nova. |
| `src/components/student/renewal/ChainBanner.tsx` | A faixa da cadeia (4 elos). |
| `src/components/student/renewal/CiclosTab.tsx` | Tabela dos ciclos. |
| `src/components/student/renewal/TagsTab.tsx` | Estado / Percurso / Órfãs. |
| `src/components/student/RenewalDataPanel.tsx` | Passa a compor sub-separadores. |

---

### Task 1: Tipos e agrupamento de ciclos

**Files:**
- Create: `src/services/renewal/renewalTimeline.types.ts`
- Create: `src/services/renewal/renewalCycles.ts`
- Test: `src/services/renewal/__tests__/renewalCycles.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: os tipos de `renewalTimeline.types.ts`; `agruparCiclos(vendas: VendaEntrada[]): CicloBase[]`; `periodoDeData(d: Date): string`; `indiceDePeriodo(yymm: string | null | undefined): number | null`; `fimDoMes(ano: number, mes: number): Date`; `ID_PRODUTO_EXTENSAO: string`.

- [ ] **Step 1: Escrever o ficheiro de tipos**

Não tem lógica, por isso não leva teste próprio — é validado por compilar nas tarefas seguintes.

Criar `src/services/renewal/renewalTimeline.types.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalTimeline.types.ts
// Tipos da timeline de renovação. Sem lógica e sem imports de
// mongoose — para que as funções puras que os usam possam ser
// testadas sem ligar a nada.
// ════════════════════════════════════════════════════════════

/** Uma venda tal como vem do espelho `hotmartsalehistories`. */
export interface VendaEntrada {
  hotmartProductId: string | null
  productName: string | null
  transaction: string | null
  offerCode: string | null
  transactionStatus: string | null
  approvedDate: Date | null
  orderDate: Date | null
  priceValue: number | null
  currency: string | null
}

/** Uma tag do aluno tal como vem do espelho `acstudenttags`. */
export interface TagEntrada {
  tagId: string
  nome: string
  aplicadaEm: Date | null
}

/** Uma entrada em turma: movimentação registada ou a turma actual. */
export interface TurmaEntrada {
  classId: string | null
  className: string
  entrouEm: Date | null
}

export interface CompraCiclo {
  data: Date
  valor: number | null
  moeda: string | null
  produtoId: string | null
  transacao: string | null
  /** true quando é o produto 3100292 (a extensão de 97€). */
  extensao: boolean
}

export interface CicloBase {
  /** YYMM da compra âncora do ciclo. */
  periodo: string
  compras: CompraCiclo[]
  anos: 1 | 2
  acessoAte: Date
}

export type AlertaCiclo =
  | 'sem-tag'
  | 'tag-tardia'
  | 'sem-mudanca-turma'
  | 'tag-por-definir'
  | 'tag-diferente-da-turma'

export interface Ciclo extends CicloBase {
  tag: { id: string; nome: string; aplicadaEm: Date | null } | null
  turma: { nome: string; classId: string | null; entrouEm: Date | null } | null
  /** O que a convenção/excepção diz que a tag desta turma devia ser. */
  tagEsperada: string | null
  alertas: AlertaCiclo[]
}

export type Veredicto = 'ok' | 'divergente' | 'sem-dados'

export interface Cadeia {
  acCompraIgualUltimaVenda: Veredicto
  expiracaoIgualTurma: Veredicto
  tagIgualTurma: Veredicto
  ciclosSemMudancaTurma: number
  /** Há venda posterior à última sync de tags — o desvio pode ser só atraso. */
  tagsDesatualizadas: boolean
}

export interface TagOrfa {
  id: string
  nome: string
  periodo: string | null
  aplicadaEm: Date | null
}

export interface TagEstado {
  id: string
  nome: string
  aplicadaEm: Date | null
}

export interface TimelineGerada {
  ciclos: Ciclo[]
  tagsOrfas: TagOrfa[]
  tagsEstado: TagEstado[]
  cadeia: Cadeia
  /** Nomes de turma que nem a convenção nem as excepções resolveram. */
  turmasPorMapear: string[]
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/services/renewal/__tests__/renewalCycles.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparCiclos, periodoDeData, indiceDePeriodo, fimDoMes } from '../renewalCycles'
import type { VendaEntrada } from '../renewalTimeline.types'

const venda = (p: Partial<VendaEntrada>): VendaEntrada => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: null,
  offerCode: null,
  transactionStatus: 'APPROVED',
  approvedDate: null,
  orderDate: null,
  priceValue: 397,
  currency: 'EUR',
  ...p
})

test('periodoDeData devolve YYMM', () => {
  assert.equal(periodoDeData(new Date('2025-11-30T10:00:00Z')), '2511')
  assert.equal(periodoDeData(new Date('2026-01-02T23:00:00Z')), '2601')
})

test('indiceDePeriodo ordena meses e rejeita lixo', () => {
  const a = indiceDePeriodo('2512')!
  const b = indiceDePeriodo('2601')!
  assert.equal(b - a, 1)
  assert.equal(indiceDePeriodo('2513'), null)
  assert.equal(indiceDePeriodo('abc'), null)
})

test('fimDoMes devolve o último instante do mês em UTC', () => {
  assert.equal(fimDoMes(2026, 2).toISOString(), '2026-02-28T23:59:59.999Z')
})

test('percurso limpo: 3 compras anuais dao 3 ciclos de 1 ano', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), priceValue: 389, transaction: 'T1' }),
    venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), priceValue: 142, transaction: 'T2' }),
    venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), priceValue: 145, transaction: 'T3' })
  ])
  assert.equal(ciclos.length, 3)
  assert.deepEqual(ciclos.map((c) => c.periodo), ['2311', '2411', '2511'])
  assert.deepEqual(ciclos.map((c) => c.anos), [1, 1, 1])
  assert.equal(ciclos[2].acessoAte.toISOString(), '2026-11-30T23:59:59.999Z')
})

test('extensao de 2 anos: 167 mais 97 no mesmo dia sao um ciclo de 2 anos', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2024-08-18T09:00:00Z'), priceValue: 167, transaction: 'A' }),
    venda({
      approvedDate: new Date('2024-08-18T09:02:00Z'),
      priceValue: 97,
      transaction: 'B',
      hotmartProductId: '3100292'
    })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras.length, 2)
  assert.equal(ciclos[0].anos, 2)
  assert.equal(ciclos[0].compras[1].extensao, true)
  assert.equal(ciclos[0].acessoAte.toISOString(), '2026-08-31T23:59:59.999Z')
})

test('extensao sozinha vale um ano, nao dois', () => {
  const ciclos = agruparCiclos([
    venda({
      approvedDate: new Date('2025-03-10T00:00:00Z'),
      priceValue: 97,
      transaction: 'X',
      hotmartProductId: '3100292'
    })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].anos, 1)
})

test('prestacoes: 5 x 99 na mesma oferta sao um ciclo so, contado da primeira', () => {
  const meses = ['2025-12-04', '2026-01-04', '2026-02-04', '2026-03-04', '2026-04-04']
  const ciclos = agruparCiclos(
    meses.map((d, i) =>
      venda({
        approvedDate: new Date(`${d}T00:00:00Z`),
        priceValue: 99,
        offerCode: 'sub99',
        transaction: `P${i}`
      })
    )
  )
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].periodo, '2512')
  assert.equal(ciclos[0].compras.length, 5)
  assert.equal(ciclos[0].acessoAte.toISOString(), '2026-12-31T23:59:59.999Z')
})

test('renovacao anual na mesma oferta nao e confundida com prestacao', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-02-24T00:00:00Z'), priceValue: 167, offerCode: 'ren', transaction: 'A' }),
    venda({ approvedDate: new Date('2026-02-24T00:00:00Z'), priceValue: 167, offerCode: 'ren', transaction: 'B' })
  ])
  assert.equal(ciclos.length, 2)
})

test('reembolso nao gera ciclo', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2026-05-25T00:00:00Z'), transactionStatus: 'REFUNDED' }),
    venda({ approvedDate: new Date('2026-05-26T00:00:00Z'), transactionStatus: 'EXPIRED' }),
    venda({ approvedDate: new Date('2026-05-27T00:00:00Z'), transactionStatus: 'COMPLETE', transaction: 'OK' })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras[0].transacao, 'OK')
})

test('venda sem data nenhuma e ignorada, e orderDate serve de recurso', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: null, orderDate: null, transaction: 'SEM' }),
    venda({ approvedDate: null, orderDate: new Date('2025-06-03T00:00:00Z'), transaction: 'COM' })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras[0].transacao, 'COM')
})
```

- [ ] **Step 3: Correr os testes e confirmar que falham**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/renewalCycles.test.ts
```

Esperado: FAIL — `Cannot find module '../renewalCycles'`.

- [ ] **Step 4: Implementar `renewalCycles.ts`**

Criar `src/services/renewal/renewalCycles.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalCycles.ts
// Vendas da Hotmart → ciclos de acesso. Função pura: recebe
// vendas, devolve ciclos. Não lê BD nem chama APIs.
//
// Um "ciclo" é a compra (ou o conjunto de compras) que dá um
// período de acesso. Três situações obrigam a agrupar mais do
// que uma venda no mesmo ciclo:
//
//   1. mesmo dia        167€ (renovação) + 97€ (extensão) = 2 anos
//   2. mesma transação  a Hotmart repete a linha
//   3. prestações       5 x 99€ mensais da mesma oferta = 1 ciclo
//
// A regra 3 tem de distinguir uma prestação de uma renovação
// anual feita na mesma oferta ao mesmo preço. O corte está nos
// 335 dias (11 meses): prestações mensais cabem lá dentro, uma
// renovação a 12 meses não.
// ════════════════════════════════════════════════════════════

import type { VendaEntrada, CompraCiclo, CicloBase } from './renewalTimeline.types'

/** Produto 3100292 chama-se "OGI - Renovação" mas é a EXTENSÃO de 97€. */
export const ID_PRODUTO_EXTENSAO = '3100292'

/** Só estes contam como compra. Reembolso e falha não dão acesso. */
const ESTADOS_VALIDOS = new Set(['APPROVED', 'COMPLETE'])

/** Máximo entre a âncora e uma prestação para ainda ser o mesmo ciclo. */
const DIAS_MAX_PRESTACAO = 335

const DIA_MS = 24 * 60 * 60 * 1000

/** Último instante do mês, em UTC. `mes` é 1..12. */
export function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999))
}

/** Data → "YYMM" em UTC. */
export function periodoDeData(d: Date): string {
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${yy}${mm}`
}

/**
 * "YYMM" → índice de mês comparável (ano * 12 + mês). Devolve null
 * quando a string não é um período válido, para o chamador poder
 * distinguir "não sei" de "mês zero".
 */
export function indiceDePeriodo(yymm: string | null | undefined): number | null {
  if (!yymm || !/^\d{4}$/.test(yymm)) return null
  const yy = Number(yymm.slice(0, 2))
  const mm = Number(yymm.slice(2, 4))
  if (mm < 1 || mm > 12) return null
  return (2000 + yy) * 12 + mm
}

function dataDaVenda(v: VendaEntrada): Date | null {
  const d = v.approvedDate ?? v.orderDate
  if (!d) return null
  const data = d instanceof Date ? d : new Date(d)
  return Number.isNaN(data.getTime()) ? null : data
}

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * Decide se `compra` pertence ao ciclo já aberto. `ancora` é a
 * primeira compra desse ciclo, `ultima` a mais recente lá dentro.
 */
function pertenceAoMesmoCiclo(
  compra: CompraCiclo,
  ancora: CompraCiclo,
  ultima: CompraCiclo,
  vendaAncora: VendaEntrada,
  vendaCompra: VendaEntrada
): boolean {
  if (compra.transacao && compra.transacao === ultima.transacao) return true
  if (mesmoDia(compra.data, ancora.data)) return true

  // prestação: mesma oferta, mesmo produto, mesmo valor, dentro da janela
  const mesmaOferta = !!vendaAncora.offerCode && vendaAncora.offerCode === vendaCompra.offerCode
  const mesmoProduto = compra.produtoId === ancora.produtoId
  const mesmoValor = compra.valor != null && compra.valor === ancora.valor
  const dias = (compra.data.getTime() - ancora.data.getTime()) / DIA_MS
  return mesmaOferta && mesmoProduto && mesmoValor && dias < DIAS_MAX_PRESTACAO
}

/**
 * Agrupa as vendas válidas em ciclos, por ordem cronológica.
 * O acesso conta sempre da compra ÂNCORA (a primeira do ciclo) —
 * é ela que define o período e a data de fim.
 */
export function agruparCiclos(vendas: VendaEntrada[]): CicloBase[] {
  const validas = vendas
    .filter((v) => ESTADOS_VALIDOS.has(String(v.transactionStatus ?? '').toUpperCase()))
    .map((v) => ({ venda: v, data: dataDaVenda(v) }))
    .filter((x): x is { venda: VendaEntrada; data: Date } => x.data !== null)
    .sort((a, b) => a.data.getTime() - b.data.getTime())

  const grupos: Array<{ compras: CompraCiclo[]; vendas: VendaEntrada[] }> = []

  for (const { venda, data } of validas) {
    const compra: CompraCiclo = {
      data,
      valor: venda.priceValue,
      moeda: venda.currency,
      produtoId: venda.hotmartProductId,
      transacao: venda.transaction,
      extensao: venda.hotmartProductId === ID_PRODUTO_EXTENSAO
    }

    const actual = grupos[grupos.length - 1]
    if (
      actual &&
      pertenceAoMesmoCiclo(
        compra,
        actual.compras[0],
        actual.compras[actual.compras.length - 1],
        actual.vendas[0],
        venda
      )
    ) {
      actual.compras.push(compra)
      actual.vendas.push(venda)
    } else {
      grupos.push({ compras: [compra], vendas: [venda] })
    }
  }

  return grupos.map(({ compras }) => {
    const ancora = compras[0]
    // 2 anos só quando a extensão acompanha uma compra de outro
    // produto — a extensão sozinha vale 1 ano como qualquer outra.
    const temExtensao = compras.some((c) => c.extensao)
    const temOutro = compras.some((c) => !c.extensao)
    const anos: 1 | 2 = temExtensao && temOutro ? 2 : 1

    return {
      periodo: periodoDeData(ancora.data),
      compras,
      anos,
      acessoAte: fimDoMes(ancora.data.getUTCFullYear() + anos, ancora.data.getUTCMonth() + 1)
    }
  })
}
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/renewalCycles.test.ts
```

Esperado: `pass 10`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/services/renewal/renewalTimeline.types.ts src/services/renewal/renewalCycles.ts src/services/renewal/__tests__/renewalCycles.test.ts && git commit -m "feat(renovacao): agrupar vendas da Hotmart em ciclos de acesso"
```

---

### Task 2: Resolver turma → tag esperada

**Files:**
- Create: `src/services/renewal/turmaTagResolver.ts`
- Test: `src/services/renewal/__tests__/turmaTagResolver.test.ts`

**Interfaces:**
- Consumes: `parseTurmaName(className: string): ParsedTurma` de `src/services/renewal/turmaParser.ts` (já existe; dá `turmaNumbers: number[]`, `periodYYMM: string | null`, `isRenov: boolean`, `accessYears: number`).
- Produces: `normalizarNomeTurma(s: string): string`; `resolverTagDaTurma(className: string, excepcoes?: Map<string, string>): ResolucaoTag`, com `ResolucaoTag = { tagNome: string | null; origem: 'excepcao' | 'convencao' | null; motivo: 'sem-periodo' | 'sem-numero-turma' | 'turma-agrupada' | null }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/renewal/__tests__/turmaTagResolver.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverTagDaTurma, normalizarNomeTurma } from '../turmaTagResolver'

test('turma base leva o prefixo L', () => {
  const r = resolverTagDaTurma('Turma 15 | 2509')
  assert.equal(r.tagNome, 'Aluno OGI L2509 - Turma 15')
  assert.equal(r.origem, 'convencao')
})

test('turma de renovacao com numero nao leva L', () => {
  const r = resolverTagDaTurma('Turma 10 [renov] + REITs | 2505')
  assert.equal(r.tagNome, 'Aluno OGI 2505 - Renovação Turma 10')
})

test('turma de renovacao mensal (formato novo) nao leva numero', () => {
  const r = resolverTagDaTurma('Turma Renovação | 2606')
  assert.equal(r.tagNome, 'Aluno OGI 2606 - Renovação')
})

test('2 anos no nome da turma vira [2anos] na tag, sem espaco', () => {
  const r = resolverTagDaTurma('Turma 14 [renov] [2 anos] | 2505')
  assert.equal(r.tagNome, 'Aluno OGI 2505 - Renovação Turma 14 [2anos]')
})

test('turma agrupada nao e resolvida por convencao', () => {
  const r = resolverTagDaTurma('Turmas 1, 2 e 3 [3a renov] | 2605')
  assert.equal(r.tagNome, null)
  assert.equal(r.motivo, 'turma-agrupada')
})

test('turma sem periodo nao e resolvida', () => {
  const r = resolverTagDaTurma('Turma Pb4KBr2WOX')
  assert.equal(r.tagNome, null)
  assert.equal(r.motivo, 'sem-periodo')
})

test('turma base sem numero nao e resolvida', () => {
  const r = resolverTagDaTurma('Turma antigos alunos | 2606')
  assert.equal(r.tagNome, null)
  assert.equal(r.motivo, 'sem-numero-turma')
})

test('a excepcao ganha a convencao', () => {
  const excepcoes = new Map([
    [normalizarNomeTurma('Turma 2 [renov] | 2306'), 'Aluno OGI 2302 - Renovação Turma 2']
  ])
  const r = resolverTagDaTurma('Turma 2 [renov]  |  2306', excepcoes)
  assert.equal(r.tagNome, 'Aluno OGI 2302 - Renovação Turma 2')
  assert.equal(r.origem, 'excepcao')
})

test('a excepcao resolve mesmo uma turma agrupada', () => {
  const excepcoes = new Map([
    [normalizarNomeTurma('Turmas 1, 2 e 3 [3a renov] | 2605'), 'Aluno OGI 2605 - Renovação Turma 1 a 5']
  ])
  const r = resolverTagDaTurma('Turmas 1, 2 e 3 [3a renov] | 2605', excepcoes)
  assert.equal(r.tagNome, 'Aluno OGI 2605 - Renovação Turma 1 a 5')
  assert.equal(r.origem, 'excepcao')
})

test('normalizarNomeTurma colapsa espacos e caixa', () => {
  assert.equal(normalizarNomeTurma('  Turma  15   |  2509 '), 'turma 15 | 2509')
})
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/turmaTagResolver.test.ts
```

Esperado: FAIL — `Cannot find module '../turmaTagResolver'`.

- [ ] **Step 3: Implementar `turmaTagResolver.ts`**

Criar `src/services/renewal/turmaTagResolver.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/turmaTagResolver.ts
// Nome da turma → nome da tag que essa turma devia ter na AC.
// Puro: as excepções entram por parâmetro, não são lidas da BD.
//
// Duas camadas, por esta ordem:
//
//   1. excepção   o que está em `turmatagmap` manda sempre
//   2. convenção  Turma N | YYMM         → Aluno OGI LYYMM - Turma N
//                 Turma N [renov] | YYMM → Aluno OGI YYMM - Renovação Turma N
//                 Turma Renovação | YYMM → Aluno OGI YYMM - Renovação
//
// Quando nenhuma resolve, devolve null com um motivo. NUNCA
// inventa um nome: uma tag errada aqui propaga-se a um alerta
// falso na ficha do aluno.
//
// Detalhe que morde: a turma escreve "[2 anos]" com espaço, a tag
// escreve "[2anos]" sem espaço.
// ════════════════════════════════════════════════════════════

import { parseTurmaName } from './turmaParser'

export interface ResolucaoTag {
  tagNome: string | null
  origem: 'excepcao' | 'convencao' | null
  /** Porque é que não resolveu. null quando resolveu. */
  motivo: 'sem-periodo' | 'sem-numero-turma' | 'turma-agrupada' | null
}

/** Chave de comparação de nomes de turma: sem caixa, sem espaços a mais. */
export function normalizarNomeTurma(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

const MENCIONA_RENOVACAO = /renova(ç|c)(ã|a)o/i

export function resolverTagDaTurma(
  className: string,
  excepcoes: Map<string, string> = new Map()
): ResolucaoTag {
  const excepcao = excepcoes.get(normalizarNomeTurma(className))
  if (excepcao) return { tagNome: excepcao, origem: 'excepcao', motivo: null }

  const parsed = parseTurmaName(className)
  if (!parsed.periodYYMM) return { tagNome: null, origem: null, motivo: 'sem-periodo' }

  const sufixo = parsed.accessYears === 2 ? ' [2anos]' : ''
  const ehRenovacao = parsed.isRenov || MENCIONA_RENOVACAO.test(className)

  if (parsed.turmaNumbers.length > 1) {
    return { tagNome: null, origem: null, motivo: 'turma-agrupada' }
  }

  if (ehRenovacao) {
    // Formato novo ("Turma Renovação | 2606") não tem número nenhum.
    const nome =
      parsed.turmaNumbers.length === 1
        ? `Aluno OGI ${parsed.periodYYMM} - Renovação Turma ${parsed.turmaNumbers[0]}${sufixo}`
        : `Aluno OGI ${parsed.periodYYMM} - Renovação${sufixo}`
    return { tagNome: nome, origem: 'convencao', motivo: null }
  }

  if (parsed.turmaNumbers.length === 0) {
    return { tagNome: null, origem: null, motivo: 'sem-numero-turma' }
  }

  return {
    tagNome: `Aluno OGI L${parsed.periodYYMM} - Turma ${parsed.turmaNumbers[0]}${sufixo}`,
    origem: 'convencao',
    motivo: null
  }
}
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/turmaTagResolver.test.ts
```

Esperado: `pass 10`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/services/renewal/turmaTagResolver.ts src/services/renewal/__tests__/turmaTagResolver.test.ts && git commit -m "feat(renovacao): resolver o nome da tag esperada a partir do nome da turma"
```

---

### Task 3: O gerador puro

**Files:**
- Create: `src/services/renewal/renewalTimeline.generator.ts`
- Test: `src/services/renewal/__tests__/renewalTimeline.generator.test.ts`

**Interfaces:**
- Consumes: `agruparCiclos`, `indiceDePeriodo` de `./renewalCycles`; `resolverTagDaTurma` de `./turmaTagResolver`; `parseTurmaName` de `./turmaParser`; os tipos de `./renewalTimeline.types`.
- Produces: `gerarTimeline(entrada: EntradaGerador): TimelineGerada`; `periodoDaTag(nome: string): string | null`; `EntradaGerador` (interface exportada).

**Nota sobre o desenho:** o spec descreve `ciclos`, `tagsOrfas` e `tagsEstado`. Este plano acrescenta ao documento dois campos que o spec pede na secção do Painel mas não lista no modelo: `cadeia` (os quatro veredictos da faixa) e `turmasPorMapear`. Ficam calculados no gerador para o painel não ter de repetir a lógica.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/renewal/__tests__/renewalTimeline.generator.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gerarTimeline, periodoDaTag, type EntradaGerador } from '../renewalTimeline.generator'
import type { VendaEntrada } from '../renewalTimeline.types'

const AGORA = new Date('2026-08-21T12:00:00Z')

const venda = (p: Partial<VendaEntrada>): VendaEntrada => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: null,
  offerCode: null,
  transactionStatus: 'APPROVED',
  approvedDate: null,
  orderDate: null,
  priceValue: 397,
  currency: 'EUR',
  ...p
})

const entrada = (p: Partial<EntradaGerador>): EntradaGerador => ({
  vendas: [],
  tags: [],
  turmaAtual: null,
  movimentacoes: [],
  acExpiracao: null,
  acDataCompra: null,
  excepcoesTurmaTag: new Map(),
  fontes: { vendas: AGORA, tags: AGORA, ac: AGORA },
  agora: AGORA,
  ...p
})

test('periodoDaTag apanha os dois formatos de tag', () => {
  assert.equal(periodoDaTag('Aluno OGI L2311 - Turma 7'), '2311')
  assert.equal(periodoDaTag('Aluno OGI 2606 - Renovação'), '2606')
  assert.equal(periodoDaTag('Alunos OGI Ativos'), null)
})

test('percurso limpo: 3 ciclos, 3 tags, 3 turmas, zero alertas', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' }),
        venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: new Date('2023-11-06T00:00:00Z') },
        { tagId: '2', nome: 'Aluno OGI 2411 - Renovação Turma 7', aplicadaEm: new Date('2024-11-06T00:00:00Z') },
        { tagId: '3', nome: 'Aluno OGI 2511 - Renovação Turma 7', aplicadaEm: new Date('2025-11-30T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c3', className: 'Turma 7 [2a renov] | 2511', entrouEm: new Date('2025-11-30T00:00:00Z') },
      movimentacoes: [
        { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: new Date('2023-11-06T00:00:00Z') },
        { classId: 'c2', className: 'Turma 7 [renov] | 2411', entrouEm: new Date('2024-11-06T00:00:00Z') }
      ],
      acDataCompra: new Date('2025-11-30T00:00:00Z'),
      acExpiracao: new Date('2026-11-30T00:00:00Z')
    })
  )

  assert.equal(t.ciclos.length, 3)
  assert.deepEqual(t.ciclos.map((c) => c.tag?.id), ['1', '2', '3'])
  assert.deepEqual(t.ciclos.map((c) => c.turma?.classId), ['c1', 'c2', 'c3'])
  assert.deepEqual(t.ciclos.flatMap((c) => c.alertas), [])
  assert.equal(t.cadeia.acCompraIgualUltimaVenda, 'ok')
  assert.equal(t.cadeia.expiracaoIgualTurma, 'ok')
  assert.equal(t.cadeia.tagIgualTurma, 'ok')
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 0)
})

test('ciclo sem mudanca de turma: 3 compras, 1 turma so', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' }),
        venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: new Date('2023-11-06T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: new Date('2023-11-06T00:00:00Z') }
    })
  )
  assert.equal(t.ciclos.length, 3)
  assert.ok(t.ciclos[1].alertas.includes('sem-mudanca-turma'))
  assert.ok(t.ciclos[1].alertas.includes('sem-tag'))
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 2)
})

test('tag tardia: cdate a 14 meses da compra (carimbo de 2026-08-07)', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', aplicadaEm: new Date('2026-08-07T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )
  assert.equal(t.ciclos.length, 1)
  assert.equal(t.ciclos[0].tag?.id, '9')
  assert.ok(t.ciclos[0].alertas.includes('tag-tardia'))
})

test('tag orfa: tag de renovacao sem compra que a justifique', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', aplicadaEm: null },
        { tagId: '10', nome: 'Aluno OGI 2607 - Renovação Turma 6', aplicadaEm: new Date('2026-07-02T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )
  assert.equal(t.tagsOrfas.length, 1)
  assert.equal(t.tagsOrfas[0].id, '10')
  assert.equal(t.tagsOrfas[0].periodo, '2607')
})

test('tags de estado ficam a parte e nunca entram em ciclos', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '347', nome: 'Alunos OGI Ativos', aplicadaEm: new Date('2025-05-20T00:00:00Z') },
        { tagId: '676', nome: 'OGI - Aluno ou Ex-Aluno', aplicadaEm: null },
        { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )
  assert.deepEqual(t.tagsEstado.map((x) => x.id).sort(), ['347', '676'])
  assert.equal(t.tagsOrfas.length, 0)
  assert.equal(t.ciclos[0].tag?.id, '9')
})

test('compra sem tag: ciclo pago e nao marcado', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-07-03T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2607', entrouEm: null }
    })
  )
  assert.ok(t.ciclos[0].alertas.includes('sem-tag'))
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2607 - Renovação')
})

test('mes sem coorte: compra em Dezembro cai na turma de Janeiro', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2024-12-03T00:00:00Z'), transaction: 'A', priceValue: 167 }),
        venda({
          approvedDate: new Date('2024-12-03T00:10:00Z'),
          transaction: 'B',
          priceValue: 97,
          hotmartProductId: '3100292'
        })
      ],
      tags: [{ tagId: '5', nome: 'Aluno OGI 2601 - Renovação', aplicadaEm: null }],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2601', entrouEm: null },
      acExpiracao: new Date('2027-01-31T00:00:00Z')
    })
  )
  assert.equal(t.ciclos.length, 1)
  assert.equal(t.ciclos[0].periodo, '2412')
  assert.equal(t.ciclos[0].anos, 2)
  assert.equal(t.ciclos[0].tag?.id, '5')
  assert.equal(t.ciclos[0].turma?.classId, 'c')
  assert.deepEqual(t.ciclos[0].alertas, [])
})

test('turma sem mapa: alerta tag-por-definir e entrada em turmasPorMapear', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-05-04T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turmas 1, 2 e 3 [3a renov] | 2605', entrouEm: null }
    })
  )
  assert.ok(t.ciclos[0].alertas.includes('tag-por-definir'))
  assert.deepEqual(t.turmasPorMapear, ['Turmas 1, 2 e 3 [3a renov] | 2605'])
  assert.equal(t.cadeia.tagIgualTurma, 'sem-dados')
})

test('tag diferente da turma: a turma diz uma coisa, a tag diz outra', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-06-10T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '684', nome: 'Aluno OGI 2607 - Renovação Turma 6', aplicadaEm: new Date('2026-06-11T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2606', entrouEm: null }
    })
  )
  assert.equal(t.ciclos[0].tag?.id, '684')
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2606 - Renovação')
  assert.ok(t.ciclos[0].alertas.includes('tag-diferente-da-turma'))
  assert.equal(t.cadeia.tagIgualTurma, 'divergente')
})

test('reembolso: sem ciclos e sem alertas inventados', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-05-25T00:00:00Z'), transactionStatus: 'REFUNDED' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turma 18 | 2605', entrouEm: null }
    })
  )
  assert.equal(t.ciclos.length, 0)
  assert.equal(t.cadeia.acCompraIgualUltimaVenda, 'sem-dados')
  assert.equal(t.cadeia.tagIgualTurma, 'sem-dados')
})

test('expiracao divergente da turma marca a cadeia', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-09-10T00:00:00Z'), transaction: 'A' })],
      tags: [{ tagId: '1', nome: 'Aluno OGI L2509 - Turma 15', aplicadaEm: null }],
      turmaAtual: { classId: 'c', className: 'Turma 15 | 2509', entrouEm: null },
      acExpiracao: new Date('2026-08-31T00:00:00Z')
    })
  )
  assert.equal(t.cadeia.expiracaoIgualTurma, 'divergente')
})

test('venda posterior a sync de tags levanta a bandeira de desactualizado', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-08-20T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: null,
      fontes: { vendas: AGORA, tags: new Date('2026-08-01T00:00:00Z'), ac: AGORA }
    })
  )
  assert.equal(t.cadeia.tagsDesatualizadas, true)
})

test('correr duas vezes da exactamente o mesmo resultado', () => {
  const e = entrada({
    vendas: [venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })],
    tags: [{ tagId: '3', nome: 'Aluno OGI 2511 - Renovação Turma 7', aplicadaEm: null }],
    turmaAtual: { classId: 'c3', className: 'Turma 7 [2a renov] | 2511', entrouEm: null }
  })
  assert.deepEqual(JSON.parse(JSON.stringify(gerarTimeline(e))), JSON.parse(JSON.stringify(gerarTimeline(e))))
})
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/renewalTimeline.generator.test.ts
```

Esperado: FAIL — `Cannot find module '../renewalTimeline.generator'`.

- [ ] **Step 3: Implementar `renewalTimeline.generator.ts`**

Criar `src/services/renewal/renewalTimeline.generator.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalTimeline.generator.ts
// O gerador. Puro e determinístico: recebe as vendas, as tags, a
// turma e as movimentações de UM aluno e devolve a timeline.
// Não lê BD, não chama APIs, não olha para o relógio (a data
// corrente entra por parâmetro).
//
// A linha do tempo é a das VENDAS. Tags e turmas penduram-se
// nela, nunca o contrário — assim um desvio aponta sempre para
// quem se desviou.
//
// O emparelhamento é por PERÍODO, não por data: a tag e a turma
// carregam o YYMM da coorte, e nunca houve coortes em Abril,
// Agosto, Outubro nem Dezembro — quem compra nesses meses cai na
// seguinte. Daí a tolerância de 2 meses para a frente.
// ════════════════════════════════════════════════════════════

import { agruparCiclos, indiceDePeriodo } from './renewalCycles'
import { resolverTagDaTurma, normalizarNomeTurma } from './turmaTagResolver'
import { parseTurmaName } from './turmaParser'
import type {
  VendaEntrada,
  TagEntrada,
  TurmaEntrada,
  Ciclo,
  AlertaCiclo,
  Cadeia,
  Veredicto,
  TagOrfa,
  TagEstado,
  TimelineGerada
} from './renewalTimeline.types'

export interface EntradaGerador {
  vendas: VendaEntrada[]
  tags: TagEntrada[]
  turmaAtual: TurmaEntrada | null
  /** Movimentações registadas em `studentclasshistories`, mais antiga primeiro. */
  movimentacoes: TurmaEntrada[]
  acExpiracao: Date | null
  acDataCompra: Date | null
  excepcoesTurmaTag: Map<string, string>
  fontes: { vendas: Date | null; tags: Date | null; ac: Date | null }
  agora: Date
}

/** Uma coorte a mais de distância ainda é a mesma; três já não. */
const TOLERANCIA_MESES = 2

/** Acima disto a tag foi posta muito depois da compra que representa. */
const DIAS_TAG_TARDIA = 90

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Extrai o YYMM de um nome de tag. Aceita os dois formatos:
 * "Aluno OGI L2311 - Turma 7" e "Aluno OGI 2606 - Renovação".
 * Tags de estado ("Alunos OGI Ativos") não têm período — null.
 */
export function periodoDaTag(nome: string): string | null {
  const m = String(nome).match(/\bL?(\d{4})\b/)
  if (!m) return null
  const mm = Number(m[1].slice(2, 4))
  if (mm < 1 || mm > 12) return null
  return m[1]
}

const MENCIONA_PERCURSO = /turma|renova(ç|c)(ã|a)o/i

/** Tag de percurso = tem período E fala de turma/renovação. */
function ehTagDePercurso(nome: string): boolean {
  return periodoDaTag(nome) !== null && MENCIONA_PERCURSO.test(nome)
}

/**
 * Emparelha candidatos (tags ou turmas) com ciclos, um para um,
 * pela distância em meses entre o período do candidato e o do
 * ciclo. Só conta 0..TOLERANCIA_MESES para a frente — um período
 * ANTERIOR ao ciclo nunca pertence a esse ciclo.
 *
 * Greedy pela distância: a correspondência mais próxima ganha,
 * e ordena-se por índice para o resultado não depender da ordem
 * de entrada (o gerador tem de ser determinístico).
 */
function emparelhar(
  periodosCiclo: Array<string>,
  candidatos: Array<{ indice: number; periodo: string | null }>
): Map<number, number> {
  const pares: Array<{ ciclo: number; candidato: number; dist: number }> = []

  periodosCiclo.forEach((pc, iCiclo) => {
    const idxCiclo = indiceDePeriodo(pc)
    if (idxCiclo === null) return
    for (const cand of candidatos) {
      const idxCand = indiceDePeriodo(cand.periodo)
      if (idxCand === null) continue
      const dist = idxCand - idxCiclo
      if (dist < 0 || dist > TOLERANCIA_MESES) continue
      pares.push({ ciclo: iCiclo, candidato: cand.indice, dist })
    }
  })

  pares.sort((a, b) => a.dist - b.dist || a.ciclo - b.ciclo || a.candidato - b.candidato)

  const porCiclo = new Map<number, number>()
  const usados = new Set<number>()
  for (const p of pares) {
    if (porCiclo.has(p.ciclo) || usados.has(p.candidato)) continue
    porCiclo.set(p.ciclo, p.candidato)
    usados.add(p.candidato)
  }
  return porCiclo
}

/** Duas datas no mesmo dia (UTC). */
function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/** Duas datas no mesmo mês (UTC). */
function mesmoMes(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

export function gerarTimeline(e: EntradaGerador): TimelineGerada {
  const base = agruparCiclos(e.vendas)

  // ── turmas: movimentações + turma actual, sem duplicar classId ──
  const turmas: TurmaEntrada[] = []
  const vistos = new Set<string>()
  for (const t of [...e.movimentacoes, ...(e.turmaAtual ? [e.turmaAtual] : [])]) {
    const chave = t.classId ?? normalizarNomeTurma(t.className)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    turmas.push(t)
  }

  const periodosCiclo = base.map((c) => c.periodo)

  const tagsPercurso = e.tags
    .map((t, i) => ({ tag: t, indice: i }))
    .filter((x) => ehTagDePercurso(x.tag.nome))

  const parTags = emparelhar(
    periodosCiclo,
    tagsPercurso.map((x) => ({ indice: x.indice, periodo: periodoDaTag(x.tag.nome) }))
  )

  const parTurmas = emparelhar(
    periodosCiclo,
    turmas.map((t, i) => ({ indice: i, periodo: parseTurmaName(t.className).periodYYMM }))
  )

  const turmasPorMapear = new Set<string>()

  const ciclos: Ciclo[] = base.map((c, i) => {
    const iTag = parTags.get(i)
    const tag = iTag === undefined ? null : e.tags[iTag]
    const iTurma = parTurmas.get(i)
    const turma = iTurma === undefined ? null : turmas[iTurma]

    const resolucao = turma ? resolverTagDaTurma(turma.className, e.excepcoesTurmaTag) : null
    if (turma && resolucao && !resolucao.tagNome) turmasPorMapear.add(turma.className)

    const alertas: AlertaCiclo[] = []
    if (!tag) alertas.push('sem-tag')
    if (!turma) alertas.push('sem-mudanca-turma')
    if (turma && resolucao && !resolucao.tagNome) alertas.push('tag-por-definir')

    if (tag?.aplicadaEm) {
      const dias = (tag.aplicadaEm.getTime() - c.compras[0].data.getTime()) / DIA_MS
      if (dias > DIAS_TAG_TARDIA) alertas.push('tag-tardia')
    }

    if (tag && resolucao?.tagNome && normalizarNomeTurma(tag.nome) !== normalizarNomeTurma(resolucao.tagNome)) {
      alertas.push('tag-diferente-da-turma')
    }

    return {
      ...c,
      tag: tag ? { id: tag.tagId, nome: tag.nome, aplicadaEm: tag.aplicadaEm } : null,
      turma: turma ? { nome: turma.className, classId: turma.classId, entrouEm: turma.entrouEm } : null,
      tagEsperada: resolucao?.tagNome ?? null,
      alertas
    }
  })

  const idsEmCiclos = new Set(ciclos.map((c) => c.tag?.id).filter(Boolean) as string[])

  const tagsOrfas: TagOrfa[] = tagsPercurso
    .filter((x) => !idsEmCiclos.has(x.tag.tagId))
    .map((x) => ({
      id: x.tag.tagId,
      nome: x.tag.nome,
      periodo: periodoDaTag(x.tag.nome),
      aplicadaEm: x.tag.aplicadaEm
    }))

  const tagsEstado: TagEstado[] = e.tags
    .filter((t) => !ehTagDePercurso(t.nome))
    .map((t) => ({ id: t.tagId, nome: t.nome, aplicadaEm: t.aplicadaEm }))

  return {
    ciclos,
    tagsOrfas,
    tagsEstado,
    cadeia: calcularCadeia(e, ciclos),
    turmasPorMapear: [...turmasPorMapear]
  }
}

/**
 * Os quatro elos da faixa. Cada um compara-se com o de cima na
 * hierarquia — nunca com o de baixo.
 */
function calcularCadeia(e: EntradaGerador, ciclos: Ciclo[]): Cadeia {
  const ultimo = ciclos[ciclos.length - 1] ?? null

  let acCompraIgualUltimaVenda: Veredicto = 'sem-dados'
  if (e.acDataCompra && ultimo) {
    acCompraIgualUltimaVenda = mesmoDia(e.acDataCompra, ultimo.compras[0].data) ? 'ok' : 'divergente'
  }

  let expiracaoIgualTurma: Veredicto = 'sem-dados'
  const fimDaTurma = e.turmaAtual ? parseTurmaName(e.turmaAtual.className).accessEndOgi : null
  if (e.acExpiracao && fimDaTurma) {
    expiracaoIgualTurma = mesmoMes(e.acExpiracao, fimDaTurma) ? 'ok' : 'divergente'
  }

  let tagIgualTurma: Veredicto = 'sem-dados'
  if (ultimo && ultimo.tagEsperada) {
    tagIgualTurma =
      ultimo.tag && normalizarNomeTurma(ultimo.tag.nome) === normalizarNomeTurma(ultimo.tagEsperada)
        ? 'ok'
        : 'divergente'
  }

  // Uma venda mais recente do que a última sync de tags explica
  // sozinha um desvio — dizê-lo evita acusar quem só está à espera.
  const ultimaVenda = ultimo?.compras[ultimo.compras.length - 1]?.data ?? null
  const tagsDesatualizadas = !!(ultimaVenda && e.fontes.tags && ultimaVenda.getTime() > e.fontes.tags.getTime())

  return {
    acCompraIgualUltimaVenda,
    expiracaoIgualTurma,
    tagIgualTurma,
    ciclosSemMudancaTurma: ciclos.filter((c) => c.alertas.includes('sem-mudanca-turma')).length,
    tagsDesatualizadas
  }
}

export default gerarTimeline
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/renewalTimeline.generator.test.ts
```

Esperado: `pass 14`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/services/renewal/renewalTimeline.generator.ts src/services/renewal/__tests__/renewalTimeline.generator.test.ts && git commit -m "feat(renovacao): gerador puro da timeline com alertas e cadeia"
```

---

### Task 4: Modelos `StudentRenewalTimeline` e `TurmaTagMap`

**Files:**
- Create: `src/models/StudentRenewalTimeline.ts`
- Create: `src/models/TurmaTagMap.ts`
- Test: `src/services/renewal/__tests__/models.timeline.test.ts`

**Interfaces:**
- Consumes: os tipos de `src/services/renewal/renewalTimeline.types.ts`.
- Produces: `StudentRenewalTimeline` (default export, colecção `studentrenewaltimelines`); `TurmaTagMap` (default export, colecção `turmatagmap`); interfaces `IStudentRenewalTimeline` e `ITurmaTagMap`.

- [ ] **Step 1: Escrever os testes que falham**

O `mongodb-memory-server` não está instalado, por isso o teste verifica o **schema** (caminhos, índices, defaults) sem ligar a nenhuma base de dados. É o que interessa validar aqui: que os campos existem com os tipos certos e que `userId` é único.

Criar `src/services/renewal/__tests__/models.timeline.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import StudentRenewalTimeline from '../../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../../models/TurmaTagMap'

test('a timeline guarda na coleccao studentrenewaltimelines', () => {
  assert.equal(StudentRenewalTimeline.collection.name, 'studentrenewaltimelines')
})

test('userId da timeline e unico', () => {
  const caminho: any = StudentRenewalTimeline.schema.path('userId')
  assert.equal(caminho.options.unique, true)
})

test('a timeline tem os campos do desenho', () => {
  const s = StudentRenewalTimeline.schema
  for (const campo of ['email', 'ciclos', 'tagsOrfas', 'tagsEstado', 'cadeia', 'turmasPorMapear', 'geradoEm', 'fontes']) {
    assert.ok(s.path(campo) || s.nested[campo], `falta o campo ${campo}`)
  }
})

test('o ciclo guarda compras, anos, acessoAte, tag, turma e alertas', () => {
  const ciclo: any = StudentRenewalTimeline.schema.path('ciclos')
  const sub = ciclo.schema
  for (const campo of ['periodo', 'compras', 'anos', 'acessoAte', 'tag', 'turma', 'tagEsperada', 'alertas']) {
    assert.ok(sub.path(campo), `falta o campo ${campo} no ciclo`)
  }
})

test('o mapa de turmas guarda na coleccao turmatagmap com chave unica', () => {
  assert.equal(TurmaTagMap.collection.name, 'turmatagmap')
  const caminho: any = TurmaTagMap.schema.path('classNameNormalizado')
  assert.equal(caminho.options.unique, true)
})
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/models.timeline.test.ts
```

Esperado: FAIL — `Cannot find module '../../../models/StudentRenewalTimeline'`.

- [ ] **Step 3: Implementar `StudentRenewalTimeline.ts`**

Criar `src/models/StudentRenewalTimeline.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/models/StudentRenewalTimeline.ts
// O percurso de renovação de um aluno, reconstruído a partir das
// vendas da Hotmart, das tags da AC e das turmas. Um documento
// por aluno, ligado por userId.
//
// É um DERIVADO: cada corrida do gerador substitui o documento
// inteiro. Nada aqui é fonte de verdade e nada aqui se edita à
// mão — para mudar o resultado, muda-se a fonte e regenera-se.
//
// Não confundir com `studentclasshistories`, que continua a ser
// o registo das movimentações feitas por pessoas. Esse é lido,
// nunca escrito, por este sistema.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IStudentRenewalTimeline extends Document {
  userId: mongoose.Types.ObjectId
  email: string

  ciclos: Array<{
    periodo: string
    compras: Array<{
      data: Date
      valor: number | null
      moeda: string | null
      produtoId: string | null
      transacao: string | null
      extensao: boolean
    }>
    anos: number
    acessoAte: Date
    tag: { id: string; nome: string; aplicadaEm: Date | null } | null
    turma: { nome: string; classId: string | null; entrouEm: Date | null } | null
    tagEsperada: string | null
    alertas: string[]
  }>

  tagsOrfas: Array<{ id: string; nome: string; periodo: string | null; aplicadaEm: Date | null }>
  tagsEstado: Array<{ id: string; nome: string; aplicadaEm: Date | null }>

  cadeia: {
    acCompraIgualUltimaVenda: string
    expiracaoIgualTurma: string
    tagIgualTurma: string
    ciclosSemMudancaTurma: number
    tagsDesatualizadas: boolean
  }

  turmasPorMapear: string[]

  geradoEm: Date
  fontes: { vendas: Date | null; tags: Date | null; ac: Date | null }

  createdAt: Date
  updatedAt: Date
}

const compraSchema = new Schema(
  {
    data: { type: Date, required: true },
    valor: { type: Number, default: null },
    moeda: { type: String, default: null },
    produtoId: { type: String, default: null },
    transacao: { type: String, default: null },
    extensao: { type: Boolean, default: false }
  },
  { _id: false }
)

const tagDoCicloSchema = new Schema(
  {
    id: { type: String, required: true },
    nome: { type: String, required: true },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const turmaDoCicloSchema = new Schema(
  {
    nome: { type: String, required: true },
    classId: { type: String, default: null },
    entrouEm: { type: Date, default: null }
  },
  { _id: false }
)

const cicloSchema = new Schema(
  {
    periodo: { type: String, required: true },
    compras: { type: [compraSchema], default: [] },
    anos: { type: Number, default: 1 },
    acessoAte: { type: Date, required: true },
    tag: { type: tagDoCicloSchema, default: null },
    turma: { type: turmaDoCicloSchema, default: null },
    tagEsperada: { type: String, default: null },
    alertas: { type: [String], default: [] }
  },
  { _id: false }
)

const tagOrfaSchema = new Schema(
  {
    id: { type: String, required: true },
    nome: { type: String, required: true },
    periodo: { type: String, default: null },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const tagEstadoSchema = new Schema(
  {
    id: { type: String, required: true },
    nome: { type: String, required: true },
    aplicadaEm: { type: Date, default: null }
  },
  { _id: false }
)

const studentRenewalTimelineSchema = new Schema<IStudentRenewalTimeline>(
  {
    // unique já cria o índice — juntar index: true dá aviso de duplicado
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },

    ciclos: { type: [cicloSchema], default: [] },
    tagsOrfas: { type: [tagOrfaSchema], default: [] },
    tagsEstado: { type: [tagEstadoSchema], default: [] },

    cadeia: {
      acCompraIgualUltimaVenda: { type: String, default: 'sem-dados' },
      expiracaoIgualTurma: { type: String, default: 'sem-dados' },
      tagIgualTurma: { type: String, default: 'sem-dados' },
      ciclosSemMudancaTurma: { type: Number, default: 0 },
      tagsDesatualizadas: { type: Boolean, default: false }
    },

    turmasPorMapear: { type: [String], default: [] },

    geradoEm: { type: Date, required: true, default: Date.now, index: true },
    fontes: {
      vendas: { type: Date, default: null },
      tags: { type: Date, default: null },
      ac: { type: Date, default: null }
    }
  },
  { timestamps: true, collection: 'studentrenewaltimelines' }
)

// listar quem tem desvios sem percorrer os ciclos todos
studentRenewalTimelineSchema.index({ 'cadeia.tagIgualTurma': 1 })
studentRenewalTimelineSchema.index({ 'cadeia.ciclosSemMudancaTurma': -1 })

const StudentRenewalTimeline = (mongoose.models.StudentRenewalTimeline ||
  mongoose.model<IStudentRenewalTimeline>(
    'StudentRenewalTimeline',
    studentRenewalTimelineSchema
  )) as mongoose.Model<IStudentRenewalTimeline>

export default StudentRenewalTimeline
```

- [ ] **Step 4: Implementar `TurmaTagMap.ts`**

Criar `src/models/TurmaTagMap.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/models/TurmaTagMap.ts
// Excepções à convenção turma → tag da ActiveCampaign.
//
// A convenção resolve a esmagadora maioria dos casos e vive em
// código (`turmaTagResolver.ts`). Aqui ficam só os casos em que
// a realidade não segue a convenção: turmas agrupadas ("Turmas
// 1, 2 e 3"), turmas cujo período da tag não é o do nome, e as
// Turmas 1 e 2, que mantêm o número na renovação.
//
// Existir como colecção — e não como Excel — é o que permite
// acrescentar uma excepção sem mexer em código.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface ITurmaTagMap extends Document {
  /** Nome da turma em minúsculas com espaços colapsados — a chave. */
  classNameNormalizado: string
  className: string
  tagNome: string
  tagId: string | null
  /** `excepcao` foi decidida por uma pessoa; `observada` veio dos dados. */
  origem: 'excepcao' | 'observada'
  /** Quantos alunos da turma tinham esta tag quando foi observada. */
  alunosConcordantes: number
  nota: string | null
  createdAt: Date
  updatedAt: Date
}

const turmaTagMapSchema = new Schema<ITurmaTagMap>(
  {
    classNameNormalizado: { type: String, required: true, unique: true },
    className: { type: String, required: true },
    tagNome: { type: String, required: true },
    tagId: { type: String, default: null },
    origem: { type: String, enum: ['excepcao', 'observada'], default: 'observada' },
    alunosConcordantes: { type: Number, default: 0 },
    nota: { type: String, default: null }
  },
  { timestamps: true, collection: 'turmatagmap' }
)

const TurmaTagMap = (mongoose.models.TurmaTagMap ||
  mongoose.model<ITurmaTagMap>('TurmaTagMap', turmaTagMapSchema)) as mongoose.Model<ITurmaTagMap>

export default TurmaTagMap
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/models.timeline.test.ts
```

Esperado: `pass 5`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/models/StudentRenewalTimeline.ts src/models/TurmaTagMap.ts src/services/renewal/__tests__/models.timeline.test.ts && git commit -m "feat(renovacao): modelos studentrenewaltimelines e turmatagmap"
```

---

### Task 5: Corrigir o sync de tags (regex cego + data de aplicação)

**Files:**
- Modify: `src/models/ACStudentTag.ts` (acrescentar `aplicadaEm` a `IACTag` e ao `acTagSchema`)
- Modify: `src/services/renewal/acStudentTagsSync.service.ts` (corrigir `MENCIONA_OGI`, exportar `classificar`, acrescentar a passagem de datas)
- Test: `src/services/renewal/__tests__/acStudentTagsSync.classificar.test.ts`

**Interfaces:**
- Consumes: `TipoTagTurma` de `src/models/ACStudentTag.ts`.
- Produces: `classificar(nome: string, canonicas: Set<string>): TipoTagTurma | null` passa a ser exportada; `syncAcStudentTags(tagsCanonicas?: string[], opcoes?: { comDatas?: boolean }): Promise<AcStudentTagsSyncReport>`; o relatório ganha `contactosComData: number`.

**Porquê:** o `classificar()` exige `^aluno ogi\b` e **não apanha "Alunos OGI Ativos"** — o `s` do plural parte o `\b`. Das 658 tags da AC o espelho guarda 108, todas de turma; as tags de estado nunca lá chegam. E o varrimento é por tag (`/contacts?tagid=`), que não devolve o `cdate` da associação — sem ele não há alerta `tag-tardia` nem forma de ver o carimbo em massa de 2026-08-07.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/renewal/__tests__/acStudentTagsSync.classificar.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificar } from '../acStudentTagsSync.service'

const semCanonicas = new Set<string>()

test('apanha as tags de estado no plural — o caso que estava cego', () => {
  assert.equal(classificar('Alunos OGI Ativos', semCanonicas), 'outra')
  assert.equal(classificar('Alunos OGI Antigos', semCanonicas), 'outra')
})

test('continua a apanhar o singular', () => {
  assert.equal(classificar('Aluno OGI Antigo', semCanonicas), 'outra')
})

test('tags de turma continuam a ser membresia', () => {
  assert.equal(classificar('Aluno OGI L2409 - Turma 11', semCanonicas), 'membresia')
  assert.equal(classificar('Aluno OGI 2505 - Renovação Turma 10 [2anos]', semCanonicas), 'membresia')
})

test('a lista canonica ganha a tudo', () => {
  const canonicas = new Set(['aluno ogi l2409 - turma 11'])
  assert.equal(classificar('Aluno OGI L2409 - Turma 11', canonicas), 'canonica')
})

test('tags de outros produtos continuam de fora', () => {
  assert.equal(classificar('Comprou Organiza as tuas Finanças', semCanonicas), null)
  assert.equal(classificar('Newsletter', semCanonicas), null)
})
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/acStudentTagsSync.classificar.test.ts
```

Esperado: FAIL — `classificar is not a function` (ainda não é exportada), e a seguir os dois primeiros casos com `null` em vez de `'outra'`.

- [ ] **Step 3: Corrigir o regex e exportar `classificar`**

Em `src/services/renewal/acStudentTagsSync.service.ts`, substituir a linha

```ts
const MENCIONA_OGI = /^aluno ogi\b/i
```

por

```ts
// "Alunos OGI Ativos" falhava com /^aluno ogi\b/ — o `s` do plural
// parte o \b e a tag de estado nunca chegava ao espelho. Das 658
// tags da AC guardavam-se 108, todas de turma.
const MENCIONA_OGI = /^alunos?\s+ogi\b/i
```

e mudar a assinatura de `classificar` para a exportar:

```ts
export function classificar(nome: string, canonicas: Set<string>): TipoTagTurma | null {
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/acStudentTagsSync.classificar.test.ts
```

Esperado: `pass 5`, `fail 0`.

- [ ] **Step 5: Acrescentar `aplicadaEm` ao modelo**

Em `src/models/ACStudentTag.ts`, na interface `IACTag`, acrescentar o campo depois de `tipo`:

```ts
export interface IACTag {
  tagId: string
  nome: string
  tipo: TipoTagTurma
  /** `cdate` da associação na AC — quando a tag foi posta no contacto. */
  aplicadaEm: Date | null
}
```

e no `acTagSchema`, depois de `tipo`:

```ts
    tipo: { type: String, enum: ['canonica', 'membresia', 'outra'], required: true },
    aplicadaEm: { type: Date, default: null }
```

- [ ] **Step 6: Acrescentar a passagem que traz as datas**

Em `src/services/renewal/acStudentTagsSync.service.ts`, acrescentar a função a seguir a `contactosDaTag`:

```ts
/**
 * Datas de aplicação das tags de UM contacto.
 * O varrimento principal vai por tag (`/contacts?tagid=`) porque são
 * ~120 tags contra ~940 alunos — mas essa resposta não traz o `cdate`
 * da associação. Só `/contacts/{id}/contactTags` o traz, e isso é um
 * pedido por contacto. Fica numa passagem à parte, opcional.
 */
async function datasDasTagsDoContacto(contactId: string): Promise<Map<string, Date>> {
  const r: any = await axios.get(`${AC_URL()}/api/3/contacts/${contactId}/contactTags`, {
    headers: AC_HEADERS(),
    timeout: 45000
  })
  const out = new Map<string, Date>()
  for (const ct of r.data?.contactTags ?? []) {
    const d = ct?.cdate ? new Date(ct.cdate) : null
    if (ct?.tag && d && !Number.isNaN(d.getTime())) out.set(String(ct.tag), d)
  }
  return out
}
```

Acrescentar `contactosComData: number` à interface `AcStudentTagsSyncReport` e a `0` na inicialização de `report`.

Mudar a assinatura da função exportada:

```ts
export async function syncAcStudentTags(
  tagsCanonicas: string[] = [],
  opcoes: { comDatas?: boolean } = {}
): Promise<AcStudentTagsSyncReport> {
```

Mudar a construção de cada tag em `porEmail` para já levar o campo (fica `null` quando a passagem de datas não corre):

```ts
        if (!reg.tags.some((x) => x.tagId === String(t.id))) {
          reg.tags.push({ tagId: String(t.id), nome: t.tag, tipo: t.tipo, aplicadaEm: null })
        }
```

e ajustar o tipo do `Map` na declaração:

```ts
  const porEmail = new Map<
    string,
    { contactId: string; tags: Array<{ tagId: string; nome: string; tipo: TipoTagTurma; aplicadaEm: Date | null }> }
  >()
```

Inserir a passagem de datas logo a seguir a `report.contactosDistintos = porEmail.size`:

```ts
  if (opcoes.comDatas !== false) {
    for (const [, reg] of porEmail) {
      try {
        const datas = await datasDasTagsDoContacto(reg.contactId)
        for (const tag of reg.tags) tag.aplicadaEm = datas.get(tag.tagId) ?? null
        report.contactosComData += 1
      } catch (error: any) {
        report.errors.push({ contexto: `datas do contacto ${reg.contactId}`, error: error?.message ?? 'erro' })
      }
      // a AC limita a 5 pedidos/s — 200ms deixa margem confortável
      await new Promise((r) => setTimeout(r, 200))
    }
  }
```

- [ ] **Step 7: Confirmar que compila e que os testes puros continuam a passar**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "renewal|ACStudentTag" ; npx tsx --test src/services/renewal/__tests__/
```

Esperado: nenhuma linha de erro dos ficheiros filtrados, e todos os testes a passar.

- [ ] **Step 8: Commit**

```bash
git add src/models/ACStudentTag.ts src/services/renewal/acStudentTagsSync.service.ts src/services/renewal/__tests__/acStudentTagsSync.classificar.test.ts && git commit -m "fix(tags): apanhar as tags de estado no plural e guardar a data de aplicacao"
```

---

### Task 6: O serviço que lê os espelhos e escreve a timeline

**Files:**
- Create: `src/services/renewal/renewalTimeline.service.ts`
- Test: `src/services/renewal/__tests__/renewalTimeline.service.test.ts`

**Interfaces:**
- Consumes: `gerarTimeline`, `EntradaGerador` de `./renewalTimeline.generator`; os modelos `HotmartSaleHistory`, `ACStudentTag`, `ACRenewalData`, `StudentClassHistory`, `TurmaTagMap`, `StudentRenewalTimeline`, `User`.
- Produces: `montarEntrada(dados: DadosAluno, excepcoes: Map<string, string>, agora: Date): EntradaGerador` (pura, testável); `gerarTimelinesEmLote(emails?: string[], agora?: Date): Promise<TimelineSyncReport>`; `gerarTimelineDeAluno(userId: string): Promise<IStudentRenewalTimeline | null>`.

A separação importa: `montarEntrada` faz a tradução dos documentos da BD para o input do gerador e é **pura**, por isso leva teste. O resto lê e escreve na BD e não leva teste automático — valida-se contra dados reais no Step 6.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/renewal/__tests__/renewalTimeline.service.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarEntrada, type DadosAluno } from '../renewalTimeline.service'

const AGORA = new Date('2026-08-21T12:00:00Z')

const dados = (p: Partial<DadosAluno>): DadosAluno => ({
  userId: 'u1',
  email: 'a@b.pt',
  vendas: null,
  tags: null,
  ac: null,
  movimentacoes: [],
  turmaAtual: null,
  ...p
})

test('montarEntrada traduz as vendas e as fontes', () => {
  const e = montarEntrada(
    dados({
      vendas: {
        sales: [
          {
            hotmartProductId: '1733154',
            productName: 'OGI',
            transaction: 'T',
            offerCode: 'o',
            transactionStatus: 'APPROVED',
            approvedDate: new Date('2025-11-30T00:00:00Z'),
            orderDate: null,
            priceValue: 145,
            currency: 'EUR'
          }
        ],
        lastSyncedAt: new Date('2026-08-20T00:00:00Z')
      }
    }),
    new Map(),
    AGORA
  )
  assert.equal(e.vendas.length, 1)
  assert.equal(e.vendas[0].priceValue, 145)
  assert.equal(e.fontes.vendas?.toISOString(), '2026-08-20T00:00:00.000Z')
  assert.equal(e.agora, AGORA)
})

test('montarEntrada so leva tags de turma para o gerador decidir, incluindo as de estado', () => {
  const e = montarEntrada(
    dados({
      tags: {
        tags: [
          { tagId: '347', nome: 'Alunos OGI Ativos', tipo: 'outra', aplicadaEm: null },
          { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', tipo: 'membresia', aplicadaEm: null }
        ],
        syncedAt: new Date('2026-08-19T00:00:00Z')
      }
    }),
    new Map(),
    AGORA
  )
  assert.equal(e.tags.length, 2)
  assert.equal(e.fontes.tags?.toISOString(), '2026-08-19T00:00:00.000Z')
})

test('montarEntrada ordena as movimentacoes da mais antiga para a mais recente', () => {
  const e = montarEntrada(
    dados({
      movimentacoes: [
        { classId: 'b', className: 'Turma 7 [renov] | 2411', dateMoved: new Date('2024-11-06T00:00:00Z') },
        { classId: 'a', className: 'Turma 7 | 2311', dateMoved: new Date('2023-11-06T00:00:00Z') }
      ]
    }),
    new Map(),
    AGORA
  )
  assert.deepEqual(e.movimentacoes.map((m) => m.classId), ['a', 'b'])
})

test('montarEntrada aguenta o aluno sem espelho nenhum', () => {
  const e = montarEntrada(dados({}), new Map(), AGORA)
  assert.deepEqual(e.vendas, [])
  assert.deepEqual(e.tags, [])
  assert.equal(e.turmaAtual, null)
  assert.equal(e.acExpiracao, null)
  assert.deepEqual(e.fontes, { vendas: null, tags: null, ac: null })
})
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/renewalTimeline.service.test.ts
```

Esperado: FAIL — `Cannot find module '../renewalTimeline.service'`.

- [ ] **Step 3: Implementar `renewalTimeline.service.ts`**

Criar `src/services/renewal/renewalTimeline.service.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalTimeline.service.ts
// A camada que liga o gerador puro à base de dados: lê os
// espelhos locais, traduz, chama `gerarTimeline` e faz upsert em
// `studentrenewaltimelines`.
//
// Só toca na nossa BD. As chamadas à Hotmart e à AC já foram
// feitas pelas syncs próprias — este passo trabalha sobre o que
// elas deixaram, por isso são segundos e não minutos.
//
// Cada corrida SUBSTITUI a timeline do aluno. Correr duas vezes
// dá o mesmo resultado; não acumula nem duplica.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import ACStudentTag from '../../models/ACStudentTag'
import ACRenewalData from '../../models/ACRenewalData'
import StudentClassHistory from '../../models/StudentClassHistory'
import StudentRenewalTimeline, { type IStudentRenewalTimeline } from '../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../models/TurmaTagMap'
import { User } from '../../models'
import { gerarTimeline, type EntradaGerador } from './renewalTimeline.generator'
import type { VendaEntrada } from './renewalTimeline.types'

export interface DadosAluno {
  userId: string
  email: string
  vendas: { sales: VendaEntrada[]; lastSyncedAt: Date | null } | null
  tags: {
    tags: Array<{ tagId: string; nome: string; tipo: string; aplicadaEm: Date | null }>
    syncedAt: Date | null
  } | null
  ac: { purchaseDate: Date | null; expirationDate: Date | null; lastSyncedAt: Date | null } | null
  movimentacoes: Array<{ classId: string | null; className: string; dateMoved: Date | null }>
  turmaAtual: { classId: string | null; className: string; entrouEm: Date | null } | null
}

export interface TimelineSyncReport {
  alunos: number
  gerados: number
  comAlertas: number
  turmasPorMapear: string[]
  errors: Array<{ email: string; error: string }>
}

/**
 * Traduz os documentos da BD para o input do gerador. Pura de
 * propósito — é aqui que os enganos de forma aparecem, e assim
 * ficam cobertos por testes sem precisar de base de dados.
 */
export function montarEntrada(
  d: DadosAluno,
  excepcoes: Map<string, string>,
  agora: Date
): EntradaGerador {
  return {
    vendas: d.vendas?.sales ?? [],
    tags: (d.tags?.tags ?? []).map((t) => ({
      tagId: t.tagId,
      nome: t.nome,
      aplicadaEm: t.aplicadaEm ?? null
    })),
    turmaAtual: d.turmaAtual,
    movimentacoes: [...d.movimentacoes]
      .filter((m) => !!m.className)
      .sort((a, b) => (a.dateMoved?.getTime() ?? 0) - (b.dateMoved?.getTime() ?? 0))
      .map((m) => ({ classId: m.classId, className: m.className, entrouEm: m.dateMoved })),
    acExpiracao: d.ac?.expirationDate ?? null,
    acDataCompra: d.ac?.purchaseDate ?? null,
    excepcoesTurmaTag: excepcoes,
    fontes: {
      vendas: d.vendas?.lastSyncedAt ?? null,
      tags: d.tags?.syncedAt ?? null,
      ac: d.ac?.lastSyncedAt ?? null
    },
    agora
  }
}

/** Carrega as excepções turma→tag da BD para um Map já normalizado. */
export async function carregarExcepcoes(): Promise<Map<string, string>> {
  const docs = (await (TurmaTagMap as any)
    .find({})
    .select('classNameNormalizado tagNome')
    .lean()
    .exec()) as Array<{ classNameNormalizado: string; tagNome: string }>
  return new Map(docs.map((d) => [d.classNameNormalizado, d.tagNome]))
}

/** A turma actual do aluno: a entrada activa mais recente da Hotmart. */
function turmaActualDoUser(u: any): DadosAluno['turmaAtual'] {
  const turmas: any[] = u?.hotmart?.enrolledClasses ?? []
  const activas = turmas.filter((t) => t?.className && t?.isActive !== false)
  const escolhida = activas[activas.length - 1] ?? turmas[turmas.length - 1] ?? null
  if (!escolhida) return null
  return {
    classId: escolhida.classId ?? null,
    className: escolhida.className,
    entrouEm: escolhida.enrolledAt ?? null
  }
}

/**
 * Gera as timelines de todos os alunos que têm espelho de vendas
 * (ou só dos `emails` indicados). Lê tudo em bloco — uma consulta
 * por colecção — e escreve num bulkWrite.
 */
export async function gerarTimelinesEmLote(
  emails?: string[],
  agora: Date = new Date()
): Promise<TimelineSyncReport> {
  const report: TimelineSyncReport = {
    alunos: 0,
    gerados: 0,
    comAlertas: 0,
    turmasPorMapear: [],
    errors: []
  }

  const filtroEmail = emails?.length
    ? { email: { $in: emails.map((e) => e.toLowerCase().trim()) } }
    : {}

  const [excepcoes, vendasDocs, tagsDocs, acDocs] = await Promise.all([
    carregarExcepcoes(),
    (HotmartSaleHistory as any).find(filtroEmail).lean().exec(),
    (ACStudentTag as any).find(filtroEmail).lean().exec(),
    (ACRenewalData as any).find(filtroEmail).lean().exec()
  ])

  const porEmailVendas = new Map<string, any>(vendasDocs.map((d: any) => [d.email, d]))
  const porEmailTags = new Map<string, any>(tagsDocs.map((d: any) => [d.email, d]))
  const porEmailAc = new Map<string, any>(acDocs.map((d: any) => [d.email, d]))

  const emailsAlvo = [
    ...new Set([...porEmailVendas.keys(), ...porEmailTags.keys(), ...porEmailAc.keys()])
  ]
  report.alunos = emailsAlvo.length
  if (!emailsAlvo.length) return report

  const users = (await (User as any)
    .find({ email: { $in: emailsAlvo } })
    .select('_id email hotmart.enrolledClasses')
    .lean()
    .exec()) as any[]
  const userPorEmail = new Map(users.map((u) => [String(u.email).toLowerCase().trim(), u]))

  const movimentacoes = (await (StudentClassHistory as any)
    .find({ studentId: { $in: users.map((u) => u._id) } })
    .select('studentId classId className dateMoved')
    .lean()
    .exec()) as any[]
  const movsPorUser = new Map<string, any[]>()
  for (const m of movimentacoes) {
    const k = String(m.studentId)
    if (!movsPorUser.has(k)) movsPorUser.set(k, [])
    movsPorUser.get(k)!.push(m)
  }

  const porMapear = new Set<string>()
  const ops: any[] = []

  for (const email of emailsAlvo) {
    const user = userPorEmail.get(email)
    if (!user) continue

    try {
      const venda = porEmailVendas.get(email)
      const tag = porEmailTags.get(email)
      const ac = porEmailAc.get(email)

      const entrada = montarEntrada(
        {
          userId: String(user._id),
          email,
          vendas: venda ? { sales: venda.sales ?? [], lastSyncedAt: venda.lastSyncedAt ?? null } : null,
          tags: tag ? { tags: tag.tags ?? [], syncedAt: tag.syncedAt ?? null } : null,
          ac: ac
            ? {
                purchaseDate: ac.purchaseDate ?? null,
                expirationDate: ac.expirationDate ?? null,
                lastSyncedAt: ac.lastSyncedAt ?? null
              }
            : null,
          movimentacoes: (movsPorUser.get(String(user._id)) ?? []).map((m) => ({
            classId: m.classId ?? null,
            className: m.className,
            dateMoved: m.dateMoved ?? null
          })),
          turmaAtual: turmaActualDoUser(user)
        },
        excepcoes,
        agora
      )

      const timeline = gerarTimeline(entrada)
      timeline.turmasPorMapear.forEach((t) => porMapear.add(t))
      if (timeline.ciclos.some((c) => c.alertas.length > 0)) report.comAlertas += 1

      ops.push({
        updateOne: {
          filter: { userId: user._id },
          update: {
            $set: {
              email,
              ciclos: timeline.ciclos,
              tagsOrfas: timeline.tagsOrfas,
              tagsEstado: timeline.tagsEstado,
              cadeia: timeline.cadeia,
              turmasPorMapear: timeline.turmasPorMapear,
              geradoEm: agora,
              fontes: entrada.fontes
            }
          },
          upsert: true
        }
      })
    } catch (error: any) {
      report.errors.push({ email, error: error?.message ?? 'erro' })
    }
  }

  if (ops.length) {
    const r = await (StudentRenewalTimeline as any).bulkWrite(ops, { ordered: false })
    report.gerados = (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) + (r.matchedCount ?? 0)
  }

  report.turmasPorMapear = [...porMapear].sort()
  return report
}

/** Regenera a timeline de um aluno só e devolve-a. */
export async function gerarTimelineDeAluno(userId: string): Promise<IStudentRenewalTimeline | null> {
  const user = (await (User as any).findById(userId).select('email').lean().exec()) as
    | { email: string }
    | null
  if (!user?.email) return null

  await gerarTimelinesEmLote([user.email])
  return (await (StudentRenewalTimeline as any)
    .findOne({ userId: new mongoose.Types.ObjectId(userId) })
    .lean()
    .exec()) as IStudentRenewalTimeline | null
}

export default gerarTimelinesEmLote
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/renewalTimeline.service.test.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep renewalTimeline
```

Esperado: `pass 4`, `fail 0`, e nenhuma linha de erro do `grep`.

- [ ] **Step 5: Commit**

```bash
git add src/services/renewal/renewalTimeline.service.ts src/services/renewal/__tests__/renewalTimeline.service.test.ts && git commit -m "feat(renovacao): servico que gera as timelines a partir dos espelhos locais"
```

- [ ] **Step 6: Validar contra dados reais, sem escrever**

Criar `scripts/dry-run-timeline.ts`:

```ts
// Corre o gerador contra alunos reais e imprime o resultado.
// NÃO escreve nada: usa o gerador directamente, não o bulkWrite.
import mongoose from 'mongoose'
import { montarEntrada, carregarExcepcoes } from '../src/services/renewal/renewalTimeline.service'
import { gerarTimeline } from '../src/services/renewal/renewalTimeline.generator'
import HotmartSaleHistory from '../src/models/HotmartSaleHistory'
import ACStudentTag from '../src/models/ACStudentTag'
import ACRenewalData from '../src/models/ACRenewalData'
import StudentClassHistory from '../src/models/StudentClassHistory'
import { User } from '../src/models'

async function main() {
  await mongoose.connect(process.env.MONGO_URI || '')
  const emails = process.argv.slice(2).map((e) => e.toLowerCase().trim())
  if (!emails.length) throw new Error('uso: dry-run-timeline.ts <email> [email...]')

  const excepcoes = await carregarExcepcoes()

  for (const email of emails) {
    const [venda, tag, ac, user] = await Promise.all([
      (HotmartSaleHistory as any).findOne({ email }).lean(),
      (ACStudentTag as any).findOne({ email }).lean(),
      (ACRenewalData as any).findOne({ email }).lean(),
      (User as any).findOne({ email }).select('_id email hotmart.enrolledClasses').lean()
    ])
    if (!user) { console.log(`\n${email}: sem utilizador na BD`); continue }

    const movs = await (StudentClassHistory as any).find({ studentId: user._id }).lean()
    const turmas = (user.hotmart?.enrolledClasses ?? []).filter((t: any) => t?.className)
    const actual = turmas[turmas.length - 1] ?? null

    const entrada = montarEntrada(
      {
        userId: String(user._id),
        email,
        vendas: venda ? { sales: venda.sales ?? [], lastSyncedAt: venda.lastSyncedAt ?? null } : null,
        tags: tag ? { tags: tag.tags ?? [], syncedAt: tag.syncedAt ?? null } : null,
        ac: ac ? { purchaseDate: ac.purchaseDate ?? null, expirationDate: ac.expirationDate ?? null, lastSyncedAt: ac.lastSyncedAt ?? null } : null,
        movimentacoes: movs.map((m: any) => ({ classId: m.classId ?? null, className: m.className, dateMoved: m.dateMoved ?? null })),
        turmaAtual: actual ? { classId: actual.classId ?? null, className: actual.className, entrouEm: actual.enrolledAt ?? null } : null
      },
      excepcoes,
      new Date()
    )

    const t = gerarTimeline(entrada)
    console.log(`\n══ ${email} ══`)
    console.log('cadeia:', t.cadeia)
    for (const c of t.ciclos) {
      const compras = c.compras.map((x) => `${x.data.toISOString().slice(0, 10)} ${x.valor}${x.moeda ?? ''}`).join(' + ')
      console.log(`  ${c.periodo}  ${compras}  ${c.anos}a`)
      console.log(`         tag:   ${c.tag?.nome ?? '—'}   (esperada: ${c.tagEsperada ?? '?'})`)
      console.log(`         turma: ${c.turma?.nome ?? '—'}`)
      if (c.alertas.length) console.log(`         ⚠ ${c.alertas.join(', ')}`)
    }
    if (t.tagsOrfas.length) console.log('  órfãs:', t.tagsOrfas.map((x) => x.nome).join(' | '))
    if (t.tagsEstado.length) console.log('  estado:', t.tagsEstado.map((x) => x.nome).join(' | '))
    if (t.turmasPorMapear.length) console.log('  por mapear:', t.turmasPorMapear.join(' | '))
  }

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

Correr contra os casos conhecidos desta análise:

```bash
cd ~/Documents/GitHub/BO2_API && railway run npx tsx scripts/dry-run-timeline.ts eva.lrei@gmail.com fmmazzoco@gmail.com almeida.ferreira@gmail.com anaritadasilva8@gmail.com lenia95@hotmail.com
```

Esperado: cinco blocos impressos. Verificar à mão que `eva.lrei` sai com 2 anos e expiração 2027-06, que `fmmazzoco` sai com **um** ciclo (as 5 prestações agrupadas), e que `anaritadasilva8` sai com dois ciclos (2502 base + 2602 renovação). Se algum não bater, o erro está na lógica pura das Tarefas 1–3 e corrige-se lá, com um teste novo a reproduzir o caso.

- [ ] **Step 7: Commit do script de validação**

```bash
git add scripts/dry-run-timeline.ts && git commit -m "chore(renovacao): script de dry-run da timeline contra alunos reais"
```

---

### Task 7: Rota HTTP e passo no pipeline nocturno

**Files:**
- Create: `src/routes/renewalTimeline.routes.ts`
- Modify: `src/routes/index.ts` (import + `router.use`)
- Modify: `src/services/renewal/renewalPipeline.service.ts` (dois passos novos)

**Interfaces:**
- Consumes: `gerarTimelinesEmLote(emails?: string[], agora?: Date): Promise<TimelineSyncReport>` e `gerarTimelineDeAluno(userId: string)` de `../services/renewal/renewalTimeline.service`; `syncAcStudentTags(tagsCanonicas?, opcoes?)` de `./acStudentTagsSync.service`.
- Produces: rotas em `/api/renewal-timeline` — `GET /?userId=`, `GET /status`, `POST /generate`.

- [ ] **Step 1: Criar a rota**

Criar `src/routes/renewalTimeline.routes.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 src/routes/renewalTimeline.routes.ts
// Timeline de renovação por aluno. Lê `studentrenewaltimelines`
// e dispara a geração.
//
// A geração de UM aluno é síncrona: não sai da nossa BD, demora
// milissegundos. A de todos corre em background — são ~900
// alunos e o proxy da Railway corta a ligação antes do fim (foi
// o que aconteceu com o /sync da AC, que o browser reportava
// como erro de CORS).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import StudentRenewalTimeline from '../models/StudentRenewalTimeline'
import {
  gerarTimelinesEmLote,
  gerarTimelineDeAluno,
  type TimelineSyncReport
} from '../services/renewal/renewalTimeline.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

let geracaoEmCurso = false
let geracaoIniciadaEm: Date | null = null
let ultimoRelatorio: TimelineSyncReport | null = null
let ultimoErro: string | null = null

/**
 * GET /api/renewal-timeline/status
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, comDesvio, ultima] = await Promise.all([
    StudentRenewalTimeline.countDocuments({}),
    StudentRenewalTimeline.countDocuments({ 'cadeia.tagIgualTurma': 'divergente' }),
    StudentRenewalTimeline.findOne({}).sort({ geradoEm: -1 }).select('geradoEm').lean().exec()
  ])

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: {
      total,
      comDesvio,
      geradoEm: ultima?.geradoEm ?? null,
      geracaoEmCurso,
      geracaoIniciadaEm,
      ultimoRelatorio,
      ultimoErro
    }
  })
}))

/**
 * GET /api/renewal-timeline?userId=... ou ?email=...
 */
router.get('/', asyncRoute(async (req: Request, res: Response) => {
  const { userId, email } = req.query
  const query: Record<string, unknown> = {}
  if (userId) query.userId = userId
  if (email) query.email = String(email).toLowerCase().trim()

  const entries = await StudentRenewalTimeline.find(query).lean().exec()
  res.json({ success: true, data: { total: entries.length, entries } })
}))

/**
 * POST /api/renewal-timeline/generate  { userId? } | { emails? }
 * Com `userId`, gera só esse aluno e devolve a timeline já feita.
 * Sem nada, gera todos em background.
 */
router.post('/generate', asyncRoute(async (req: Request, res: Response) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : null

  if (userId) {
    const timeline = await gerarTimelineDeAluno(userId)
    if (!timeline) {
      res.status(404).json({ success: false, message: 'Aluno não encontrado.' })
      return
    }
    res.json({ success: true, data: { timeline } })
    return
  }

  if (geracaoEmCurso) {
    res.status(409).json({ success: false, message: 'Já há uma geração em curso.' })
    return
  }

  const emails: string[] | undefined = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((e: unknown) => typeof e === 'string' && e.trim())
    : undefined

  geracaoEmCurso = true
  geracaoIniciadaEm = new Date()
  ultimoRelatorio = null
  ultimoErro = null

  gerarTimelinesEmLote(emails)
    .then((r) => { ultimoRelatorio = r })
    .catch((err: any) => {
      ultimoErro = err?.message || 'Erro desconhecido na geração'
      console.error('❌ [RenewalTimeline] Erro em background:', err)
    })
    .finally(() => { geracaoEmCurso = false })

  res.json({
    success: true,
    data: { started: true, message: 'Geração iniciada em background — consulta GET /status para acompanhar.' }
  })
}))

export default router
```

- [ ] **Step 2: Montar a rota**

Em `src/routes/index.ts`, junto do import da linha 34:

```ts
import renewalTimelineRoutes from './renewalTimeline.routes'
```

e junto do `router.use` da linha 76:

```ts
router.use("/renewal-timeline", renewalTimelineRoutes) // 🧬 Timeline de renovação por aluno (derivada, só BD local)
```

- [ ] **Step 3: Acrescentar os dois passos ao pipeline nocturno**

Em `src/services/renewal/renewalPipeline.service.ts`, acrescentar aos imports:

```ts
import { syncAcStudentTags, AcStudentTagsSyncReport } from './acStudentTagsSync.service'
import { gerarTimelinesEmLote, TimelineSyncReport } from './renewalTimeline.service'
```

acrescentar dois campos a `RenewalPipelineReport`, antes de `success`:

```ts
  acStudentTags: RenewalPipelineStepResult<AcStudentTagsSyncReport>
  timelines: RenewalPipelineStepResult<TimelineSyncReport>
```

e mudar `runRenewalPipeline` para:

```ts
export async function runRenewalPipeline(): Promise<RenewalPipelineReport> {
  const hotmartSales = await runStep('Sync Hotmart (vendas)', () => syncActiveStudentSalesHistory())
  const acRenewalData = await runStep('Sync AC (leitura)', () => syncActiveStudentAcRenewalData())
  const acStudentTags = await runStep('Sync AC (tags)', () => syncAcStudentTags())
  const acExpiration = await runGatedStep('AC Expiração (escrita)', AC_EXPIRATION_SYNC_JOB_NAME, () => syncAcExpirationDates())
  // último de propósito: só faz sentido com os três espelhos frescos
  const timelines = await runStep('Timelines de renovação', () => gerarTimelinesEmLote())
  const discordRoles = await runStep('Discord Roles', () => runDiscordRolesSyncJob())

  return {
    hotmartSales,
    acRenewalData,
    acStudentTags,
    acExpiration,
    timelines,
    discordRoles,
    success:
      hotmartSales.success &&
      acRenewalData.success &&
      acStudentTags.success &&
      acExpiration.success &&
      timelines.success &&
      discordRoles.success
  }
}
```

- [ ] **Step 4: Confirmar que compila**

```bash
cd ~/Documents/GitHub/BO2_API && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "renewalTimeline|renewalPipeline|routes/index"
```

Esperado: sem saída.

- [ ] **Step 5: Gerar as timelines reais e verificar**

```bash
cd ~/Documents/GitHub/BO2_API && railway run npx tsx -e "import('./src/services/renewal/renewalTimeline.service').then(async (m) => { const mongoose = await import('mongoose'); await mongoose.default.connect(process.env.MONGO_URI); console.log(await m.gerarTimelinesEmLote()); await mongoose.default.disconnect() })"
```

Esperado: um relatório com `alunos` na ordem dos 900, `gerados` igual ou próximo, `errors: []`, e a lista `turmasPorMapear` — que é exactamente o input da Tarefa 8.

- [ ] **Step 6: Commit**

```bash
git add src/routes/renewalTimeline.routes.ts src/routes/index.ts src/services/renewal/renewalPipeline.service.ts && git commit -m "feat(renovacao): rota da timeline e passos de tags e timelines no pipeline"
```

---

### Task 8: Semear o mapa de turmas por comparação entre pares

**Files:**
- Create: `scripts/seed-turma-tag-map.ts`

**Interfaces:**
- Consumes: `resolverTagDaTurma`, `normalizarNomeTurma` de `../src/services/renewal/turmaTagResolver`; modelos `User`, `ACStudentTag`, `TurmaTagMap`.
- Produces: documentos em `turmatagmap`.

**Porquê assim:** em vez de transcrever um Excel — que envelhece — o script pergunta aos dados: *que tag é que os alunos desta turma têm de facto?* Foi este método (comparação entre pares) que resolveu os casos ambíguos durante a análise de Agosto de 2026, e é o único que não inventa nada. Onde os alunos concordam entre si e discordam da convenção, isso é uma excepção real e fica registada. Onde não há concordância suficiente, o script não escreve — diz que não sabe.

- [ ] **Step 1: Escrever o script**

Criar `scripts/seed-turma-tag-map.ts`:

```ts
// ════════════════════════════════════════════════════════════
// 📁 scripts/seed-turma-tag-map.ts
// Semeia `turmatagmap` perguntando aos dados, não a um Excel:
// para cada turma, que tag de percurso é que os alunos dela têm
// de facto? Quando a resposta dominante difere da convenção, é
// uma excepção e fica registada.
//
// Dry-run por defeito. Só escreve com --write.
//
//   railway run npx tsx scripts/seed-turma-tag-map.ts
//   railway run npx tsx scripts/seed-turma-tag-map.ts --write
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { User } from '../src/models'
import ACStudentTag from '../src/models/ACStudentTag'
import TurmaTagMap from '../src/models/TurmaTagMap'
import { resolverTagDaTurma, normalizarNomeTurma } from '../src/services/renewal/turmaTagResolver'
import { periodoDaTag } from '../src/services/renewal/renewalTimeline.generator'

/** Abaixo desta fracção de concordância não se escreve nada. */
const CONCORDANCIA_MINIMA = 0.7
/** Turmas com menos alunos do que isto não dão sinal fiável. */
const ALUNOS_MINIMOS = 3

const MENCIONA_PERCURSO = /turma|renova(ç|c)(ã|a)o/i

async function main() {
  const escrever = process.argv.includes('--write')
  await mongoose.connect(process.env.MONGO_URI || '')

  const users = (await (User as any)
    .find({ 'hotmart.enrolledClasses.0': { $exists: true } })
    .select('email hotmart.enrolledClasses')
    .lean()
    .exec()) as any[]

  const tagsDocs = (await (ACStudentTag as any).find({}).select('email tags').lean().exec()) as any[]
  const tagsPorEmail = new Map<string, any[]>(tagsDocs.map((d) => [d.email, d.tags ?? []]))

  // turma → contagem de cada tag de percurso entre os seus alunos
  const porTurma = new Map<string, { className: string; contagem: Map<string, { id: string; n: number }>; alunos: number }>()

  for (const u of users) {
    const email = String(u.email ?? '').toLowerCase().trim()
    const turmas = (u.hotmart?.enrolledClasses ?? []).filter((t: any) => t?.className)
    const actual = turmas[turmas.length - 1]
    if (!actual) continue

    const chave = normalizarNomeTurma(actual.className)
    if (!porTurma.has(chave)) {
      porTurma.set(chave, { className: actual.className, contagem: new Map(), alunos: 0 })
    }
    const reg = porTurma.get(chave)!
    reg.alunos += 1

    const periodoDaTurma = normalizarNomeTurma(actual.className).match(/(\d{4})/)?.[1] ?? null

    for (const tag of tagsPorEmail.get(email) ?? []) {
      if (!MENCIONA_PERCURSO.test(tag.nome)) continue
      const p = periodoDaTag(tag.nome)
      if (!p) continue
      // só tags do período da turma (ou do mês seguinte) — as de
      // ciclos anteriores estão lá de propósito e não dizem nada
      // sobre ESTA turma.
      if (periodoDaTurma && Math.abs(Number(p) - Number(periodoDaTurma)) > 1) continue

      const actualCont = reg.contagem.get(tag.nome) ?? { id: tag.tagId, n: 0 }
      actualCont.n += 1
      reg.contagem.set(tag.nome, actualCont)
    }
  }

  const excepcoes: Array<{ chave: string; className: string; tagNome: string; tagId: string; n: number; convencao: string | null }> = []
  const semSinal: string[] = []

  for (const [chave, reg] of porTurma) {
    if (reg.alunos < ALUNOS_MINIMOS) continue

    const ordenadas = [...reg.contagem.entries()].sort((a, b) => b[1].n - a[1].n)
    const [nomeDominante, dados] = ordenadas[0] ?? [null, null]
    if (!nomeDominante || !dados) { semSinal.push(reg.className); continue }
    if (dados.n / reg.alunos < CONCORDANCIA_MINIMA) { semSinal.push(reg.className); continue }

    const convencao = resolverTagDaTurma(reg.className).tagNome
    if (convencao && normalizarNomeTurma(convencao) === normalizarNomeTurma(nomeDominante)) continue

    excepcoes.push({ chave, className: reg.className, tagNome: nomeDominante, tagId: dados.id, n: dados.n, convencao })
  }

  console.log(`\nTurmas analisadas: ${porTurma.size}`)
  console.log(`Excepções encontradas: ${excepcoes.length}\n`)
  for (const e of excepcoes) {
    console.log(`  ${e.className}`)
    console.log(`    convenção: ${e.convencao ?? '— (não resolve)'}`)
    console.log(`    real:      ${e.tagNome}  (${e.n} alunos)`)
  }
  if (semSinal.length) {
    console.log(`\nSem concordância suficiente (não escritas): ${semSinal.length}`)
    semSinal.forEach((t) => console.log(`  ${t}`))
  }

  if (!escrever) {
    console.log('\nDry-run. Corre com --write para gravar.')
    await mongoose.disconnect()
    return
  }

  const ops = excepcoes.map((e) => ({
    updateOne: {
      filter: { classNameNormalizado: e.chave },
      update: {
        $set: {
          className: e.className,
          tagNome: e.tagNome,
          tagId: e.tagId,
          origem: 'observada',
          alunosConcordantes: e.n,
          nota: `convenção daria ${e.convencao ?? 'nada'}`
        }
      },
      upsert: true
    }
  }))

  if (ops.length) {
    const r = await (TurmaTagMap as any).bulkWrite(ops, { ordered: false })
    console.log(`\nGravadas: ${(r.upsertedCount ?? 0) + (r.modifiedCount ?? 0)}`)
  }

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Correr em dry-run**

```bash
cd ~/Documents/GitHub/BO2_API && railway run npx tsx scripts/seed-turma-tag-map.ts
```

Esperado: a lista das turmas onde a tag real difere da convenção. Ler linha a linha antes de escrever — o `Turma 2 [renov] | 2306 → Aluno OGI 2302 - Renovação Turma 2` e as turmas agrupadas devem aparecer aqui.

- [ ] **Step 3: Escrever, depois de ler a lista**

```bash
cd ~/Documents/GitHub/BO2_API && railway run npx tsx scripts/seed-turma-tag-map.ts --write
```

Esperado: `Gravadas: N`, com N igual ao número de excepções da lista anterior.

- [ ] **Step 4: Regenerar as timelines e confirmar que os alertas baixam**

```bash
cd ~/Documents/GitHub/BO2_API && railway run npx tsx -e "import('./src/services/renewal/renewalTimeline.service').then(async (m) => { const mongoose = await import('mongoose'); await mongoose.default.connect(process.env.MONGO_URI); const r = await m.gerarTimelinesEmLote(); console.log('com alertas:', r.comAlertas, 'de', r.alunos); console.log('por mapear:', r.turmasPorMapear); await mongoose.default.disconnect() })"
```

Esperado: `turmasPorMapear` mais curta do que na Tarefa 7 Step 5, e `comAlertas` mais baixo.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-turma-tag-map.ts && git commit -m "feat(renovacao): semear turmatagmap por comparacao entre alunos da mesma turma"
```

---

### Task 9: Front — sub-separadores no painel de Renovação

**Files:**
- Create: `C:\Users\sfcft\Documents\GitHub\Front\src\services\renewalTimeline.service.ts`
- Create: `C:\Users\sfcft\Documents\GitHub\Front\src\components\student\renewal\ChainBanner.tsx`
- Create: `C:\Users\sfcft\Documents\GitHub\Front\src\components\student\renewal\CiclosTab.tsx`
- Create: `C:\Users\sfcft\Documents\GitHub\Front\src\components\student\renewal\TagsTab.tsx`
- Modify: `C:\Users\sfcft\Documents\GitHub\Front\src\components\student\RenewalDataPanel.tsx`

**Interfaces:**
- Consumes: `api` de `../../services/api` (instância axios com o prefixo `/api`); `Tabs, TabsContent, TabsList, TabsTrigger` de `../ui/tabs`; `Badge` de `../ui/badge`.
- Produces: `getRenewalTimeline(params: { userId?: string; email?: string }): Promise<RenewalTimeline | null>`; `generateRenewalTimeline(userId: string): Promise<RenewalTimeline>`; os tipos `RenewalTimeline`, `TimelineCiclo`, `TimelineCadeia`; os componentes `ChainBanner`, `CiclosTab`, `TagsTab`.

- [ ] **Step 1: Criar o serviço**

Criar `src/services/renewalTimeline.service.ts`:

```ts
// Timeline de renovação por aluno — cliente de /api/renewal-timeline.
// Vem toda pronta do servidor: os ciclos, os alertas e os quatro
// veredictos da cadeia são calculados lá, não aqui.
import api from './api'

export interface TimelineCompra {
  data: string
  valor: number | null
  moeda: string | null
  produtoId: string | null
  transacao: string | null
  extensao: boolean
}

export interface TimelineCiclo {
  periodo: string
  compras: TimelineCompra[]
  anos: number
  acessoAte: string
  tag: { id: string; nome: string; aplicadaEm: string | null } | null
  turma: { nome: string; classId: string | null; entrouEm: string | null } | null
  tagEsperada: string | null
  alertas: string[]
}

export type Veredicto = 'ok' | 'divergente' | 'sem-dados'

export interface TimelineCadeia {
  acCompraIgualUltimaVenda: Veredicto
  expiracaoIgualTurma: Veredicto
  tagIgualTurma: Veredicto
  ciclosSemMudancaTurma: number
  tagsDesatualizadas: boolean
}

export interface RenewalTimeline {
  _id: string
  userId: string
  email: string
  ciclos: TimelineCiclo[]
  tagsOrfas: Array<{ id: string; nome: string; periodo: string | null; aplicadaEm: string | null }>
  tagsEstado: Array<{ id: string; nome: string; aplicadaEm: string | null }>
  cadeia: TimelineCadeia
  turmasPorMapear: string[]
  geradoEm: string
  fontes: { vendas: string | null; tags: string | null; ac: string | null }
}

export async function getRenewalTimeline(
  params: { userId?: string; email?: string } = {}
): Promise<RenewalTimeline | null> {
  const { data } = await api.get('/renewal-timeline', { params })
  return data.data.entries[0] ?? null
}

// Um aluno só é rápido (não sai da nossa BD) — este pedido espera
// pelo resultado e devolve a timeline já regenerada.
export async function generateRenewalTimeline(userId: string): Promise<RenewalTimeline> {
  const { data } = await api.post('/renewal-timeline/generate', { userId })
  return data.data.timeline
}
```

- [ ] **Step 2: Criar a faixa da cadeia**

Criar `src/components/student/renewal/ChainBanner.tsx`:

```tsx
// Os quatro elos da cadeia, sempre à vista por cima dos
// separadores. É o que responde de relance a "este aluno está
// bem?" — a pergunta que antes obrigava a varrer a AC à mão.
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import type { TimelineCadeia, Veredicto } from '../../../services/renewalTimeline.service'

function Elo({ veredicto, texto }: { veredicto: Veredicto; texto: string }) {
  const cor =
    veredicto === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : veredicto === 'divergente'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-gray-200 bg-gray-50 text-gray-600'

  const Icone = veredicto === 'ok' ? CheckCircle2 : veredicto === 'divergente' ? AlertTriangle : HelpCircle

  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${cor}`}>
      <Icone className="h-3.5 w-3.5 shrink-0" />
      <span>{texto}</span>
    </div>
  )
}

export function ChainBanner({ cadeia }: { cadeia: TimelineCadeia }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Elo veredicto={cadeia.acCompraIgualUltimaVenda} texto="AC compra = última venda" />
        <Elo veredicto={cadeia.expiracaoIgualTurma} texto="Expiração = turma" />
        <Elo veredicto={cadeia.tagIgualTurma} texto="Tag = turma" />
        <Elo
          veredicto={cadeia.ciclosSemMudancaTurma > 0 ? 'divergente' : 'ok'}
          texto={
            cadeia.ciclosSemMudancaTurma > 0
              ? `${cadeia.ciclosSemMudancaTurma} ciclos sem mudança de turma`
              : 'Todos os ciclos com turma'
          }
        />
      </div>
      {cadeia.tagsDesatualizadas && (
        <p className="text-xs text-amber-700">
          Há uma venda mais recente do que a última sincronização de tags — um desvio aqui pode ser só
          atraso. Corre "Sincronizar este aluno" antes de o tratar como erro.
        </p>
      )}
    </div>
  )
}

export default ChainBanner
```

- [ ] **Step 3: Criar o separador dos ciclos**

Criar `src/components/student/renewal/CiclosTab.tsx`:

```tsx
// Uma linha por ciclo, ancorada na compra. A ordem é a das
// vendas — a fonte de topo da hierarquia — e a tag e a turma
// penduram-se nela.
import { AlertTriangle } from 'lucide-react'
import type { TimelineCiclo } from '../../../services/renewalTimeline.service'

const LEGENDA_ALERTAS: Record<string, string> = {
  'sem-tag': 'pagou e a AC não o marcou',
  'tag-tardia': 'a tag foi posta muito depois da compra',
  'sem-mudanca-turma': 'pagou, foi marcado, e ficou onde estava',
  'tag-por-definir': 'esta turma não tem tag definida — ver turmatagmap',
  'tag-diferente-da-turma': 'a tag não é a que esta turma pede'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-PT', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

export function CiclosTab({ ciclos }: { ciclos: TimelineCiclo[] }) {
  if (!ciclos.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem ciclos — não há compras aprovadas para este aluno. Compras reembolsadas não contam.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Ciclo</th>
              <th className="px-3 py-2">Compra</th>
              <th className="px-3 py-2">Acesso até</th>
              <th className="px-3 py-2">Tag</th>
              <th className="px-3 py-2">Turma</th>
            </tr>
          </thead>
          <tbody>
            {ciclos.map((c) => (
              <tr key={c.periodo + c.compras[0]?.transacao} className="border-t align-top">
                <td className="px-3 py-2 font-mono text-xs tabular-nums">{c.periodo}</td>
                <td className="px-3 py-2">
                  {c.compras.map((compra, i) => (
                    <div key={compra.transacao ?? i} className="whitespace-nowrap">
                      {formatDate(compra.data)} · {compra.valor ?? '—'} {compra.moeda ?? ''}
                      {compra.extensao && <span className="ml-1 text-xs text-muted-foreground">(extensão)</span>}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDate(c.acessoAte)}
                  {c.anos === 2 && <span className="ml-1 text-xs text-muted-foreground">(2 anos)</span>}
                </td>
                <td className="px-3 py-2">
                  {c.tag ? (
                    <>
                      <div>{c.tag.nome}</div>
                      {c.tag.aplicadaEm && (
                        <div className="text-xs text-muted-foreground">posta a {formatDate(c.tag.aplicadaEm)}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {c.tagEsperada && c.alertas.includes('tag-diferente-da-turma') && (
                    <div className="text-xs text-red-700">esperada: {c.tagEsperada}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.turma ? c.turma.nome : <span className="text-muted-foreground">— sem mudança</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ciclos.some((c) => c.alertas.length > 0) && (
        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {ciclos.flatMap((c) =>
            c.alertas.map((a) => (
              <div key={c.periodo + a} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-mono text-xs">{c.periodo}</span> — {LEGENDA_ALERTAS[a] ?? a}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default CiclosTab
```

- [ ] **Step 4: Criar o separador das tags**

Criar `src/components/student/renewal/TagsTab.tsx`:

```tsx
// Três listas separadas, porque respondem a perguntas
// diferentes: Estado é o que o aluno é agora, Percurso é o que
// ele foi, Órfãs é o que a AC diz sem ter compra que o sustente.
import type { RenewalTimeline } from '../../../services/renewalTimeline.service'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-PT', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function Lista({
  titulo,
  descricao,
  linhas
}: {
  titulo: string
  descricao: string
  linhas: Array<{ id: string; nome: string; extra?: string; aplicadaEm: string | null }>
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted-foreground">{titulo}</p>
      <p className="mb-1 text-xs text-muted-foreground">{descricao}</p>
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">nenhuma</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t first:border-t-0">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground tabular-nums">{l.id}</td>
                  <td className="px-3 py-1.5">{l.nome}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{l.extra ?? ''}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(l.aplicadaEm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function TagsTab({ timeline }: { timeline: RenewalTimeline }) {
  const percurso = timeline.ciclos
    .filter((c) => c.tag)
    .map((c) => ({ id: c.tag!.id, nome: c.tag!.nome, extra: `ciclo ${c.periodo}`, aplicadaEm: c.tag!.aplicadaEm }))

  return (
    <div className="space-y-4">
      <Lista
        titulo="Estado"
        descricao="O que o aluno é agora. Não pertencem a ciclo nenhum."
        linhas={timeline.tagsEstado.map((t) => ({ id: t.id, nome: t.nome, aplicadaEm: t.aplicadaEm }))}
      />
      <Lista
        titulo="Percurso"
        descricao="As tags de turma, cada uma no ciclo que a justifica."
        linhas={percurso}
      />
      <Lista
        titulo="Órfãs"
        descricao="Tags de turma sem compra que as justifique — a AC marca um ciclo que ninguém pagou."
        linhas={timeline.tagsOrfas.map((t) => ({
          id: t.id,
          nome: t.nome,
          extra: t.periodo ? `período ${t.periodo}` : '',
          aplicadaEm: t.aplicadaEm
        }))}
      />
    </div>
  )
}

export default TagsTab
```

- [ ] **Step 5: Reorganizar o painel em sub-separadores**

Em `src/components/student/RenewalDataPanel.tsx`:

Acrescentar aos imports (a seguir ao import de `Button`):

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import ChainBanner from './renewal/ChainBanner'
import CiclosTab from './renewal/CiclosTab'
import TagsTab from './renewal/TagsTab'
import {
  getRenewalTimeline,
  generateRenewalTimeline,
  type RenewalTimeline,
} from '../../services/renewalTimeline.service'
```

Acrescentar o estado, a seguir a `const [acEntry, setAcEntry] = useState<...>(undefined)`:

```tsx
  const [timeline, setTimeline] = useState<RenewalTimeline | null | undefined>(undefined)
```

Dentro de `load`, passar o `Promise.all` a quatro:

```tsx
      const [sales, classes, ac, tl] = await Promise.all([
        getHotmartSalesHistory({ email }),
        getStudentClassHistory(userId),
        getAcRenewalData({ userId }),
        getRenewalTimeline({ userId }),
      ])
      setSalesEntry(sales[0] || null)
      setClassHistory(classes)
      setAcEntry(ac[0] || null)
      setTimeline(tl)
```

Em `syncThisStudent`, regenerar a timeline depois das syncs — a ordem importa, porque o gerador lê o que as syncs deixaram. Substituir o corpo do `try`:

```tsx
      await Promise.all([
        startHotmartSalesSync([email]),
        startAcRenewalDataSync([email]),
      ])
      // ambas as syncs deste único aluno são rápidas, mas continuam
      // em background no servidor — a timeline só se regenera depois,
      // senão leria os espelhos antigos.
      await sleep(4000)
      await generateRenewalTimeline(userId)
      await load()
      setMessage({ type: 'success', text: 'Dados deste aluno atualizados.' })
```

Envolver os três blocos existentes (compras, turmas, dados AC) nos separadores. Substituir tudo entre o bloco do `message` e o fecho do `</div>` final por:

```tsx
      {timeline && <ChainBanner cadeia={timeline.cadeia} />}

      <Tabs defaultValue="ciclos">
        <TabsList>
          <TabsTrigger value="ciclos">Ciclos</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="turmas">Turmas</TabsTrigger>
          <TabsTrigger value="ac">Dados AC</TabsTrigger>
        </TabsList>

        <TabsContent value="ciclos" className="mt-3">
          {timeline === undefined ? (
            <p className="text-sm text-muted-foreground">a carregar…</p>
          ) : timeline === null ? (
            <p className="text-sm text-muted-foreground">
              Ainda sem timeline para este aluno — corre "Sincronizar este aluno" acima.
            </p>
          ) : (
            <CiclosTab ciclos={timeline.ciclos} />
          )}
        </TabsContent>

        <TabsContent value="tags" className="mt-3">
          {timeline ? (
            <TagsTab timeline={timeline} />
          ) : (
            <p className="text-sm text-muted-foreground">Ainda sem timeline para este aluno.</p>
          )}
        </TabsContent>

        <TabsContent value="compras" className="mt-3">
          {/* MOVER PARA AQUI: o conteúdo de dentro do <div> das linhas 116–184 do
              ficheiro actual — todo o bloco condicional que começa em
              `salesEntry === undefined ? (` e acaba na tabela das vendas.
              Tirar o <p> do título ("Histórico de compras (Hotmart)") das linhas
              117–126, mas MANTER o `sincronizado a {formatDate(...)}` — mudá-lo
              para um <p className="mb-2 text-xs text-muted-foreground"> por cima
              da tabela. O separador já diz o que é; a data de sync não. */}
        </TabsContent>

        <TabsContent value="turmas" className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Registo das movimentações feitas por pessoas. Não é derivado das tags — por isso pode
            não bater certo com os ciclos, e isso não é necessariamente erro.
          </p>
          {/* MOVER PARA AQUI: o conteúdo do <div> das linhas 186–214 do ficheiro
              actual, sem o <p> do título da linha 187. */}
        </TabsContent>

        <TabsContent value="ac" className="mt-3">
          {/* MOVER PARA AQUI: o conteúdo do <div> das linhas 216–259 do ficheiro
              actual, sem o <p> do título da linha 217. Manter o aviso vermelho
              de reembolso — é ele que explica a expiração vazia. */}
        </TabsContent>
      </Tabs>

      {salesEntry && salesEntry.latestOfferCode && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Última oferta usada:</span>
          <Badge variant="outline">{salesEntry.latestOfferCode}</Badge>
        </div>
      )}
```

Mover o JSX de cada um dos três blocos existentes para dentro do `TabsContent` correspondente, tirando-lhes o `<p className="mb-1 text-sm font-semibold text-muted-foreground">` do título (o separador já diz o que é).

- [ ] **Step 6: Confirmar que compila e ver na ficha de um aluno real**

```bash
cd ~/Documents/GitHub/Front && npx tsc --noEmit 2>&1 | grep -E "renewal|Renewal"
```

Esperado: sem saída.

Depois abrir o backoffice, ir à ficha de um aluno com percurso longo (`eva.lrei@gmail.com`) e confirmar: a faixa da cadeia aparece com os quatro elos; o separador Ciclos mostra uma linha por compra anual; o separador Tags separa Estado, Percurso e Órfãs.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/Front && git add src/services/renewalTimeline.service.ts src/components/student/renewal src/components/student/RenewalDataPanel.tsx && git commit -m "feat(renovacao): separadores de Ciclos e Tags com a cadeia a vista"
```

---

## Quando é que a timeline se regenera

O spec pede três gatilhos. Dois têm tarefa própria; o terceiro sai de graça e
convém perceber porquê antes de alguém tentar acrescentá-lo.

- **A pedido** — o botão "Sincronizar este aluno" no painel chama
  `POST /generate { userId }` depois das syncs (Tarefa 9, Step 5).
- **Em lote** — o passo novo no `renewalPipeline`, a seguir às três syncs
  (Tarefa 7, Step 3).
- **Por mudança de venda ou de turma** — **já coberto pelo passo em lote, sem
  código adicional.** As quatro escritas em `studentclasshistories`
  (`classes.controller.ts:536`, `:1915`, `:1985`, `:2361`) acontecem todas
  dentro de syncs da Hotmart, que o pipeline corre **antes** do passo das
  timelines. Quando o gerador arranca, a mudança já lá está. Não há endpoint de
  movimentação manual que escreva histórico fora desse caminho.

Não pendurar a regeneração nesses quatro sítios: são ciclos sobre todos os
alunos, e uma regeneração por aluno lá dentro acrescentaria centenas de idas à
BD a uma sync que já é a mais pesada do sistema, para repetir trabalho que o
passo do fim faz de uma vez.

## Ordem e dependências

```
1 ciclos ──┐
2 resolver ┴─→ 3 gerador ─→ 6 serviço ─→ 7 rota+pipeline ─→ 8 seed ─→ 9 front
4 modelos ─────────────────┘
5 sync de tags ────────────┘
```

As tarefas 1, 2, 4 e 5 são independentes entre si e podem correr em paralelo. A 3 precisa da 1 e da 2. A 6 precisa da 3, 4 e 5. A 8 precisa da 7 ter corrido pelo menos uma vez, para haver a lista de `turmasPorMapear`.

## Como se sabe que está feito

```bash
cd ~/Documents/GitHub/BO2_API && npx tsx --test src/services/renewal/__tests__/
```

Esperado: `pass 48`, `fail 0` (10 ciclos + 10 resolver + 14 gerador + 5 modelos + 5 classificar + 4 serviço).

E na ficha de um aluno com percurso longo, o separador Ciclos mostra uma linha por compra — o caso que motivou isto (três extensões, uma só mudança de turma) passa a ler-se de relance, com o alerta `sem-mudança-turma` nos dois ciclos que ficaram sem ela.
