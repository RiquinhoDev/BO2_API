# Vigilância de tags — ver e avisar, nunca escrever

Data: 2026-08-30. Para o Codex. O João valida.

O que se constrói: um registo de **quem mexeu nas tags de turma de um aluno
quando não fomos nós**, para servir duas coisas ao mesmo tempo — uma fila de
avisos que se esvazia, e um histórico por aluno que nunca se apaga.

**Escopo: as quatro obrigatórias.** As mesmas que o spec do fluxo nocturno já
fixa em `2026-08-22-fluxo-nocturno-renovacoes.md:185`. Nada mais — o espelho tem
116 tags distintas e vigiar as 116 dá uma fila que ninguém lê.

**Não aplica tags. Não remove tags. Não toca na AC.** Nada aqui é o antigo
sistema de aplicar tags por produto e actividade (`tagOrchestrator`,
`decisionEngine`). Esse não entra, nem como referência.

---

## O que já medi, para não partires do zero

**Nenhum código escreve tags de turma na AC hoje.** Os 19 jobs de
`cronjobconfigs`, 8 ligados:

```
ON   CursEducaSync  HotmartSync  ClarezaRefresh  GuruTrialCheck
     RenewalOfferSync  AchievementEvaluation
     DiscordRolesSync  DiscordScheduledMessages

off  DailyPipeline  EvaluateRules  RenewalAcSync
off  RenewalPipeline  AcTurmaTagSync  AcRefundHandler  AcExpirationSync
```

Verifiquei os 8 ligados um a um: zero chamadas a `contactTags`,
`addTagToContact` ou `removeTag`. **O sinal nasce limpo** — tudo o que a
vigilância vir hoje é mão humana ou automação da AC.

**O passado das aplicações já existe e está datado.** A AC dá `cdate` por
associação e o espelho já o guarda em `aplicadaEm`:

```
associações       13.567
   com data       13.567
   sem data            0
alunos activos     1.328     (3.719 associações)
espelho de     23/08/2026     4 dias velho
```

**O `syncAcStudentTags` só corre dentro do `RenewalPipeline`, que está `off`.**
Daí o espelho de 4 dias. A vigilância precisa de cron próprio, independente do
pipeline, para poder ligar sem esperar pela chefia.

---

## Escopo — as quatro obrigatórias

O spec do fluxo nocturno já as fixa
(`docs/superpowers/specs/2026-08-22-fluxo-nocturno-renovacoes.md:185`). São
estas, e mais nada. Medidas a 30/08 contra os **914 alunos OGI activos**:

```
                                        têm    faltam   onde vive
1  tag da turma actual                  794        20   acstudenttags, membresia
2  "Alunos OGI Ativos"        (id 347)  895        19   acstudenttags, tipo 'outra'
3  "OGI - Aluno ou Ex-Aluno"  (id 676)  908         6   NÃO ESTÁ NO ESPELHO
4  lista "Alunos OGI"         (id   2)  906         8   NÃO É UMA TAG
```

**Os desvios de hoje são 20, 19, 6 e 8.** É uma fila que se lê num minuto, e é
esse o argumento a favor deste escopo — não a pureza da regra.

### Duas surpresas que mudam trabalho

**A `OGI - Aluno ou Ex-Aluno` nunca entrou no espelho.** O `classificar()` em
`acStudentTagsSync.service.ts` só deixa passar `^alunos? ogi\b`, `\bturma\b` ou
`renovação`. Esta começa por `OGI -` e falha as três. Está na AC com 4.418
contactos e a nossa BD não sabe que existe. É a mesma família do bug do
`^aluno ogi\b` que já nos mordeu com a `Alunos OGI Ativos`.

**A quarta não é uma tag.** `Alunos OGI` é a lista id 2, com 4.453
subscritores. Lê-se por `/api/3/contacts?listid=2`, não por `/api/3/tags`. O
espelho não tem sítio para isto.

### O que fica de fora, e porquê

```
Alunos OGI - Todos com subscrição ativa    1.050 assoc.   não é obrigatória
Alunos OGI Antigos                         3.464 assoc.   não é obrigatória
Alunos OGI - Ainda não investem               17 assoc.   não é obrigatória
mentorias, "25 primeiros", ofertas, eventos   37 tags     marketing
74 outras tags de turma que não a actual                  histórico, não estado
```

Fica também de fora a decisão do João de 25/08 sobre as `Alunos OGI Ativos`
caducadas em alunos **inactivos**: aceitam-se como estão, não geram alerta.
O que se vigia é a falta delas em quem está activo, não a sobra em quem não está.

### Sobre o volume

Uma aplicação em massa continua a ser possível — Janeiro de 2026 teve 594
aplicações de tags de estado num mês. O agrupamento resolve-o **na vista**: as
594 linhas ficam gravadas, partilham o mesmo `lote`, e a fila mostra uma linha
que se expande. Nada se perde e nada afoga.

---

## Ambiente

```bash
railway run npx tsx scripts/qualidade/<ficheiro>.ts
```

Não há `.env` local; o `MONGO_URI` chega pelo `railway run`. **O `jest` não está
instalado** apesar do `package.json` o referir. Os testes correm com:

```bash
npx tsx --test "src/**/__tests__/*.test.ts"
```

As aspas nos globs não são opcionais.

---

## Tarefa 1 — O modelo

**Criar:** `src/models/renewal/AcTagEvent.ts`
**Teste:** `src/models/renewal/__tests__/AcTagEvent.test.ts`

Uma linha por evento. A fila e o histórico são a mesma tabela com `estado`
diferente: aceitar tira da fila e **mantém a linha**.

```ts
import mongoose, { Document, Schema } from 'mongoose'

export type AccaoTag = 'aplicada' | 'removida'
/** Três das obrigatórias são tags; a quarta é a lista "Alunos OGI". */
export type AlvoEvento = 'tag' | 'lista'
export type OrigemTag = 'nosso' | 'automacaoAC' | 'maoHumana'
export type SeveridadeTag = 'grave' | 'aviso' | 'ruido'
export type EstadoTag = 'aberto' | 'aceite'

export interface IAcTagEvent extends Document {
  /** Quando aconteceu. Aplicações: o `cdate` da AC. Remoções: o `syncedAt`
   *  do espelho contra o qual se comparou — é o mais tarde que se sabe. */
  quando: Date
  /** Quando a vigilância viu. Nas remoções é a única data real. */
  detectadoEm: Date
  /** `syncedAt` do espelho usado como base. Torna a chave estável. */
  baseEspelhoEm: Date | null

  email: string
  userId?: mongoose.Types.ObjectId | null
  contactId?: string | null

  /** `'tag'` ou `'lista'`. Numa lista, `tagId`/`tagNome` levam o id e o nome
   *  da lista, e `accao` continua a ser `aplicada` (entrou) / `removida` (saiu). */
  alvo: AlvoEvento
  tagId: string
  tagNome: string
  tipo: 'canonica' | 'membresia' | 'outra'
  /** YYMM lido do nome da tag. Null quando o nome não o traz. */
  periodo: string | null

  accao: AccaoTag
  origem: OrigemTag
  /** Identificador do lote quando o evento faz parte de uma aplicação em massa. */
  lote: string | null
  loteTamanho: number

  alunoActivo: boolean
  severidade: SeveridadeTag
  /** O que isto desalinha, em português. Null quando não desalinha nada. */
  desalinha: string | null

  estado: EstadoTag
  aceitePor: string | null
  aceiteEm: Date | null
  aceiteMotivo: string | null

  /** `email|alvo|tagId|accao|quandoISO`. Impede duplicados entre corridas. */
  chave: string
}

const acTagEventSchema = new Schema<IAcTagEvent>(
  {
    quando: { type: Date, required: true },
    detectadoEm: { type: Date, required: true },
    baseEspelhoEm: { type: Date, default: null },

    email: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    contactId: { type: String, default: null },

    alvo: { type: String, enum: ['tag', 'lista'], required: true, default: 'tag' },
    tagId: { type: String, required: true },
    tagNome: { type: String, required: true },
    tipo: { type: String, enum: ['canonica', 'membresia', 'outra'], required: true },
    periodo: { type: String, default: null },

    accao: { type: String, enum: ['aplicada', 'removida'], required: true },
    origem: { type: String, enum: ['nosso', 'automacaoAC', 'maoHumana'], required: true },
    lote: { type: String, default: null },
    loteTamanho: { type: Number, default: 1 },

    alunoActivo: { type: Boolean, required: true },
    severidade: { type: String, enum: ['grave', 'aviso', 'ruido'], required: true },
    desalinha: { type: String, default: null },

    estado: { type: String, enum: ['aberto', 'aceite'], required: true, default: 'aberto' },
    aceitePor: { type: String, default: null },
    aceiteEm: { type: Date, default: null },
    aceiteMotivo: { type: String, default: null },

    chave: { type: String, required: true }
  },
  { timestamps: true, collection: 'actagevents' }
)

acTagEventSchema.index({ chave: 1 }, { unique: true })
acTagEventSchema.index({ email: 1, quando: -1 })
acTagEventSchema.index({ estado: 1, severidade: 1, quando: -1 })
acTagEventSchema.index({ lote: 1 })

const AcTagEvent = (mongoose.models.AcTagEvent ||
  mongoose.model<IAcTagEvent>('AcTagEvent', acTagEventSchema)) as mongoose.Model<IAcTagEvent>

export default AcTagEvent
```

- [ ] Teste no estilo do `AcWriteLog.test.ts`: enums, `required`, `chave` única,
      índices por `email+quando` e `estado+severidade`.

- [ ] Commit: `feat(vigilancia): modelo de eventos de tag`

---

## Tarefa 2 — As funções puras

**Criar:** `src/services/renewal/acTagWatch.regras.ts`
**Teste:** `src/services/renewal/__tests__/acTagWatch.regras.test.ts`

Sem mongoose e sem axios, para poderem ser testadas sem ligar a nada — como o
`renewalTimeline.types.ts` já faz.

### 2.1 — O período sai do nome da tag, nunca se constrói

As tags de pertença têm duas formas, ambas com o período lá dentro:

```
"Aluno OGI L2409 - Turma 11"
"Aluno OGI 2505 - Renovação Turma 10 [2anos]"
```

```ts
/** YYMM lido do nome da tag. Lê, não constrói. */
export function periodoDaTag(nome: string): string | null {
  const m = String(nome).match(/aluno\s+ogi\s+l?(\d{4})\b/i)
  return m?.[1] ?? null
}
```

### 2.2 — O filtro do escopo

O que impede a fila de nascer morta.

```ts
/** As duas obrigatórias que são tags nomeadas. Ids da AC, medidos a 30/08. */
export const TAGS_OBRIGATORIAS = [
  { id: '347', nome: 'Alunos OGI Ativos' },
  { id: '676', nome: 'OGI - Aluno ou Ex-Aluno' }
] as const

/** A lista obrigatória. Não é uma tag; lê-se por `listid`. */
export const LISTA_OBRIGATORIA = { id: '2', nome: 'Alunos OGI' } as const

/**
 * Vigia-se: a tag da turma actual e as duas obrigatórias nomeadas.
 * Fica de fora tudo o resto — ver a secção Escopo.
 *
 * Compara-se por `tagId` e não por nome: o nome na AC pode ser
 * renomeado a qualquer momento e o id não.
 */
export function tagVigiada(
  tag: { tagId: string; tipo: 'canonica' | 'membresia' | 'outra' },
  tagIdDaTurmaActual: string | null
): boolean {
  if (TAGS_OBRIGATORIAS.some((t) => t.id === String(tag.tagId))) return true
  return tag.tipo === 'membresia' && String(tag.tagId) === String(tagIdDaTurmaActual)
}
```

**A tag da turma vigiada é só a da turma actual.** As outras 74 são histórico —
um aluno na Turma 18 tem a tag da Turma 11 de há dois anos e isso está certo.
A turma actual sai do `ciclos[].turma` da timeline, pelo `resolverTagDaTurma`
que já existe.

- [ ] Teste: `"Alunos OGI Ativos"` (id 347) → vigiada, apesar de `tipo: 'outra'`.
- [ ] Teste: `"OGI - Aluno ou Ex-Aluno"` (id 676) → vigiada.
- [ ] Teste: tag de membresia **da turma actual** → vigiada.
- [ ] Teste: tag de membresia de uma turma **antiga** → **não** vigiada.
- [ ] Teste: `"Turma 18 - 25 primeiros"` → **não** vigiada.
- [ ] Teste: `"Alunos OGI Antigos"` → **não** vigiada. Não é obrigatória.
- [ ] Teste: a tag 347 renomeada na AC continua vigiada — o filtro é pelo id.

### 2.3 — O diff

```ts
export interface FotoTag {
  tagId: string
  nome: string
  tipo: 'canonica' | 'membresia' | 'outra'
  aplicadaEm: Date | null
}

export interface DiffTags {
  aplicadas: FotoTag[]
  removidas: FotoTag[]
}

export function diffTags(antes: FotoTag[], depois: FotoTag[]): DiffTags {
  const idsAntes = new Set(antes.map((t) => String(t.tagId)))
  const idsDepois = new Set(depois.map((t) => String(t.tagId)))
  return {
    aplicadas: depois.filter((t) => !idsAntes.has(String(t.tagId))),
    removidas: antes.filter((t) => !idsDepois.has(String(t.tagId)))
  }
}
```

### 2.4 — Os lotes

A mesma tag, no mesmo minuto, em muitos contactos, é uma automação.

**O lote nunca colapsa dados. Só a vista.** Os 168 alunos dão 168 linhas em
`actagevents`, todas com o mesmo `lote`. É a fila no Front que mostra uma linha
expansível. Assim continua a ser possível perguntar "e o aluno X, o que é que
lhe aconteceu naquela noite?" — pergunta que uma linha agregada não responde.

Isto tem consequência directa no limiar: como nada se perde por agrupar,
**o limiar só decide apresentação e rótulo**, nunca se um evento existe.

```ts
export function chaveDoLote(tagId: string, quando: Date | null): string | null {
  if (!quando) return null
  const m = new Date(quando)
  if (Number.isNaN(m.getTime())) return null
  m.setSeconds(0, 0)
  return `${tagId}|${m.toISOString()}`
}

export function marcarLotes<T extends { tagId: string; quando: Date | null }>(
  eventos: T[],
  limiar: number
): Array<T & { lote: string | null; loteTamanho: number }> {
  const contagem = new Map<string, number>()
  for (const e of eventos) {
    const k = chaveDoLote(e.tagId, e.quando)
    if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  return eventos.map((e) => {
    const k = chaveDoLote(e.tagId, e.quando)
    const n = k ? contagem.get(k) ?? 0 : 0
    const emLote = n >= limiar
    return { ...e, lote: emLote ? k : null, loteTamanho: emLote ? n : 1 }
  })
}
```

**O limiar é `10`, decidido pelo João a 30/08.** O critério foi: mais
informação, menos impacto negativo.

```
limiar baixo (3)    uma pessoa que mexe em 3 alunos seguidos é rotulada
                    `automacaoAC` e a remexida passa por rotina
                    -> perde-se informação

limiar alto (10)    uma automação de 8 aparece como 8 linhas soltas
                    -> mais ruído na fila, zero informação perdida
```

Como o lote não colapsa dados, o erro do limiar alto custa ruído e o do limiar
baixo custa um rótulo errado numa remexida humana. Entre os dois, escolhe-se o
que só custa ruído.

- [ ] Mostra na mesma a tabela de sensibilidade com 3, 5 e 10 sobre o histórico
      real. Não é para decidir — é para o João ver o que 10 lhe dá. Se a 10 a
      fila ficar irreconhecível, diz, mas **não mudes o valor sem ele**.

### 2.5 — A severidade

Uma lista plana ninguém lê. Foi assim que a Silvia esteve dois anos à vista.

```ts
export interface ContextoAluno {
  activo: boolean
  /** YYMM com compra não reembolsada. Inclui a coorte do ano 2 dos ciclos de 2 anos. */
  periodosPagos: Set<string>
  /** Quantas tags de pertença o aluno já tinha por período, antes deste evento. */
  tagsPorPeriodo: Map<string, number>
}

export interface Veredicto {
  severidade: 'grave' | 'aviso' | 'ruido'
  desalinha: string | null
}

export function classificarSeveridade(
  evento: {
    accao: 'aplicada' | 'removida'
    tipo: 'canonica' | 'membresia' | 'outra'
    tagId: string
    tagNome: string
  },
  ctx: ContextoAluno
): Veredicto {
  if (!ctx.activo) return { severidade: 'ruido', desalinha: null }

  // ── As duas obrigatórias nomeadas ────────────────────────────
  // Perder uma é grave por definição: o aluno fica fora do estado que a AC
  // devia garantir. Ganhá-la nunca é problema — é o estado correcto.
  const obrigatoria = TAGS_OBRIGATORIAS.find((t) => t.id === String(evento.tagId))
  if (obrigatoria) {
    if (evento.accao === 'removida') {
      return {
        severidade: 'grave',
        desalinha: `aluno activo perdeu a tag obrigatória "${obrigatoria.nome}"`
      }
    }
    return { severidade: 'aviso', desalinha: null }
  }

  // Guarda defensiva: com o `tagVigiada()` no sítio certo isto nunca dispara.
  // Fica para o dia em que alguém alargar o escopo e se esquecer desta função.
  if (evento.tipo === 'outra') return { severidade: 'aviso', desalinha: null }

  const periodo = periodoDaTag(evento.tagNome)
  if (!periodo) return { severidade: 'aviso', desalinha: null }

  const pago = ctx.periodosPagos.has(periodo)
  const jaTinha = ctx.tagsPorPeriodo.get(periodo) ?? 0

  if (evento.accao === 'aplicada') {
    if (jaTinha >= 1) {
      return {
        severidade: 'grave',
        desalinha: `ficou com duas tags de turma do período ${periodo}`
      }
    }
    if (!pago) {
      return {
        severidade: 'grave',
        desalinha: `ganhou a tag de ${periodo} e não há compra que a pague`
      }
    }
    return { severidade: 'aviso', desalinha: null }
  }

  if (pago) {
    return {
      severidade: 'grave',
      desalinha: `perdeu a tag de ${periodo} e a compra desse período está paga e não reembolsada`
    }
  }
  return { severidade: 'aviso', desalinha: null }
}
```

### 2.6 — A quarta obrigatória, que não é uma tag

A saída da lista `Alunos OGI` não passa pelo `diffTags` — não há `tagId`. Tem
função própria:

```ts
export type MudancaLista = 'entrou' | 'saiu' | 'sem-mudanca' | 'primeira-leitura'

export function mudancaNaLista(antes: boolean | null, depois: boolean): MudancaLista {
  if (antes === null || antes === undefined) return 'primeira-leitura'
  if (antes === depois) return 'sem-mudanca'
  return depois ? 'entrou' : 'saiu'
}

export function severidadeDaLista(mudanca: MudancaLista, activo: boolean): Veredicto {
  if (!activo) return { severidade: 'ruido', desalinha: null }
  if (mudanca === 'saiu') {
    return {
      severidade: 'grave',
      desalinha: 'aluno activo saiu da lista obrigatória "Alunos OGI"'
    }
  }
  return { severidade: 'aviso', desalinha: null }
}
```

**A `primeira-leitura` nunca gera evento.** Sem esta distinção a primeira
corrida acusaria 4.453 saídas da lista que nunca aconteceram.

### Testes, com os nomes dos casos reais

- [ ] `periodoDaTag` lê `L2409` e `2505`; devolve null para `"Alunos OGI Ativos"`.
- [ ] Aluno activo perde a tag 347 → **grave**, `perdeu a tag obrigatória
      "Alunos OGI Ativos"`.
- [ ] Aluno activo perde a tag 676 → **grave**.
- [ ] Aluno activo **ganha** a 347 → **aviso**. Ganhar uma obrigatória é o
      estado certo, não um alarme.
- [ ] Aluno **inactivo** perde a 347 → **ruido**. É a decisão do João de 25/08:
      as caducadas em inactivos aceitam-se como estão.
- [ ] `mudancaNaLista(null, true)` → `primeira-leitura`, e **não gera evento**.
- [ ] `mudancaNaLista(true, false)` num aluno activo → **grave**.
- [ ] `mudancaNaLista(false, true)` → `entrou`, **aviso**.
- [ ] **crisisabelfer** — tag `Aluno OGI 2605 - Renovação Turma 5` aplicada a
      07/08/2026, aluna activa, sem compra de `2605` → **grave**, com o texto
      `ganhou a tag de 2605 e não há compra que a pague`.
- [ ] **afonso.mlurdes.73** — remoção de tag de período reembolsado → **aviso**,
      não grave. É o que o `AcRefundHandler` faria de legítimo.
- [ ] **duas tags do mesmo período** → grave.
- [ ] Aluno inactivo → **ruido**, seja o que for.
- [ ] Tag `outra` (mentoria) num aluno activo → **aviso**. É a guarda defensiva;
      na prática o `tagVigiada()` já a apanhou antes.
- [ ] `diffTags` com as duas listas iguais → zero aplicadas, zero removidas.
- [ ] `diffTags` é indiferente à ordem dos arrays. **Tivemos dois bugs de
      emparelhamento por ordem de array esta semana** — este teste não é
      decorativo.
- [ ] **lote de 168** — 168 eventos com a mesma tag e o mesmo minuto, limiar 10
      → **168 linhas**, todas com o mesmo `lote` e `loteTamanho: 168`. Nenhuma
      desaparece. Este é o teste que prova que o agrupamento não colapsa dados.
- [ ] 8 eventos da mesma tag e minuto, limiar 10 → `lote: null`, 8 linhas
      soltas, rotuladas `maoHumana`.
- [ ] O mesmo conjunto com limiar 5 → `lote` preenchido. Mesma contagem de
      linhas nos dois casos: **8 e 8**.
- [ ] Eventos com `aplicadaEm: null` nunca entram em lote.

- [ ] Commit: `feat(vigilancia): regras puras do diff, lotes e severidade`

---

## Tarefa 3 — Pôr o espelho a ver as quatro

**Modificar:** `src/services/renewal/acStudentTagsSync.service.ts`
**Modificar:** `src/models/ACStudentTag.ts`

Duas das quatro obrigatórias são invisíveis ao sistema hoje. Sem isto, a
vigilância nasce a vigiar metade.

### 3.1 — A `OGI - Aluno ou Ex-Aluno`

O `classificar()` deixa passar `^alunos? ogi\b`, `\bturma\b` ou `renovação`.
A tag 676 começa por `OGI -` e falha as três, portanto **nunca entrou no
espelho** apesar de ter 4.418 contactos na AC.

Não alargar a expressão regular — alargá-la traria dezenas de tags que não
queremos. Acrescentar as obrigatórias por **id**, explicitamente:

```ts
if (TAGS_OBRIGATORIAS.some((t) => t.id === String(tagId))) return 'canonica'
```

É para isto que o `tipo: 'canonica'` existe no modelo desde o início e nunca
foi usado: o `syncAcStudentTags` é sempre chamado sem argumentos, logo
`tagsCanonicas` é sempre `[]` e **nenhuma tag do espelho é `canonica` hoje**.
Confirma isso antes de mexer.

- [ ] Teste: a tag 676 entra no espelho com `tipo: 'canonica'`.
- [ ] Teste: a 347 também, e deixa de ser `'outra'`.
- [ ] Teste: `"Alunos OGI Antigos"` continua `'outra'` — não é obrigatória.

### 3.2 — A lista `Alunos OGI`

Não é uma tag. É a lista id 2, com 4.453 subscritores, e lê-se por
`/api/3/contacts?listid=2`. Campo novo no `ACStudentTag`:

```ts
/** Está na lista "Alunos OGI" (id 2), uma das quatro obrigatórias. */
naListaAlunosOgi: { type: Boolean, default: null }
```

`null` é "ainda não foi lido", que é diferente de `false`. A distinção evita
que a primeira corrida acuse 4.453 saídas da lista que nunca aconteceram.

- [ ] Uma leitura paginada da lista por corrida — não um pedido por contacto.
- [ ] Teste: contacto na lista → `true`; fora → `false`; sem leitura → `null`.
- [ ] Teste: a transição `null -> false` **não** gera evento. Só `true -> false`.

### 3.3 — Separar a leitura da escrita

Hoje o `syncAcStudentTags` lê a AC e **sobrescreve o espelho no mesmo passo**
(`$set: { tags: reg.tags }`). O diff tem de correr antes disso, ou o espelho de
ontem morre antes de ser comparado.

Extrair a leitura, sem lhe mudar o comportamento:

```ts
export interface LeituraAc {
  porEmail: Map<string, { contactId: string; tags: FotoTag[] }>
  report: AcStudentTagsSyncReport
}

/** Só lê. Nunca grava — nem na AC nem na nossa BD. */
export async function lerTagsDaAc(
  tagsCanonicas?: string[],
  opcoes?: { comDatas?: boolean }
): Promise<LeituraAc>
```

O `syncAcStudentTags` passa a ser `lerTagsDaAc()` seguido do `bulkWrite` que já
tem. Comportamento idêntico.

- [ ] Teste: `lerTagsDaAc` com um mock de axios devolve o mapa e **não chama
      `bulkWrite`**.
- [ ] Teste: `syncAcStudentTags` continua a gravar o mesmo que gravava — os
      testes existentes em `acStudentTagsSync.datas.test.ts` têm de passar sem
      alteração.

- [ ] Commit: `refactor(vigilancia): extrair a leitura da AC do sync de tags`

---

## Tarefa 4 — O serviço

**Criar:** `src/services/renewal/acTagWatch.service.ts`
**Teste:** `src/services/renewal/__tests__/acTagWatch.test.ts`

```ts
export interface AcTagWatchOpcoes {
  /** Por omissão NÃO actualiza o espelho, para as corridas serem repetíveis
   *  contra a mesma base. A corrida a sério passa true. */
  actualizarEspelho?: boolean
  /** Por omissão não grava eventos. Igual ao resto do sistema: dryRun !== false. */
  dryRun?: boolean
  /** Por omissão 10. Ver 2.4 — só afecta rótulo e agrupamento, nunca se um
   *  evento é gravado. */
  limiarLote?: number
  /** Minutos de tolerância ao cruzar com o AcWriteLog. */
  janelaNossaMinutos?: number
}

export interface AcTagWatchReport {
  espelhoBaseEm: Date | null
  alunosLidos: number
  aplicadas: number
  removidas: number
  porOrigem: { nosso: number; automacaoAC: number; maoHumana: number }
  porSeveridade: { grave: number; aviso: number; ruido: number }
  lotes: number
  eventosGravados: number
  jaExistiam: number
  errors: Array<{ contexto: string; error: string }>
}

export async function correrAcTagWatch(opcoes?: AcTagWatchOpcoes): Promise<AcTagWatchReport>
```

Passos, por esta ordem:

```
1  lerTagsDaAc()                       leitura pura
2  ler o espelho acstudenttags         a base, com o seu syncedAt
3  diffTags por aluno                  aplicadas + removidas
3b tagVigiada()                        só as obrigatórias e a turma actual.
                                       AQUI, antes de tudo o resto — filtrar
                                       no fim é fazer trabalho para o lixo e
                                       contar lotes com eventos que não contam.
3c mudancaNaLista()                    a quarta obrigatória, sem tagId.
                                       `primeira-leitura` não gera evento.
4  marcarLotes(limiar)                 aplicações em massa -> uma linha
5  origem:
      coincide com AcWriteLog          -> nosso        (dryRun:false, mesma tag,
                                                        mesmo email, janela)
      está em lote                     -> automacaoAC
      resto                            -> maoHumana
6  contexto do aluno                   combined.status + ciclos da timeline
7  classificarSeveridade
8  gravar em actagevents               upsert pela `chave`, nunca duplica
9  se actualizarEspelho -> bulkWrite   só aqui, e só na corrida a sério
```

### O contexto do aluno sai da timeline que já existe

`studentrenewaltimelines`, ligada por `userId`:

- `periodosPagos` — para cada `ciclos[]`, o `periodo` de cada `coortes[]` entra
  se o ciclo tiver **pelo menos uma compra com `reembolsada !== true`**. As
  coortes já cobrem o ano 2 dos ciclos de 2 anos, que é o que impede marcar
  como "não pago" um ano legítimo. (Foi o erro que cometi com a `ariane.gouvea`.)
- `tagsPorPeriodo` — do espelho **antes** do evento, contando só `tipo !== 'outra'`.
- `activo` — `users.combined.status === 'ACTIVE'`.

**Um aluno sem timeline não desaparece em silêncio.** Conta como
`severidade: 'aviso'` com `desalinha: 'sem timeline para validar'`. Foi assim
que perdi 4 divergências numa medição desta semana.

### A garantia que não se negoceia

- [ ] Teste: o módulo `acTagWatch.service.ts` **não importa
      `activeCampaignService`** e o seu ficheiro não contém `.post(` nem
      `.delete(`. Um teste que lê o próprio ficheiro. Feio e eficaz.
- [ ] Teste: com `dryRun` por omissão, `AcTagEvent.create`/`bulkWrite` nunca é
      chamado.
- [ ] Teste: com `actualizarEspelho` por omissão, `ACStudentTag.bulkWrite` nunca
      é chamado.
- [ ] Teste: correr duas vezes contra a mesma base gera **zero** eventos novos
      na segunda — a `chave` única aguenta.
- [ ] Teste: uma escrita nossa no `AcWriteLog` com `dryRun:false`, mesmo email e
      mesmo `tagId` dentro da janela → `origem: 'nosso'` e não entra na fila.
- [ ] Teste: a mesma escrita com `dryRun:true` **não** protege — continua
      `maoHumana`. Um dry-run não mexeu em nada, logo não explica nada.
- [ ] Teste: um aluno que ganha `Turma 18 - 25 primeiros` e uma tag de turma
      **antiga** → **zero eventos**. O filtro do escopo corre antes dos lotes.
- [ ] Teste: `porSeveridade.ruido` só conta alunos inactivos — nunca tags fora
      do escopo, que não chegam a existir como evento.
- [ ] Teste: um aluno com `naListaAlunosOgi: null` no espelho → nenhum evento
      de lista, seja qual for a leitura de hoje.

### O estado das quatro, que é o que a chefia vai querer ver

Além dos eventos, o report devolve a fotografia — quantos alunos OGI activos
têm cada uma das quatro **agora**. É o número que diz se o sistema está são,
e os eventos dizem porque deixou de estar.

Referência medida a 30/08, em 914 alunos OGI activos:

```
tag da turma actual                794 têm    20 faltam
"Alunos OGI Ativos"       (347)    895 têm    19 faltam
"OGI - Aluno ou Ex-Aluno" (676)    908 têm     6 faltam
lista "Alunos OGI"        (id 2)   906 têm     8 faltam
```

- [ ] `AcTagWatchReport` ganha `estadoDasQuatro: { tagTurma, tag347, tag676, lista }`,
      cada um `{ tem: number; faltam: number }`.
- [ ] Se algum destes números se afastar muito da referência acima, **investiga
      antes de reportar**. Uma queda de 895 para 400 é um bug de leitura, não
      495 alunos a perderem a tag numa noite.

- [ ] Commit: `feat(vigilancia): serviço de vigilância de tags, só de leitura`

---

## Tarefa 5 — A fundação: o histórico retroactivo

**Criar:** `scripts/qualidade/fundacao-tags.ts`

As associações já têm `aplicadaEm`. O histórico das **aplicações** constrói-se
hoje, sem esperar noite nenhuma.

**Só depois da Tarefa 3.** Antes dela o espelho não tem a tag 676 nem a lista,
e a fundação nasceria a faltar-lhe metade do que interessa. Corre o
`syncAcStudentTags` uma vez com a Tarefa 3 já feita, e só então a fundação.

```
para cada aluno, para cada tag do espelho:
   tagVigiada()? senão salta
   evento accao:'aplicada', quando: aplicadaEm
   marcarLotes com o limiar escolhido
   origem: em lote -> automacaoAC, senão maoHumana
   severidade pelo contexto de hoje
   estado: 'aceite', aceiteMotivo: 'fundação — anterior à vigilância'
```

**Tudo nasce `aceite`.** É histórico, não é fila. Ninguém tem de rever milhares
de linhas de coisas que já aconteceram.

As remoções não têm fundação possível — a AC não guarda lápide. Começam a zero
no dia da primeira corrida.

- [ ] `--dry-run` por omissão. Só grava com `--gravar`.
- [ ] Reportar: eventos por ano-mês, lotes detectados, distribuição de
      severidade, e os 20 `grave` mais recentes com nome e razão.

- [ ] Commit: `feat(vigilancia): fundação do histórico a partir do espelho`

---

## Tarefa 6 — O dry-run e a sensibilidade

**Criar:** `scripts/qualidade/dry-run-vigilancia.ts`

Usa o `ligar()` do `scripts/qualidade/lib.ts`. **O `dry-runs-renovacoes.ts`
falhou por nunca o chamar** e reportou "a BD expirou" quando o que faltava era
abrir a ligação. Não repitas.

- [ ] Correr o `correrAcTagWatch` contra produção, com `dryRun` e sem
      actualizar o espelho, e colar a saída completa.
- [ ] Tabela de sensibilidade do limiar do lote:

```
limiar    lotes    linhas em lote    linhas soltas
   3        ?            ?                ?
   5        ?            ?                ?
  10        ?            ?                ?
```

- [ ] Listar os `grave` um a um, com aluno, tag, período e a razão. **Se forem
      mais do que uma mão cheia, para e reporta antes de continuar** — quer
      dizer que a regra está a apanhar comportamento normal, e é melhor
      descobri-lo agora do que numa fila que ninguém vai ler.

---

## Tarefa 7 — O cron, desligado e independente

**Modificar:** `src/services/cron/scheduler.ts`

Copia o padrão do `ensureAcTurmaTagSyncJob` (linha ~809). Nome `AcTagWatch`,
`0 3 * * *`, `Europe/Lisbon`, `enabled: false`.

**Independente do `RenewalPipeline`.** Não é uma fase gated: é um job com
trigger próprio. É o que permite ligá-lo sem esperar pela chefia — não escreve
nada em lado nenhum fora da nossa BD.

- [ ] Descrição a dizer isso: *"Lê as tags da AC e regista quem as mexeu fora do
      nosso sistema. Não escreve na AC. Trigger próprio, independente do
      RenewalPipeline. Nasce desligado."*
- [ ] Teste: o job nasce com `schedule.enabled: false`.
- [ ] Teste: o `RenewalPipeline` **não** chama o `acTagWatch`. São coisas
      separadas.

- [ ] Commit: `feat(vigilancia): cron AcTagWatch desligado`

---

## Tarefa 8 — A rota de leitura

**Criar:** `src/controllers/renewal/acTagEvents.controller.ts`
**Modificar:** as rotas de renovação já existentes

Só leitura e só duas coisas. O Front vem depois; isto é para poder ver os dados.

```
GET  /api/renewal/tag-events            fila: estado=aberto, ordenada por
                                        severidade e depois por data.
                                        AGRUPA por `lote`: um lote dá uma
                                        entrada com `loteTamanho`, não N.
     ?severidade=grave|aviso|ruido
     ?lote=<id>                         as linhas todas de um lote, para expandir
     ?email=<aluno>                     histórico de um aluno, aberto e aceite

POST /api/renewal/tag-events/:id/aceitar   { por, motivo }
                                        estado -> aceite. A linha FICA.
```

- [ ] Teste: aceitar não apaga a linha, só muda `estado`, `aceitePor`,
      `aceiteEm`, `aceiteMotivo`.
- [ ] Teste: aceitar e correr a vigilância outra vez → **não reaparece na fila**.
      É a lição da semana toda: uma lista que não se pode limpar deixa de ser
      lida.
- [ ] Teste: um lote de 168 dá **uma** entrada na fila com `loteTamanho: 168`,
      e `?lote=<id>` devolve as 168.
- [ ] Teste: aceitar pelo `lote` aceita as 168 de uma vez, com o mesmo autor e
      motivo. Aceitar 168 linhas à mão é o mesmo que não as aceitar.

- [ ] Commit: `feat(vigilancia): rotas de leitura e aceitação`

---

## Fora deste plano

**Alerta por ausência** — a automação que costuma correr e um mês não correu.
É o que teria apanhado os 6 alunos presos na automação da AC, e é a coisa mais
valiosa que sai daqui. Mas precisa da fase 1 a correr para se saber que a
ausência é ausência e não um bug nosso de leitura. **Fase 2.**

**Desarmar o `renewalAcSync`** — escreve tags na AC, constrói o nome em vez de
o ler, e não regista no `AcWriteLog`. Está `off`, portanto não é urgente hoje,
mas é a fuga mais séria que sobra. Fica no
`docs/superpowers/plans/2026-08-24-vigilancia.md`, tarefa 1.

**As tags de estado.** `Alunos OGI Ativos` e as outras três ficam fora por
decisão, não por esquecimento — 594 aplicações só em Janeiro afogariam a fila,
e o pipeline não lhes toca. Se algum dia entrarem, entram com uma regra estreita
e própria: **só alerta quando contradizem a nossa BD** — `Alunos OGI Ativos`
num aluno que temos como `INACTIVE`. Nunca como fluxo geral.

**A tabela no Front.** Depois de vermos os dados reais.

---

## Regras de sempre

- **Nada escreve na AC.** Nem um POST, nem um DELETE. Se te apetecer escrever,
  é sinal de que percebeste mal o pedido.
- Não ligar nada. O `AcTagWatch` nasce `false` como todos os outros.
- `dryRun` por omissão em tudo. `actualizarEspelho` por omissão a `false`.
- Nunca criar uma tag na AC. Nem sequer há caminho para isso neste código.
- Commit sim, push não. `main`.
- Se algum número que dei não bater, **investiga antes de reportar**. Enganei-me
  várias vezes esta semana e em duas delas tinhas tu razão.

## Relatório

- A saída completa do `fundacao-tags.ts` em dry-run. **Confirmação de que todos
  os eventos são de uma das quatro obrigatórias** — se aparecer uma tag de
  marketing ou de turma antiga, o filtro está no sítio errado.
- O `estadoDasQuatro`, comparado com a referência de 30/08 (794/20, 895/19,
  908/6, 906/8).
- A saída completa do `dry-run-vigilancia.ts`, com a tabela de sensibilidade.
- Os `grave` listados um a um, com a razão.
- Confirmação de que a suite passa: `npx tsx --test "src/**/__tests__/*.test.ts"`
  e `npx tsx --test "src/**/*.test.ts"`. A referência de 24/08 era **250/250
  aplicáveis**; as 2 falhas de `tests/load` e `tests/sprint1` são legadas
  (`Cannot find module 'chai'`) e já estavam partidas.
- Confirmação de que `actagevents` está **vazia** no fim, se correste tudo em
  dry-run — e se gravaste alguma coisa, diz exactamente o quê e porquê.
- Confirmação de que o `acwritelogs` **não ganhou registos** com `dryRun: false`.
