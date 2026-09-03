# A última junta — ligar os dois passos e dar-lhes o resolvedor

Data: 2026-08-24. Para o Codex. O João valida e dá por fechado.

Validei o `32cc89f` e corri a regeneração que te faltou.

**Nota de ambiente:** o `npx tsx` funciona (v4.23.12) e o `MONGO_URI` chega
através do **`railway run`** — é assim que corro tudo:

```bash
railway run npx tsx scripts/qualidade/regenerar-cadeia.ts
```

Resultado da regeneração, com as tuas duas regras a funcionar:

```
                ok    legado   divergente   sem-dados
renovação      395       84         1           1
base           315        0         1          16
TOTAL          710       84         2          17     em 813 activos
```

**Os 2 divergentes não são reais** — são o `pafpalmeira` e o
`gabriel_figueiredo1999`, que corrigi na AC a 23/08 e cujo espelho
`acrenewaldata` ainda tem os valores antigos, porque a leitura da AC só corre
dentro do `RenewalPipeline`, que está desligado. Confirmei lendo a AC directa:

```
pafpalmeira   AC a sério 2027-08-31   espelho 2026-09-30
gabriel       AC a sério 2027-10-31   espelho 2027-06-30
```

Zero divergências reais. A cadeia fecha.

---

## O que falta, e é pequeno

Duas coisas. Nenhuma é grande, e a segunda parecia enorme e não é.

---

## Tarefa 1 — Ligar os dois passos ao pipeline

**Ficheiro:** `src/services/renewal/renewalPipeline.service.ts`

O `acTurmaTagSync` e o `refundHandler` estão escritos e testados e **nada os
chama**. Ligar o pipeline hoje não aplicaria uma tag nem trataria um reembolso.

Entram na fase da AC, a seguir ao `Sync AC (tags)` e antes das timelines,
**cada um com o seu interruptor**, como o da expiração:

```
1  Sync Hotmart (vendas)
2  Sync AC (leitura)
3  Sync AC (tags)
4  AC Expiração (escrita)        gated: AcExpirationSync
5  AC Tags de turma              gated: AcTurmaTagSync        <- NOVO
6  Reembolsos                    gated: AcRefundHandler       <- NOVO
7  Discord Roles
8  Timelines de renovação
9  Reconciliar data de compra    gated: AcExpirationSync
```

As timelines ficam em último, como já estão — só fazem sentido com os espelhos
frescos.

- [ ] Criar os dois jobs em `cronjobconfigs` com `schedule.enabled: false`.
- [ ] `runGatedStep` para os dois.
- [ ] Teste: pipeline com os interruptores desligados não chama nenhum dos
      dois serviços.

---

## Tarefa 2 — Dar ao `acTurmaTagSync` o resolvedor

**Ficheiro:** `src/services/renewal/acTurmaTagSync.service.ts`

### O que está errado

O serviço só consulta o `TurmaTagMap`:

```ts
mapa: mapaPorTurma.get(normalizarNomeTurma(ciclo.turma.nome)) ?? null
```

Mas o `TurmaTagMap` é uma tabela de **excepções**, não um mapa completo. O
`scripts/seed-turma-tag-map.ts` só grava quando a observação difere da
convenção:

```ts
const convencao = resolverTagDaTurma(registo.className).tagNome
if (convencao === nomeDominante) continue    // bate -> nao grava
```

Por isso tem 7 entradas. As turmas normais nunca lá entram porque a convenção
acerta nelas.

Resultado do primeiro dry-run em produção — que ninguém tinha corrido:

```
candidatos      930
a aplicar         0
já tem           20
semMapeamento   905     97%
```

### Porque é que isto não é um problema grande

Medi se os alunos já têm a tag que o **resolvedor** produz:

```
alunos activos com turma resolvível     814
   já têm a tag                         794
   NÃO têm                                7
turmas que o resolvedor não resolve      13
```

```
"Turma 11 [renov] + REITs | 2509" -> "Aluno OGI 2509 - Renovação Turma 11"  168/168 têm
"Turma 18 | 2605"                 -> "Aluno OGI L2605 - Turma 18"           129/133 têm
"Turma 15 | 2509"                 -> "Aluno OGI L2509 - Turma 15"            77/77  têm
```

**As tags existem, os alunos têm-nas, e o resolvedor produz o nome certo.** O
`semMapeamento: 905` era artefacto do serviço.

### A correcção

O `resolverTagDaTurma(className, excepcoes)` já recebe o mapa de excepções e
devolve `origem: 'excepcao' | 'convencao'`. Usa-o.

```
1  resolverTagDaTurma(turma, excepcoes)     excepção primeiro, convenção depois
2  se não resolver -> semMapeamento         (a Equipa, a genérica, as agrupadas)
3  CONFIRMAR que a tag existe na AC, pelo nome
4  só então aplicar
```

**O passo 3 não se salta.** É o que mantém a regra do João intacta: se a tag
não existir na AC, recusa e **nunca cria**. Regista como `tagInexistente`.

### A guarda que falta, e é a mais importante

**Um aluno sem compra válida não leva tag.**

Os 7 que não têm a tag são exactamente o "grupo C":

```
dpcosta.11, ruimiguelpoliveira, nd_design10, rfndsantos   reembolsados
sonia.c.carvalho                                          reembolsada em 2022
ines.salvador91, simaopedrooliveira                       zero compras
```

Não têm a tag **porque não devem ter** — não há compra que a sustente. Há uma
decisão de 21/08 sobre eles: não lhes dar tag de turma, levar à chefia.

Hoje o serviço trata-os como candidatos. Depois do resolvedor, passaria a
aplicar-lhes a tag e a inventar sete alunos que não existem.

- [ ] O ciclo tem de ter pelo menos uma compra **não reembolsada** para o aluno
      ser candidato.
- [ ] Contador novo `semCompraValida`.
- [ ] Teste: aluno com todas as compras reembolsadas → não é candidato.
- [ ] Teste: aluno com zero compras → não é candidato.

### Números que o dry-run tem de dar

```
candidatos          ~930
jaTem               ~794
semMapeamento        ~13    a Equipa, a genérica, as agrupadas
semCompraValida        ~7    o grupo C
aAplicar                 0
```

**`aAplicar` tem de dar zero.** Se der 7, a guarda não está lá e ias aplicar
tags a alunos reembolsados. Se der centenas, o resolvedor está a produzir
nomes errados — para e reporta.

---

## Tarefa 3 — Correr o dry-run dos reembolsos

Nunca correu contra produção. Corre-o e cola a saída.

Referência: 19 alunos activos têm reembolso, mas **8 compraram outra vez
depois** e têm acesso legítimo. Só os outros 11 é que contam, e a regra olha
para o ciclo e não para o aluno.

Se o dry-run propuser remover tags a mais de 11, a regra do ciclo está errada.

---

## Regras de sempre

- Não ligar nada. Todos os interruptores ficam `false`.
- Os dois dry-runs são leituras. Regenerar timelines escreve na nossa BD e é
  permitido.
- Nunca criar uma tag na AC. Se não existir, recusa.
- Commit sim, push não. `main`.

## Relatório

- Os dois dry-runs com a saída completa.
- Confirmação de que `aAplicar` deu zero e porquê.
- Confirmação de que os interruptores continuam desligados e de que o
  `acwritelogs` não ganhou registos com `dryRun: false`.
