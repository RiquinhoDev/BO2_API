# Vigilância de tags — ver e avisar, nunca escrever

Data: 2026-08-27. Para o Codex. O João valida.

O que se constrói: um registo de **quem mexeu nas tags de turma de um aluno
quando não fomos nós**, para servir duas coisas ao mesmo tempo — uma fila de
avisos que se esvazia, e um histórico por aluno que nunca se apaga.

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

Aplicações por mês, alunos activos:

```
2025-07  52   2025-11 145   2026-03  80   2026-07  40
2025-08  15   2025-12  37   2026-04 109   2026-08 121
2025-09 267   2026-01 648   2026-05 450
2025-10  24   2026-02  67   2026-06  46
```

Janeiro e Maio são meses de campanha — atribuições em massa da turma de
renovação, legítimas. Os outros correm aos 40-120, ou seja **1 a 4 por noite**.

**O `syncAcStudentTags` só corre dentro do `RenewalPipeline`, que está `off`.**
Daí o espelho de 4 dias. A vigilância precisa de cron próprio, independente do
pipeline, para poder ligar sem esperar pela chefia.

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

  /** `email|tagId|accao|quandoISO`. Impede duplicados entre corridas. */
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

### 2.2 — O diff

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

### 2.3 — Os lotes

A mesma tag, no mesmo minuto, em muitos contactos, é uma automação. Uma linha,
não 168.

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

**O limiar é do João.** Propõe `5` e mostra a sensibilidade com 3, 5 e 10 —
quantos lotes e quantas linhas soltas dá cada um, sobre o histórico real.

### 2.4 — A severidade

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
  evento: { accao: 'aplicada' | 'removida'; tipo: 'canonica' | 'membresia' | 'outra'; tagNome: string },
  ctx: ContextoAluno
): Veredicto {
  if (!ctx.activo) return { severidade: 'ruido', desalinha: null }

  // mentorias, "25 primeiros", ofertas: mencionam turma mas não dão acesso
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

### Testes, com os nomes dos casos reais

- [ ] `periodoDaTag` lê `L2409` e `2505`; devolve null para `"Alunos OGI Ativos"`.
- [ ] **crisisabelfer** — tag `Aluno OGI 2605 - Renovação Turma 5` aplicada a
      07/08/2026, aluna activa, sem compra de `2605` → **grave**, com o texto
      `ganhou a tag de 2605 e não há compra que a pague`.
- [ ] **afonso.mlurdes.73** — remoção de tag de período reembolsado → **aviso**,
      não grave. É o que o `AcRefundHandler` faria de legítimo.
- [ ] **duas tags do mesmo período** → grave.
- [ ] Aluno inactivo → **ruido**, seja o que for.
- [ ] Tag `outra` (mentoria) num aluno activo → **aviso**.
- [ ] `diffTags` com as duas listas iguais → zero aplicadas, zero removidas.
- [ ] `diffTags` é indiferente à ordem dos arrays. **Tivemos dois bugs de
      emparelhamento por ordem de array esta semana** — este teste não é
      decorativo.
- [ ] **lote de 168** — 168 eventos com a mesma tag e o mesmo minuto, limiar 5
      → um lote de 168, e nenhum evento fica solto.
- [ ] 4 eventos da mesma tag e minuto, limiar 5 → **nenhum lote**, 4 linhas soltas.
- [ ] Eventos com `aplicadaEm: null` nunca entram em lote.

- [ ] Commit: `feat(vigilancia): regras puras do diff, lotes e severidade`

---

## Tarefa 3 — Separar a leitura da AC da escrita do espelho

**Modificar:** `src/services/renewal/acStudentTagsSync.service.ts`

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

- [ ] Commit: `feat(vigilancia): serviço de vigilância de tags, só de leitura`

---

## Tarefa 5 — A fundação: o histórico retroactivo

**Criar:** `scripts/qualidade/fundacao-tags.ts`

As 13.567 associações já têm `aplicadaEm`. O histórico das **aplicações**
constrói-se hoje, sem esperar noite nenhuma.

```
para cada aluno, para cada tag do espelho:
   evento accao:'aplicada', quando: aplicadaEm
   marcarLotes com o limiar escolhido
   origem: em lote -> automacaoAC, senão maoHumana
   severidade pelo contexto de hoje
   estado: 'aceite', aceiteMotivo: 'fundação — anterior à vigilância'
```

**Tudo nasce `aceite`.** É histórico, não é fila. Ninguém tem de rever 13.567
linhas de coisas que já aconteceram.

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
                                        severidade e depois por data
     ?severidade=grave|aviso|ruido
     ?email=<aluno>                     histórico de um aluno, aberto e aceite

POST /api/renewal/tag-events/:id/aceitar   { por, motivo }
                                        estado -> aceite. A linha FICA.
```

- [ ] Teste: aceitar não apaga a linha, só muda `estado`, `aceitePor`,
      `aceiteEm`, `aceiteMotivo`.
- [ ] Teste: aceitar e correr a vigilância outra vez → **não reaparece na fila**.
      É a lição da semana toda: uma lista que não se pode limpar deixa de ser
      lida.

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

- A saída completa do `fundacao-tags.ts` em dry-run.
- A saída completa do `dry-run-vigilancia.ts`, com a tabela de sensibilidade.
- Os `grave` listados um a um, com a razão.
- Confirmação de que a suite passa: `npx tsx --test "src/**/__tests__/*.test.ts"`
  e `npx tsx --test "src/**/*.test.ts"`. A referência de 24/08 era **250/250
  aplicáveis**; as 2 falhas de `tests/load` e `tests/sprint1` são legadas
  (`Cannot find module 'chai'`) e já estavam partidas.
- Confirmação de que `actagevents` está **vazia** no fim, se correste tudo em
  dry-run — e se gravaste alguma coisa, diz exactamente o quê e porquê.
- Confirmação de que o `acwritelogs` **não ganhou registos** com `dryRun: false`.
