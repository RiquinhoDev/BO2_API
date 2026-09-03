# O sistema de vigilância — o que já existe e o que falta

Data: 2026-08-24. Para o Codex, depois dos passos 4 e 5.

O João pediu um sistema que vigie remexidas à mão e ponha os casos numa tabela
de validação no Front. **Não é para construir de raiz. Está construído e
desligado**, em dois pedaços.

---

## O que já existe

### 1. `renewalAcSync.service.ts` — o esqueleto certo

É um sistema completo de plano → aprovação → execução → reversão:

```
generatePlan(windowHours = 26)     detecta mudanças e cria propostas
approveChanges(ids, approvedBy)    aprovação humana, com autor
executePlan(options)               executa o que foi aprovado
revertChange(changeId, revertedBy) desfaz, com autor
expireStaleChanges()               caduca o que ninguém reviu
getRenewalAcStatus()               estado para o Front
```

Grava em `RenewalAcChange` com `action`, `source`, `status`,
`payload {before, after}` e `context {previousClassName, newClassName}`. Há
rotas em `src/routes/renewalAc.routes.ts`.

**Já correu.** Tem 132 registos, todos `APPLY_TAG / CLASS_CHANGE / BLOCKED`, o
último a 29 de Julho. Exemplo real:

```
patmarquessantos   de "Turma 9 [renov] + REITs | 2503"
                   para "Turma W0OvygXo7j"           -> BLOCKED
```

Bloqueou porque a turma nova não tem nome parseável — é um `classId` cru. Ou
seja: **detectou correctamente uma remexida esquisita e recusou-se a agir.**
Isso é o comportamento certo.

Tem também um disjuntor anti-massa: se mais de 5% dos alunos mudarem de turma
em 26 horas, assume falha da API da Hotmart e não gera plano nenhum.

### 2. O subsistema de monitorização de tags

Modelos, serviços e controladores completos, de Janeiro de 2026:

```
src/services/tagMonitoring/weeklyTagMonitoring.service.ts
src/services/tagMonitoring/criticalTagManagement.service.ts
src/services/tagMonitoring/tagNotification.service.ts
src/controllers/tagMonitoring/*.ts
```

**Nunca correu.** `ac_native_tags_snapshots` e `weekly_native_tag_snapshots`
estão a zero, e as 5 `critical_tags` estão todas `isActive: false`.

### 3. O que nós construímos e que faltava a eles

O `AcWriteLog`. É a peça que torna a vigilância fiável: **sabemos exactamente o
que fomos nós a escrever**. Sem isso, qualquer sistema de detecção acusa as
suas próprias escritas.

---

## O problema: dois escritores para a mesma coisa

O `renewalAcSync` **também escreve** na AC — datas, tags e reembolsos, atrás
dos seus próprios interruptores (`RENEWAL_AC_WRITE_DATES`,
`RENEWAL_AC_WRITE_TAGS`, `RENEWAL_AC_PROCESS_REFUNDS`, todos por definir).

E escreve de forma que hoje sabemos estar errada:

```ts
const newTag = buildTurmaTagName(ch.className)   // CONSTRÓI o nome da tag
```

**Constrói o nome em vez de o ler.** É exactamente o que a regra do João
proíbe — as tags são criadas por eles, e adivinhar o nome cria uma tag nova na
AC. Foi por isso que construímos o `turmatagmap`.

Ter dois escritores, um deles com uma regra revogada, é a fuga mais séria que
sobra no sistema.

---

## A proposta: separar os papéis

```
renewalAcSync      passa a VIGIAR e mais nada
                   detecta, propõe, guarda em RenewalAcChange, nunca escreve

acExpirationSync   e os passos 4 e 5 são os ÚNICOS escritores
   + tags de turma
   + reembolsos
```

Isto dá ao João o que ele pediu, reaproveita o plano/aprovação/reversão que já
existe, e resolve a duplicação de escritores de uma vez.

---

## Tarefa 1 — Desarmar o escritor do `renewalAcSync`

**Ficheiro:** `src/services/renewal/renewalAcSync.service.ts`

- [ ] `executePlan()` deixa de escrever na AC. Ou se remove, ou passa a marcar
      a proposta como `PARA_HUMANO`.
- [ ] Remover `buildTurmaTagName` do caminho de escrita. Se ficar para
      apresentação, tem de ler o `turmatagmap`, nunca construir.
- [ ] Os gates `RENEWAL_AC_WRITE_*` deixam de existir. Um interruptor que já
      não liga nada é uma armadilha para quem vier a seguir.
- [ ] `generatePlan`, `approveChanges`, `revertChange` e `expireStaleChanges`
      **ficam** — são a vigilância.

## Tarefa 2 — Vigiar o que interessa, não só a turma

Hoje só detecta mudanças de turma e reembolsos. Os incidentes desta semana
mostram que falta mais:

```
campo                         onde vive                        incidente real
turma actual                  users.hotmart.enrolledClasses    já detecta
estado do reembolso           hotmartsalehistories             já detecta
expiração (332)               acrenewaldata.expirationDate     -
data de compra (334)          acrenewaldata.purchaseDate       os 144 de 23/08
tags de turma                 acstudenttags[].tags             a crisisabelfer
combined.status               users.combined.status            as 6 sem estado
estado do UserProduct         userproducts.status              -
```

O `acstudenttags` já guarda `aplicadaEm` por tag, portanto detectar uma tag
nova é comparar duas listas.

**O caso que justifica isto:** a `crisisabelfer` recebeu a
`Aluno OGI 2605 - Renovação Turma 5` e a `Alunos OGI Ativos` a **07/08/2026**,
de origem que nunca conseguimos atribuir. Ninguém deu por isso. Foi encontrada
a 24/08 por acaso, e nessa altura tinha treze meses de acesso por pagar.

- [ ] Fotografia nocturna dos campos acima, por aluno.
- [ ] Comparar com a véspera.
- [ ] **Subtrair o que fomos nós** — cruzar com o `AcWriteLog`. O que
      coincidir com uma escrita nossa não é remexida.
- [ ] O que sobra entra em `RenewalAcChange` com `source: 'DERIVA_EXTERNA'`.

## Tarefa 3 — A fila tem de poder ser esvaziada

**A parte sem a qual nada disto vale.**

Cada linha tem de poder ser marcada como **aceite**. Aceitar grava o valor novo
como a nova referência e o caso **nunca mais volta**.

É a lição da semana inteira. O `a-menos`, a `Alunos OGI Ativos` caducada, o
`legado` — todas viraram ruído por serem listas que ninguém podia limpar, e
uma lista que não se limpa deixa de ser lida. Foi assim que a Silvia esteve
dois anos à vista sem ninguém a ver.

O `approveChanges` já grava `approvedBy`. Falta o simétrico: `aceitarDeriva`,
com autor, data e motivo, que rebaseia.

- [ ] Estado novo `ACEITE` no `RenewalAcChange`.
- [ ] Aceitar actualiza a fotografia de referência.
- [ ] Teste: aceitar uma deriva e correr outra vez → não reaparece.

## Tarefa 4 — A tabela no Front

Colunas: aluno, campo, valor antes, valor depois, quando foi detectado, e
**o que é que isto desalinha**.

A última é a que faz a diferença entre uma fila útil e um log. "A turma mudou"
não diz nada; "a turma mudou e a expiração deixou de bater com ela" diz.

Dois botões: **aceitar** e **corrigir**. Corrigir leva à correcção manual que
já existe, com dry-run antes.

- [ ] Verificar o que as rotas em `renewalAc.routes.ts` já servem — pode ser
      que grande parte do Front já esteja feita.

## Tarefa 5 — Decidir o que fazer com a monitorização de tags

`weeklyTagMonitoring` foi construído em Janeiro e nunca correu. Ou se liga e
integra na fila desta vigilância, ou se apaga.

**Não deixar como está.** Código morto que parece vivo é pior do que código
que não existe — alguém vai assumir que a vigilância de tags está a funcionar.

- [ ] Ler os três serviços e dizer se valem a pena.
- [ ] Recomendar: integrar ou remover. Com uma razão.

---

## Regras de sempre

- Não ligar nada. Nem esta vigilância — primeiro mede-se quantas derivas por
  noite ela detectaria, e só depois se decide.
- `dryRun` por omissão em tudo.
- Commit sim, push não. `main`.

## Relatório

- Quantas derivas por noite a vigilância detectaria, por campo, medido sobre
  os últimos dias de dados que existirem.
- Se esse número for grande, **para e reporta antes de continuar**: uma fila
  com centenas de linhas por noite nasce morta.
