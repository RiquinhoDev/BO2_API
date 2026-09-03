# Fechar a cadeia — duas regras e a bateria de testes

Data: 2026-08-24. Para o Codex, a seguir ao `3e4b202`. O João valida.

Validei o teu trabalho: 227/227 nos testes aplicáveis (as duas falhas são as
legadas com `chai` em falta, já partidas antes), a regra das tags honrada — o
`acTurmaTagSync` lê o `TurmaTagMap` e nunca constrói o nome —, `dryRun !== false`
nos dois serviços novos, reembolsos na timeline, `0/0` desde `2701`, e o
`a-menos` já não é atribuído.

Falta uma coisa antes de isto poder ser ligado, e uma bateria de testes para
não voltarmos aqui.

---

## O problema

Prender o `legado` ao evento de compra faz com que **qualquer divergência nova
saia `divergente`**. Medi as renovações desde Fevereiro de 2026:

```
o mês da compra bate com o da turma?
   bate        114
   NÃO bate     22        16%
```

Fui ver os 22 e dividem-se limpo:

**10 — não existia turma naquele mês.** `2604` é o único mês de 2026 sem turma
de renovação nenhuma. Quem renovou em Abril foi obrigatoriamente para Maio.
Colocação forçada, correcta.

**12 — a janela da campanha.** Vê-se pelas datas:

```
24/02, 26/02, 27/02, 28/02   ->  turma de Março
01/03, 01/03, 01/03          ->  turma de Fevereiro
```

Quem compra nos últimos dias do mês entra na turma seguinte; quem compra no dia
1 entra na anterior. **A colocação segue a campanha, não o calendário.**

A regra que escrevi no handoff anterior — *"a turma do mês da compra"* — não é
o que a operação faz, e nunca foi. Especifiquei contra o calendário quando o
processo corre por campanha. A culpa é minha, não tua.

---

## Tarefa 1 — Duas regras antes de regenerar

**Ficheiro:** `src/services/renewal/renewalTimeline.generator.ts`

### Regra A — sem turma naquele mês, a colocação é correcta

Antes de marcar divergência, verificar se **existe** turma de renovação para o
período da compra. Se não existir, a colocação na adjacente foi forçada e não
é divergência.

O inventário de períodos com turma sai dos dados que já tens:

```
2601  3 turmas     2602  2 turmas     2603  1 turma
2604  NENHUMA      2605  4 turmas     2606  3 turmas
2607  2 turmas     2608  1 turma
```

Isto fecha os 10 de Abril e todos os buracos de calendário futuros, sem
tolerância nenhuma a mais.

### Regra B — janela de fronteira em DIAS

Se a compra cai a poucos dias da fronteira do período da turma, bate.

Os dados de hoje pedem **cerca de 5 dias**: o mais afastado é o dia 24 de
Fevereiro, que foi para a turma de Março.

**Tem de ser em dias, nunca em meses.** Uma tolerância de um mês volta a
apagar a `crisisabelfer` e a `silviabelbute`, que é exactamente o que
passámos a semana a corrigir.

O valor exacto é do João. Propõe 5 e mostra a sensibilidade: quantos casos
mudam com 3, 5 e 7 dias.

### O que tem de sobrar

Com as duas regras, dos 22 sobra **um**:

```
mendes.tel.su   comprou 01/06/2026   foi para a turma 2607
```

Não é fronteira nem buraco de calendário. Fica `divergente` e é isso que
queremos — um caso, não vinte e dois. (Tem três cobranças de Junho a Agosto;
vale a pena dizeres se é plano de prestações e se isso explica a colocação.)

---

## Tarefa 2 — Os incidentes desta semana viram testes de regressão

**A parte que nos tira daqui de vez.** Cada caso real que nos custou horas
passa a ser um teste com nome. Se alguma alteração futura os partir, sabemos no
segundo seguinte.

Fixtures, com os dados reais:

```
silviabelbute      compra base Set/2024, turma de renovação Set/2025
                   -> DIVERGENTE. Um ano que não comprou.

crisisabelfer      3 compras de 1 ano, última uma extensão de 97€
                   turma "[2 anos]"
                   -> DIVERGENTE. Turma dá 2 anos, compras pagam 1.

nunesnt            167€ + 97€ no mesmo dia, ciclo de 2 anos
                   turma é a coorte do ano 2
                   -> OK. Não é anomalia, é o segundo ano.

ariane.gouvea      447€ + 97€ no mesmo dia, mesma forma
                   -> OK. Enganei-me nesta uma vez; que não volte a acontecer.

paulo_rodrigues_08 397€ (prod 4346330) + 97€ (prod 3100292) a 7 dias
                   ambas PAY_IN_FULL, ofertas diferentes
                   -> um ciclo de 2 anos; campo 334 = a ÚLTIMA compra

zz.carlos          99€ MULTIPLE_PAYMENTS + 97€ PAY_IN_FULL no mesmo dia,
                   mais 4 prestações mensais
                   -> campo 334 = a PRIMEIRA cobrança
                   (foi aqui que o `every` falhou onde devia ser `some`)

azevedo.vera       comprou 28/02, turma 2603, turma 2602 existia
                   -> OK pela regra B

tiagofranco71      comprou 17/04, turma 2605, turma 2604 NÃO existia
                   -> OK pela regra A

aurelio.cavaleiro  turma base "Turma 19 | 2610", AC tinha compra+12
                   -> a expiração vem da TURMA, não da compra
```

---

## Tarefa 3 — Ângulos que ainda não testámos

Escolhidos pelos erros que realmente cometemos esta semana, não por
completude teórica.

**Ordem dos arrays.** Correr o gerador com as compras, as coortes e as tags em
ordem inversa e confirmar resultado idêntico. Tivemos **dois** bugs de
emparelhamento que dependiam da ordem do array; é o defeito que mais vezes nos
apanhou.

**Determinismo.** Gerar duas vezes e comparar documento a documento, ignorando
`geradoEm` e `updatedAt`.

**Datas de fronteira.** 31 de Janeiro; 29 de Fevereiro num ano bissexto; dia 1
do mês. E confirmar que uma compra a 01/10 dá 31/10 do ano seguinte — **395
dias, e isso é correcto**, é o arredondamento ao fim do mês. Um teste que
espere 365 está errado.

**Nunca encurtar, em todos os ramos.** Base e renovação, com e sem oferta
nomeada, com e sem turma. O cálculo menor que a AC nunca escreve.

**Filtros que escondem.** Um aluno sem `combined.status` não pode desaparecer
silenciosamente de uma medição. Foi assim que eu não vi 4 divergências que tu
viste.

**Reembolso a meio de um plano de prestações.** Metade das cobranças pagas,
metade reembolsadas. O que conta como ciclo válido?

**Espelho velho.** Toda a medição declara a idade dos dados que leu. Um número
sem idade não é auditável — três dos "4 erros" do teu relatório anterior eram
espelho desactualizado.

**Oferta sem nome, com e sem turma.** Com turma, a turma decide. Sem turma,
recusa com `semTurma` e não inventa.

**Turma genérica.** Nenhuma tag aplicada, contado como à espera e não como
erro.

---

## Tarefa 4 — Regenerar, que é o teste a sério

Nada disto está provado enquanto as timelines não forem regeneradas. Tu não
regeneraste, portanto ninguém viu ainda um veredicto real.

- [ ] Regenerar as 4.427 timelines.
- [ ] Contar os veredictos por ramo, com a idade do espelho declarada.
- [ ] **O número a vigiar é quantos `divergente` aparecem.** Se forem mais de
      uma mão cheia, alguma regra ainda está a apanhar comportamento normal —
      para e reporta antes de continuar.
- [ ] Referência de hoje, para comparares: 791 ok, 98 legado, 4 divergente,
      33 sem-dados, em 922 activos com timeline. Os 4 divergentes eram contas
      sem `combined.status` e já foram corrigidas à mão.

---

## Regras de sempre

- Não ligar nada. `AcExpirationSync` e `RenewalPipeline` ficam `false`.
- Nada escreve na AC nem na Hotmart. Regenerar timelines é escrita na nossa BD
  e é permitido.
- Commit sim, push não. `main`, nos dois repos.
- Se algum número não bater com o que dei, **investiga antes de reportar**.
  Enganei-me várias vezes esta semana e em duas delas foste tu que tinhas
  razão.
