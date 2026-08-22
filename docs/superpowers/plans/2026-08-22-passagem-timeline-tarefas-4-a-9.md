# Passagem — Timeline de Renovação, Tarefas 4 a 9

Documento para quem vai continuar a implementação. As Tarefas 1 a 3 estão
feitas, revistas e commitadas no `main`. Faltam seis.

Data: 2026-08-22

## O que é isto

Reconstruir na nossa BD o percurso de cada aluno cruzando três sítios que
ninguém cruzava: as compras da Hotmart, as tags da ActiveCampaign e a turma
onde está. O objectivo é responder de relance a "este aluno está bem?", uma
pergunta que hoje obriga a varrer a AC à mão e demora dez a quinze minutos.

A hierarquia de confiança não se discute:

```
1º  vendas da Hotmart     a verdade
2º  tags da AC            devem acompanhar as vendas
3º  turmas                devem acompanhar as tags
4º  histórico manual      tolerante — houve mãos humanas
```

Cada elo compara-se com o de cima, nunca com o de baixo. Assim um desvio
aponta sempre para quem se desviou.

## Documentos

- **O plano**: `docs/superpowers/plans/2026-08-21-timeline-renovacao.md`.
  Está actualizado e é a fonte. Contém o código completo de cada tarefa.
- **O desenho**: `docs/superpowers/specs/2026-08-21-timeline-renovacao-design.md`.
  Aprovado pelo utilizador. **Nota**: a Tarefa 3 divergiu dele de propósito —
  ver "Uma mudança de desenho" mais abaixo.

## Regras que não se negoceiam

- **Trabalhar sempre no `main`**, neste repo e no `Front`. Não criar branches.
  **Nunca tocar nos branches `remake`** — são a migração conduzida pelo Codex.
- **Nunca escrever na ActiveCampaign nem na Hotmart.** Só leitura, e só onde
  a tarefa o disser. Tudo o resto escreve apenas em MongoDB.
- **Reembolsos não geram ciclo.** Só `APPROVED` e `COMPLETE` contam.
- **Quando não se sabe, não se inventa.** Uma turma que a convenção não
  resolve dá o alerta `tag-por-definir` e entra em `turmasPorMapear`. Nunca
  gerar um nome de tag por palpite — uma tag errada aqui vira um falso alarme
  na ficha de um aluno real.
- Comentários e nomes em **português**, como o resto do repo. Ficheiros novos
  abrem com o cabeçalho `// ═══` e o caminho.
- O produto `3100292` chama-se "OGI - Renovação" mas **é a extensão** de 97€.
  `167€ + 97€` no mesmo dia = 2 anos.

## Testes

O `package.json` diz `"test": "jest"` mas **o jest não está instalado**. Não
instalar nada. O runner é o do Node, por `tsx`:

```bash
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

O glob entre aspas é obrigatório — a forma de directório dá
`ERR_UNSUPPORTED_DIR_IMPORT` nesta combinação de Node 24 e tsx no Windows.

Estado actual: **46 testes, 0 falhas**. Nada disto pode partir.

Para correr contra a BD real: `railway run npx tsx scripts/<ficheiro>.ts`
(não há `.env` local; a Railway injecta o ambiente).

## O que já está feito

| Tarefa | Ficheiro | Testes |
|---|---|---|
| 1 | `src/services/renewal/renewalTimeline.types.ts` | — |
| 1 | `src/services/renewal/renewalCycles.ts` | 13 |
| 2 | `src/services/renewal/turmaTagResolver.ts` | 10 |
| 3 | `src/services/renewal/renewalTimeline.generator.ts` | 23 |

As três são **puras**: recebem arrays, devolvem objectos, não sabem o que é
uma base de dados nem uma API. É de propósito — é o que as torna testáveis
sem rede e o que permite correr o gerador contra alunos reais sem escrever
nada.

Último commit: `c2c8872`.

## O que falta

### Tarefa 4 — Modelos `StudentRenewalTimeline` e `TurmaTagMap`

Duas colecções novas. A primeira guarda a timeline gerada (um documento por
aluno, `userId` único); a segunda guarda as excepções turma → tag.

O teste verifica o **schema** — caminhos, índices, defaults — sem ligar a
nenhuma base de dados, porque o `mongodb-memory-server` também não está
instalado. 6 testes.

### Tarefa 5 — Corrigir o sync de tags

Duas coisas em `src/services/renewal/acStudentTagsSync.service.ts`:

1. O `classificar()` exige `^aluno ogi\b` e **não apanha "Alunos OGI Ativos"** —
   o `s` do plural parte o `\b`. Das 658 tags da AC o espelho guarda 108,
   todas de turma; as tags de estado nunca lá chegam.
2. Acrescentar uma passagem que traz o `cdate` de cada associação
   (`GET /api/3/contacts/{id}/contactTags`), para o campo `aplicadaEm`. Sem
   ele não há alerta de tag tardia nem forma de ver o carimbo em massa de
   2026-08-07, que está em 28 contactos.

**Esta tarefa lê da AC.** É a única. Só `GET`, nunca `POST`/`PUT`/`DELETE`.

5 testes.

### Tarefa 6 — O serviço que lê os espelhos e escreve a timeline

A camada que liga o gerador puro à BD. `montarEntrada` é pura e leva testes
(4); o resto lê e escreve e valida-se contra dados reais.

**O passo mais importante de todo o plano está aqui**: o Step 6 cria
`scripts/dry-run-timeline.ts`, que corre o gerador contra alunos reais e
imprime o resultado **sem escrever nada**. Correr contra os casos conhecidos
e verificar à mão antes de deixar seja o que for chegar à BD.

### Tarefa 7 — Rota HTTP e passo no pipeline

`GET /api/renewal-timeline`, `GET /status`, `POST /generate`. Mais dois passos
no `renewalPipeline.service.ts`: o sync das tags e a geração das timelines, esta
última em último lugar porque só faz sentido com os três espelhos frescos.

### Tarefa 8 — Semear o mapa de turmas

Um script que pergunta aos dados em vez de transcrever um Excel: para cada
turma, que tag é que os alunos dela têm de facto? Onde a resposta dominante
difere da convenção, é uma excepção e fica registada. Onde não há concordância
suficiente, **não escreve** — diz que não sabe.

Dry-run por defeito. Ler a lista antes de correr com `--write`.

### Tarefa 9 — Front

Repo `C:\Users\sfcft\Documents\GitHub\Front`, branch `main`.

O separador Renovação ganha sub-separadores — Ciclos, Tags, Compras, Turmas,
Dados AC — com a faixa da cadeia sempre visível por cima. Os blocos que já
existem em `RenewalDataPanel.tsx` movem-se para dentro dos separadores; o
plano dá os intervalos de linhas exactos.

## Uma mudança de desenho que aconteceu a meio

O desenho aprovado dava **uma tag por ciclo**. Os dados reais desmentiram-no.

Um aluno que compra com extensão de 2 anos atravessa **duas coortes** — a do
ano em que comprou e a de 12 meses depois — e recebe uma tag por cada, sem
comprar outra vez. Medido nos 922 alunos com tags:

```
ciclos de 2 anos   148   99% têm a tag da coorte do ano 1
                         77% têm também a do ano 2
ciclos de 1 ano   1486   94% têm a tag da própria coorte
                         620 têm uma tag a +12 meses, e só 11 delas
                         não são explicadas por uma compra seguinte
```

Com o modelo antigo, esses 114 alunos ficavam marcados como tendo uma tag
órfã que na verdade está certa — uma fábrica de falsos alarmes.

Por isso o `Ciclo` passou a ter `coortes: CoorteCiclo[]`, uma por ano de
acesso. O plano, os modelos da Tarefa 4 e o front da Tarefa 9 já estão
actualizados para isso.

A tolerância do emparelhamento é de **±2 meses nos dois sentidos**. Para a
frente porque nunca houve coortes em Abril, Agosto, Outubro nem Dezembro e
quem compra nesses meses cai na seguinte. Para trás porque quem compra a meio
do mês entra na coorte já aberta — o `zz.carlos` comprou a 03/12/2024 e tem a
tag `L2411`.

## Coisas que a revisão levantou e ficaram por decidir

Nenhuma bloqueia as tarefas que faltam. Estão no ledger
(`.superpowers/sdd/progress.md`) e devem ser levadas ao utilizador:

- **A regra "frente antes de trás"** pode mudar a que coorte pertence uma tag
  quando um aluno de 2 anos volta a comprar a meio do ciclo (os lugares deixam
  de estar por ordem crescente). Comportamento novo, sem teste. Qual das
  leituras está certa é decisão de domínio.
- **Turmas do histórico** fora da tolerância não chegam a `turmasPorMapear` —
  só a turma actual é avaliada fora do emparelhamento.
- **`tag-por-definir` não sai** quando a turma actual não cai em coorte
  nenhuma, porque o alerta é por ciclo e a turma não foi atribuída a nenhum.
- O sufixo `[2anos]` só está testado no ramo de renovação com número.
- Uma excepção com string vazia no `turmatagmap` cai para a convenção em vez
  de ser respeitada como "não há tag".

## Como saber que está feito

```bash
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

Esperado no fim das seis tarefas: **61 testes, 0 falhas**
(13 ciclos + 10 resolver + 23 gerador + 6 modelos + 5 classificar + 4 serviço).

E na ficha de um aluno com percurso longo, o separador Ciclos mostra uma linha
por compra — o caso que motivou tudo isto (três extensões, uma só mudança de
turma) passa a ler-se de relance.

## Método que tem funcionado

Quando houver dúvida sobre o que é verdade no domínio, **perguntar aos dados**
em vez de assumir. Foi assim que se apanharam as duas correcções que mais
importaram: o corte das prestações (que fundia duas renovações da
`happyhome.carla` e lhe tirava um ano) e o modelo de coortes. Um script de
leitura contra a BD real custa dois minutos e resolve discussões que de outra
forma ficam em palpites.

E quando um teste e o código do plano se contradizem, **escalar em vez de
ajustar um dos lados** — foi o que evitou que o modelo errado fosse
implementado.

---

## Validação do backend — 2026-08-22

69 testes, 0 falhas. 4.426 timelines, das quais **917 têm ciclos**; as outras
3.509 são de contactos com tag na AC e sem compra nenhuma (ex-alunos, leads).
922 dos alunos `ACTIVE` têm timeline.

A cadeia, só para alunos activos:

```
AC compra = última venda   ok 716   divergente 169   sem dados 37
Expiração = turma          ok 873   divergente  17   sem dados 32
Tag = turma                ok 742   divergente  19   sem dados 161
```

Os 169 divergentes na primeira linha batem com uma medição feita à mão a
20/08 por outro caminho — o campo 334 da AC estava errado em 192 de 884
contactos. A timeline reproduziu o número sozinha, o que é bom sinal.

Casos conhecidos verificados um a um: a `kukuruzickosa` (4 prestações com
falhas → um ciclo), a `happyhome.carla` (5 ciclos, com os de Jan e Dez/2024
separados como deviam), o `fmmazzoco` (5 prestações → um ciclo, com o
`tag-diferente-da-turma` correcto), a `eva.lrei` e o `zz.carlos`.

### Um defeito por corrigir antes do Front

**164 dos 922 alunos activos têm uma tag marcada como órfã que não é órfã.**

O emparelhamento é um-para-um, por isso quando um aluno tem duas tags do mesmo
período — tipicamente `Aluno OGI L2411 - Turma 12` e a variante
`[2anos]` — uma fica com a coorte e a outra cai na lista de órfãs. Mas a
lista de órfãs diz "sem compra que as justifique", e isso é falso: a compra
existe e está ali ao lado, já emparelhada.

```
alexandre.alcantara.melo   coorte 2411 = L2411 - Turma 12 [2anos]
                           "órfã"      = L2411 - Turma 12
```

Correcção: uma tag de percurso só é órfã se o período dela estiver **fora da
tolerância de todas as coortes**. Se está dentro e apenas perdeu o
emparelhamento, é uma tag **duplicada** dessa coorte — outra lista, outra
frase. Sem isto o separador Tags mente a 18% dos alunos.

Há um segundo caso, mais raro, dentro do mesmo sintoma: no `zz.carlos` a
coorte do ano 2 (2512) ficou com a `2601 - Renovação`, que está um mês à
frente, em vez da `2511 - Renovação Turma 12`, que está um mês atrás e é a
da linhagem dele. A regra "frente antes de trás" decidiu. Corrigida a
etiquetagem acima, o painel mostra as duas de qualquer forma.

## Contexto visual para o Front

**Como se deve sentir: sóbrio, denso, inequívoco.**

É uma ferramenta de julgamento, não de persuasão. Quem abre este painel quer
decidir se um aluno está bem — density porque interessa ver tudo sem
navegar, e inequívoco porque a única coisa que o painel vende é confiança no
veredicto.

**Modo claro e escuro, os dois.** Não é preferência, é o que o repo já é:
`darkMode: ['class']` no `tailwind.config`, um bloco `.dark` no
`src/index.css`, e 48 componentes já com variantes `dark:`.

Usar os tokens semânticos do ShadCN (`bg-card`, `text-foreground`,
`text-muted-foreground`, `border`), nunca cores fixas. O
`RenewalDataPanel.tsx` actual ainda tem `text-gray-800` e `text-gray-500`
cravados, que não acompanham o tema — ao mover os blocos para os separadores,
trocar por tokens.

Atenção a um detalhe do tema: o `--foreground` deste projecto é **verde
escuro** (`156 80% 25%`), não preto, e o `--primary` é o verde `#17b169`. Um
verde de "está tudo bem" corre o risco de se confundir com a cor da marca —
distinguir os estados por ícone e palavra, não só por cor.

**WCAG:** não há requisito formal escrito em lado nenhum do repo. A fasquia
sensata é **2.1 AA** — 4,5:1 para texto, 3:1 para elementos de interface. E
uma regra que aqui não é opcional: **nenhum veredicto pode viver só na cor**.
A faixa da cadeia tem três estados (ok / divergente / sem dados) e cada um
precisa de ícone e palavra além da cor, senão é ilegível para quem não
distingue verde de vermelho — que é 8% dos homens.
