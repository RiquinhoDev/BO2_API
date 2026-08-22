# Handoff — fechar o emparelhamento e a lista dos 191

Continuação. O escritor da expiração ficou feito e seguro; falta o que não
depende de decisões da chefia.

Data: 2026-08-22

## ⛔ As mesmas regras de sempre

- **Não** ligar o `AcExpirationSync` nem o `RenewalPipeline`. Ambos ficam com
  `schedule.enabled: false`.
- **Não** escrever na ActiveCampaign. Nenhuma das tarefas abaixo escreve lá.
- **Commit sim, push não.** Fica tudo no `main` local. O push é do João.
- Trabalhar no **`main`**, nos dois repos. Nunca tocar nos branches `remake`.
- Comentários e nomes em **português**, como o resto do repo.

## Onde estamos

```
                    ok    divergente
Data da compra     694        191
Fim do acesso      889          1     excepção aceite, fecha sozinha
Tag da turma       861          3     ← Tarefas A e B
Percurso           455          0
```

91 testes, 0 falhas. Runner:

```bash
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

O glob entre aspas é obrigatório — a forma de directório dá
`ERR_UNSUPPORTED_DIR_IMPORT` neste Node/tsx no Windows. O jest **não está
instalado**; não instalar nada.

BD real: `railway run npx tsx <ficheiro>.ts`.

---

## Tarefa A — o seed observa, não adivinha

**Ficheiro:** `scripts/seed-turma-tag-map.ts`

O `turmatagmap` tem 5 excepções e devia ter mais. Falta-lhe a da Turma 19, e
isso deixa dois alunos marcados como divergentes sem terem problema nenhum:

```
simaoleal94        turma Turma 19 | 2610   a convenção pede  Aluno OGI L2610 - Turma 19
beatriz.sadrudin   turma Turma 19 | 2610   a tag real é      Aluno OGI 2610 - Turma 19
```

A tag da Turma 19 não leva `L` — foi decisão da chefia, porque não vai haver
lançamento. **A regra do João: as tags são criadas por eles, por isso para nós
é mais seguro ler o que existe do que construir o nome.**

O seed já observa o que os alunos da turma têm. O que o trava é este filtro,
na linha 81:

```ts
if (idxTurma !== null && Math.abs(idxTag - idxTurma) > 1) continue
```

A Turma 19 chama-se `| 2610` e a tag é `2610` — mas quando o seed correu, a
turma ainda se chamava `| 2606`, e 4 meses de diferença descartaram a tag
antes de ser contada. O filtro é uma adivinhação pelo calendário a bloquear
uma observação directa.

**O que fazer:** tirar o filtro de período. Os alunos da turma concordarem
entre si já é sinal suficiente — é para isso que existem o
`CONCORDANCIA_MINIMA` (0.7) e o `ALUNOS_MINIMOS` (3), e esses ficam.

Cuidado com o efeito colateral: sem o filtro, entram na contagem as tags de
ciclos antigos que o aluno ainda carrega (`L2302 - Turma 4` em quem hoje está
na Turma 8). Com 70% de concordância exigida isso não deve ganhar, mas
**confirma no dry-run antes de escrever**: se aparecer uma excepção a mapear
uma turma para uma tag de um período muito anterior, o filtro fazia falta e é
preciso substituí-lo por outro critério (por exemplo, só contar a tag mais
recente de cada aluno).

**Passos:**

1. Correr o dry-run como está hoje e guardar a saída, para comparar:
   ```bash
   railway run npx tsx scripts/seed-turma-tag-map.ts
   ```
2. Tirar o filtro. Correr o dry-run outra vez.
3. **Ler a lista linha a linha.** Cada excepção nova tem de fazer sentido: a
   tag tem de ser plausivelmente a daquela turma.
4. Só depois: `railway run npx tsx scripts/seed-turma-tag-map.ts --write`
5. Regenerar e confirmar que `simaoleal94` e `beatriz.sadrudin` saem da lista:
   ```bash
   railway run npx tsx -e "import('./src/services/renewal/renewalTimeline.service').then(async (m) => { const g = await import('mongoose'); await g.default.connect(process.env.MONGO_URI); await m.gerarTimelinesEmLote(); await g.default.disconnect() })"
   ```

**Esperado:** pelo menos uma excepção nova, `Turma 19 | 2610 → Aluno OGI 2610
- Turma 19`, e a divergência das tags a passar de 3 para 1.

---

## Tarefa B — a turma actual é a turma actual

**Ficheiro:** `src/services/renewal/renewalTimeline.generator.ts`

Sobra o `franciscovintem19`. Comprou a 29/07/2026 e está na `Turma 19 | 2610`,
que é a coorte de Outubro — comprou **três meses antes de a turma abrir**,
que é normal para quem entra entre turmas base.

O ciclo dele é `2607`. A regra que põe a turma actual no último ciclo tem uma
guarda de tolerância:

```ts
Math.abs(idxAtual - idxLugar) <= TOLERANCIA_MESES   // 2
```

Três meses não passam, por isso o ciclo fica com a turma de renovação por onde
ele passou, e a tag esperada sai dessa.

**O que fazer:** tirar a guarda de distância desta regra. A turma actual é um
**facto**, não uma inferência — o aluno está lá. Se o período dela não bater
com o ciclo, isso é informação que queremos ver, não motivo para a ignorar.

A regra fica: se o aluno tem turma actual, ela é a turma do último ciclo.
Ponto.

**Antes de commitar, medir.** Esta mudança toca em toda a gente:

```bash
railway run npx tsx -e "..."   # regenerar e contar os quatro elos
```

**Esperado:** `Tag da turma` melhora (o francisco sai), e os outros três elos
não pioram. Se `Fim do acesso` ou `Percurso` subirem de divergentes, para e
reporta — quer dizer que a guarda estava a tapar alguma coisa e é preciso
perceber o quê antes de a tirar.

**Testes a acrescentar** em `renewalTimeline.generator.test.ts`:

```
comprou 3 meses antes da turma abrir   → o ciclo fica com a turma actual
turma actual de periodo muito distante → continua a ficar com ela, e o
                                          desvio aparece nos elos, não some
```

---

## Tarefa C — a lista dos 191, só para ver

**Ficheiro novo:** `scripts/relatorio-data-compra.ts`

O elo `Data da compra` tem 191 divergentes: o campo **334** da AC não bate com
a última venda da Hotmart. Uma parte é o carimbo em massa de **2026-08-07**,
que já apareceu em 28 contactos — a `eva.lrei` e o `cm.love.ar` são dois deles.

**Esta tarefa não escreve nada.** Produz a lista para o João decidir.

Para cada aluno activo com divergência, listar:

```
email
o que a AC tem no 334
a data da última cobrança na Hotmart
a data da primeira cobrança do último ciclo
se o valor da AC é exactamente 2026-08-07 (o carimbo)
o que a AC tem no 337 (1ª compra) e a primeira compra real
```

Ordenar pelos do carimbo primeiro — são o lote com uma causa comum e
provavelmente resolvem-se todos da mesma maneira.

Gravar num ficheiro dentro de `.superpowers/sdd/` (é gitignored) e dar o
caminho no relatório. Não commitar a lista.

**Nota:** o campo 337 estava errado em 473 de 884 contactos numa medição de
20/08 — guarda a data da **última** compra em vez da primeira. Se for barato,
inclui a coluna; se complicar, deixa fora e diz.

---

## O que NÃO fazer

- Não mexer no `acExpirationSync.service.ts` — está fechado e validado.
- Não mexer no gatilho da expiração.
- Não escrever tags, nem remover tags, nem tocar em listas da AC.
- Não criar nem renomear turmas.
- Não implementar os passos 4 (tags obrigatórias) e 5 (reembolsos) do fluxo —
  dependem de três respostas da chefia que ainda não chegaram.

## Relatório

No fim, entregar:

- O estado dos quatro elos antes e depois de cada tarefa.
- A lista de excepções novas do `turmatagmap`, com o número de alunos que
  concordaram em cada.
- O caminho do ficheiro da Tarefa C e quantos são do carimbo de 2026-08-07.
- Confirmação de que os dois interruptores continuam desligados e de que não
  houve push.

Contexto completo do desenho:
`docs/superpowers/specs/2026-08-22-fluxo-nocturno-renovacoes.md`
