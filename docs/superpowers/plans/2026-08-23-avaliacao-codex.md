# Avaliação do fluxo nocturno de renovações

Data: 2026-08-23. Esta é uma avaliação, não uma autorização para ligar o
fluxo. `RenewalPipeline` e `AcExpirationSync` continuam desligados.

## Veredicto

O fluxo ficou substancialmente mais seguro: as escritas 332 e 334 têm agora
regra por tipo de turma, execução por evento, `dryRun` seguro e rasto anterior
à chamada externa. Ainda não o ligaria. Faltam as decisões dos passos de tags
e reembolsos, e encontrei dois pontos de compensação que merecem fecho: o sync
da CursEduca não preserva uma correcção humana e o envio de mensagens Discord
pode publicar com sucesso e, se o registo local falhar, apresentar o envio
como falhado.

Os dados também dizem que a tolerância histórica de meses não pode continuar
como regra das coortes mensais de 2027: hoje 270 de 1.687 coortes com tag e 187
de 1.030 associações de turma usam períodos diferentes. É compatibilidade com
o passado; em 2027 passa a ser ambiguidade entre vizinhos reais.

## 1. Onde faltam mecanismos de compensação

### CursEduca: falta uma compensação para a intenção humana

O job `CursEducaSync` reescreveu 606 de 610 utilizadores na última corrida. O
sync actualiza `User.curseduca.*`, `combined.*`, `classId` e `className`, além
de inscrições e histórico. `className`/`combined.primaryClass` alimentam a
turma actual, o painel e o Discord. Já há prova de uma correcção manual
desfeita (`marcoelho`).

O `StudentClassHistory` regista movimentos, mas não preserva uma intenção
manual contra o próximo snapshot da fonte. Falta uma destas duas redes:

1. um override explícito, com autor e validade, reaplicado depois do sync; ou
2. uma reconciliação pós-sync que compare a turma recebida com a decisão
   manual pendente e reporte/recupere a divergência.

Não proponho escolher aqui entre elas. Sem uma das duas, corrigir directamente
um campo que pertence ao sync é uma alteração temporária sem aviso.

### Mensagens Discord: falta fechar o sucesso ambíguo

`sendDiscordMessage()` publica primeiro no bot e só depois cria
`DiscordMessageLog`. Se a publicação tiver sucesso e a criação do log falhar,
o `catch` devolve falha. A regra agendada não grava `lastSentMonth`; um retry
manual pode voltar a mencionar o mesmo cargo. A mensagem já publicada não é
reversível e o bot não recebe uma chave de idempotência.

Compensação indicada: criar/confirmar uma intenção durável antes do envio e
usar uma chave idempotente no bot, ou reconciliar pelo `messageId` antes de
permitir retry. Não medi quantas vezes isto aconteceu; medi apenas que o
caminho de código permite o estado ambíguo.

### Redes que já existem

- Campo 332: evento monotónico, claim/lease, confirmação pendente e
  `AcWriteLog` antes da chamada externa.
- Campo 334: reconciliação final contra a compra âncora da Hotmart, `dryRun`
  por omissão, rasto e confirmação pendente.
- Cargos Discord: o processo recalcula o estado desejado todas as noites e
  adicionar/remover cargo é idempotente. Uma falha local pode ser reparada
  pela corrida seguinte, embora o rasto possa ficar incompleto.
- Timelines, ofertas, achievements e caches Clareza são derivados locais e
  voltam a ser calculados; não precisam de compensação noutra plataforma.

Os passos 4 (tags) e 5 (reembolsos) ainda não existem. Não avaliei a segurança
do escritor que ainda não foi desenhado. Quando existir, cada chamada externa
terá de adoptar o mesmo padrão de intenção, confirmação e reconciliação; no
caso das tags, a reconciliação do 334 tem de ficar por último.

## 2. O que corre sem revisão humana e o que escreve

Consulta de produção a 23/08/2026: há oito `CronJobConfig` activos com
`schedule.enabled=true`. A coluna “última corrida” é medida na BD; campos e
colecções resultam de auditoria do caminho executado pelo scheduler.

| Job | Agenda Lisboa | Última corrida | Escritas | Dado consumido por outra coisa |
|---|---:|---:|---|---|
| `CursEducaSync` | 23:10 diária | 610 total, 606 actualizados | `users`: `curseduca.*`, `combined.*`, `classId`, `className`, estado/sync; `userproducts`, `classes`, `studentclasshistories`, relatórios de sync | A turma actual alimenta estado, timeline, painel e cargos Discord |
| `HotmartSync` | 04:00 diária | 4.432 actualizados | `users`: `hotmart.*`, `combined.*`, `classId`, `className`, estado/sync; `userproducts`, `classes`, `studentclasshistories`, relatórios de sync | Compra/actividade alimentam estado, achievements e regras internas; este job não escreve na Hotmart |
| `AchievementEvaluation` | 04:30 diária | 4.437 actualizados | `users.achievements` e `users.achievementStats` | Resumo e experiência do aluno |
| `RenewalOfferSync` | 05:00 diária | 67 actualizados, 56 ignorados | `renewaloffers`: observação, preço, modos, amostra/sugestão e desactivação; campos editados manualmente são protegidos | O escritor 332 usa o mapa de oferta para distinguir turma base/renovação |
| `DiscordRolesSync` | 05:30 diária | 9 aplicados em 2.392 contas desejadas | Discord: cargos `R.*`; Mongo: `discordrolechanges` e `discordrolestates` | `DiscordRoleState` é usado para decidir se os avisos dos dias 8/15 têm destinatários |
| `ClarezaRefresh` | 06:00, 12:00, 18:00 | 206 lidos, zero alterações reportadas | Redis e snapshots `clareza*data` (mantém os cinco mais recentes) | Só apresentação Clareza; fora do fluxo OGI |
| `GuruTrialCheck` | 07:00 diária | 32 verificados, 1 actualizado | `users.guru.*`; `userproducts.status=PARA_INATIVAR` e metadados do motivo | Alimenta a fila de inactivação manual; não inactiva no CursEduca |
| `DiscordScheduledMessages` | 10:00 diária | zero no dia 23 | Discord: mensagens nos dias 8/15; Mongo: regras, `lastRunAt`, `lastSentMonth`, resultado e log | Comunicação externa irreversível; depende dos membros em `DiscordRoleState` |

Todos actualizam ainda metadados de execução do próprio cron. Não instrumentei
um diff campo-a-campo de cada corrida; a enumeração de campos acima é do
código, e os totais são da última execução persistida.

Fora desta lista:

- `TAG_RULES_SYNC` ficou explicitamente `isActive=false` no sistema legado.
- `RenewalPipeline` e `AcExpirationSync` continuam desligados.
- `DailyPipeline` e `EvaluateRules` continuam desligados.
- Os dois jobs de produção passaram a chamar-se `CursEducaSync` e
  `HotmartSync`; só o campo `name` mudou.

## 3. Onde o painel ainda pode mostrar “ok” a mais

### A cadeia de tags responde a uma pergunta mais estreita do que o rótulo

`tagIgualTurma` fica `ok` quando a tag esperada existe, mesmo que sobrem tags
de percurso. O universo desta tabela é `UserProduct` da plataforma Hotmart,
produto OGI e `status: ACTIVE`. Não apliquei filtro em
`User.combined.status`: são 933 inscrições activas, das quais 911 resolvem
para uma timeline. É por isso que a medição inclui as contas sem
`combined.status` que um filtro apenas por `ACTIVE` esconderia.

Nas 911 timelines:

- 886 tinham `Tag = turma` como `ok`;
- 168 desses tinham também pelo menos uma tag duplicada;
- 9 tinham também pelo menos uma tag verdadeiramente órfã.

As duplicadas não são, por si, erro: foi precisamente a separação necessária
para deixar de chamar órfã à variante `[2anos]`. Mas os 9 casos com órfã
mostram que o verde do elo significa apenas “a esperada está presente”, não
“o conjunto de tags está limpo”. O separador Tags mostra a sobra; a faixa da
cadeia deve dizer “tag esperada presente” ou incorporar um estado “presente
com extras”. Caso contrário há nove falsos “está tudo bem” no resumo.

### Os outros elos medidos

- Dos 791 `Expiração` classificados `ok`, zero estava fora do último dia civil
  do mês esperado. A diferença entre `00:00` e `23:59:59.999` é representação
  do campo de data, não um dia de acesso diferente.
- O elo 334 compara o dia da compra âncora, não a última prestação. No `HEAD`,
  o dry-run verificou 911 activos: 887 certos, 23 sem dados e uma alteração
  proposta, `paulo_rodrigues_08@hotmail.com`, de 02/12/2024 para 25/11/2024.
  Não foi executada.
- O elo da expiração ficou com 791 `ok`, 64 `legado`, 34 `a-menos`, 4
  `divergente` e 18 `sem-dados`. Os 98 desvios do mesmo evento antigo eram
  duas coisas opostas: nos 64 a AC dá mais acesso e continuam `legado`; nos
  34 a regra dá mais do que a AC e passam a `a-menos`, uma lista de trabalho.

Não encontrei outro “ok” demonstravelmente falso na cadeia actual. Não medi
o conteúdo visual fora do painel de renovação.

## 4. O que muda com turmas mensais em 2027

O emparelhamento usa `TOLERANCIA_ATRAS=2` e `TOLERANCIA_FRENTE=4`. A razão era
a inexistência de coortes em Abril, Agosto, Outubro e Dezembro e alguns atrasos
históricos. Com uma coorte real em cada mês, duas coortes adjacentes deixam de
ser equivalentes.

Medi os 933 activos contra as timelines actuais:

| Emparelhamento | Total | Período exacto | Período diferente |
|---|---:|---:|---:|
| coorte ↔ tag | 1.687 | 1.417 | 270 (16,0%) |
| coorte ↔ turma | 1.030 | 838 | 192 (18,6%) |

Nas turmas, 187 das 192 diferenças estão dentro da janela `-2..+4`; cinco são
associações da turma actual fora da janela, preservadas por regra explícita.
Nas tags, os 270 distribuem-se por `-2: 1`, `-1: 64`, `+1: 134`, `+2: 53`,
`+3: 14`, `+4: 4`.

Uma simulação pura com 12 coortes e 12 tags mensais torna a ambiguidade
inequívoca: a janela actual aceita 71 pares onde só 12 são exactos; todas as
12 coortes têm mais de um candidato, há 59 alternativas erradas e 63.424
emparelhamentos perfeitos admissíveis.

Isto não quer dizer que 270 associações actuais estejam erradas: mede quanto
do legado depende da tolerância. Quer dizer que manter a mesma janela em 2027
pode roubar a tag ou a turma à coorte mensal vizinha, tornar uma tag correcta
duplicada/órfã e produzir um `Tag = turma` enganador.

A saída segura é uma regra temporal, não uma troca global:

- coortes anteriores a 2027 conservam a tolerância histórica;
- coortes a partir de `2701` usam tolerâncias `0/0`, correspondência exacta
  por `YYMM`, salvo excepção explícita e auditada;
- os ciclos `[2anos]` continuam intactos até a última extensão terminar em
  Setembro de 2027; o segundo ano continua a criar a sua própria coorte;
- Turma 1 e Turma 2 nunca entram na linhagem genérica de renovação.

`DIAS_MAX_ENTRE_PRESTACOES=90` não deve mudar só por existirem coortes
mensais: agrupa cobranças do mesmo aluno/oferta/produto/valor, não coortes. Se
passarem a existir ciclos autónomos mensais no mesmo SKU, o tempo deixa de
distinguir ciclo de prestação e será necessário um identificador de plano ou
transacção.

### A janela na turma genérica e o Discord

O cargo `R.*` não controla acesso neste sistema e tem permissões Discord zero;
serve para as menções dos dias 8 e 15. Não auditei todos os overrides de canais
directamente no Discord, mas a finalidade foi confirmada pelo João.

Volume observado de Março a Agosto de 2026 (Agosto parcial): 151 ciclos de
renovação, ou 161 alunos distintos por oferta de renovação. Nos cinco meses
completos foram 29–31 por mês em média, com amplitude de 10–12 a 50–51. Para
capacidade, a genérica deve suportar cerca de 30 alunos/mês.

As três opções avaliadas foram: dar `YYMM` à genérica, conservar o cargo antigo
enquanto está na genérica, ou aceitar a remoção temporária. Como o cargo só
serve para avisar quem ainda não renovou, a decisão registada é aceitar a
remoção temporária: quem já pagou não perde acesso nem uma comunicação
necessária e recebe o novo cargo quando entrar na turma final.

## 5. Validação final dos escritores e testes

### Campo 332 — antes e depois de a turma decidir o ramo

Ambos os comandos foram corridos com `dryRun: true`; nenhuma alteração foi
enviada à ActiveCampaign.

| Contador | Antes | Depois |
|---|---:|---:|
| `alreadyInSync` | 549 | 800 |
| `semTurma` | 268 | 1 |
| `skippedWouldShorten` | 62 | 73 |
| `skippedNoHotmartData` | 15 | 17 |
| `wouldWrite` | 0 | 0 |

O resultado confirma a correcção estrutural: 251 alunos deixaram de ser
recusados e passaram a já alinhados; só sobra a conta de equipa conhecida. A
fotografia final teve +11 em `skippedWouldShorten` e +2 em
`skippedNoHotmartData`, em vez dos +13 encurtamentos previstos na medição
preparatória. Estes deltas são observados, mas o segundo não explica o
primeiro: o ramo `semVenda` também conta `skippedWouldShorten` quando encurta.
As datas que aumentariam aparecem na lista completa de divergentes, mas não
em `wouldWrite`: a guarda “só por evento novo” impede que um evento antigo
seja escrito. Isto é segurança do escritor, não autorização para contornar a
guarda.

### Campo 334

O dry-run final verificou 911: 887 já certos, 23 sem dados, zero escritos e a
única alteração proposta de `paulo_rodrigues_08@hotmail.com` já descrita
acima. Não foi executada.

### Testes reproduzíveis

```powershell
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
# 197 testes

npx tsx --test "src/services/renewal/__tests__/*.test.ts" `
  "src/models/renewal/__tests__/*.test.ts" `
  "tests/jobs/cron-job-change-plans.test.ts"
# 203 testes
```

O total 197 corrigido no handoff estava certo antes destas alterações. A1 e
A2 acrescentaram seis testes; por isso, no `HEAD` final, o comando alargado
passa a 203 e o comando só dos serviços passa de 191 para 197.

Os ficheiros `tests/load/load.test.ts` e
`tests/sprint1/architecture.test.ts` não pertencem a esta suite nem foram
executados; convém decidir separadamente se ainda são testes suportados.

## 6. As seis contas sem `combined.status`

| Email | Turma actual | Compra AC | Expiração AC |
|---|---|---:|---:|
| `emergesense@gmail.com` | — | — | — |
| `ruifilipeteixeiragamer@gmail.com` | — | — | — |
| `cmbcosta@gmail.com` | Turma 19 \| 2610 | 09/07/2026 | 31/07/2027 |
| `aurelio.cavaleiro@gmail.com` | Turma 19 \| 2610 | 03/08/2026 | 31/08/2027 |
| `asdrubal.sff@gmail.com` | Turma 19 \| 2610 | 20/08/2026 | 30/06/2027 |
| `gabriel_figueiredo1999@hotmail.com` | Turma 19 \| 2610 | 22/08/2026 | 30/06/2027 |

O `HotmartSync` chama o Universal Sync. Um utilizador novo recebe `ACTIVE` por
defeito, mas um utilizador existente com estado nulo não é normalizado: o
serviço só escreve `ACTIVE` numa reactivação ou quando o estado actual já é
`INACTIVE` e há compra válida. `null` não satisfaz essa condição.

O escritor 332 parte de todos os `ACRenewalData` e consulta `User` em bloco
apenas para obter `hotmart.enrolledClasses`; não selecciona nem filtra
`combined.status`. Portanto não ignora estas seis contas quando existe
espelho AC. As quatro com Turma 19 são precisamente as quatro divergências
reais do elo da expiração. Esta tarefa não alterou qualquer estado.

## 7. Renovações sem compra no espelho

No universo operacional de 911 utilizadores OGI activos resolvidos, há três
casos materiais — dois além da Silvia:

| Email | Evidência de renovação | Última venda no espelho | Expiração AC |
|---|---|---|---:|
| `silviabelbute@gmail.com` | Turma/tag 2509 | 23/01/2025, última de 5 prestações iniciadas em 23/09/2024 | 30/09/2026 |
| `ruir41@gmail.com` | Turma/tag 2509 | nenhuma | 30/09/2026 |
| `marianapenasimoes@gmail.com` | tag 2507; turma `Equipa` | nenhuma | 31/07/2026 |

A Mariana tem `UserProduct` OGI `ACTIVE`, origem `PURCHASE`, mas o nome e a
turma `Equipa` exigem validação humana. `santosnascimentogca@gmail.com` foi
excluído por ser a conta de equipa já conhecida.

Há ainda um caso comprado noutro email: `simaopedrooliveira@sapo.pt` não tem
venda, mas o nome exacto coincide com `simaopedroliveira@gmail.com`, onde as
compras de 22/05/2025 e 27/05/2024 sustentam o ciclo de dois anos. Não entra
nos três. A confirmação directa na API Hotmart ficou fora desta medição; a
conclusão usa os espelhos locais e `UserProduct`.

## 8. Reembolsos no painel

Há uma correcção factual à avaliação inicial: o painel já carrega o histórico
Hotmart bruto e mostra `REFUNDED`/`CHARGEBACK` no separador Compras. O que não
os mostra é a timeline/cadeia, porque `renewalCycles` só aceita `APPROVED` e
`COMPLETE`, e `StudentRenewalTimeline` persiste apenas os ciclos resultantes.

Incorporá-los na timeline tem custo baixo a moderado: novo campo de eventos
não válidos nos tipos/modelo/gerador e upsert, representação no Front e
regeneração. Não exige nova chamada à Hotmart. Uma alternativa mínima é só
destacá-los melhor no separador Compras que já existe.

Os 11 `UserProduct` OGI activos cujo histórico tem zero pago e apenas valores
devolvidos são:

| Email | Pago | Devolvido | Turma actual |
|---|---:|---:|---|
| `afonso.mlurdes.73@gmail.com` | 0€ | 447€ | Turma 15 \| 2509 |
| `dpcosta.11@gmail.com` | 0€ | 397€ | Turma 18 \| 2605 |
| `inunorodrigues@icloud.com` | 0€ | 90€ | Turma 15 \| 2509 |
| `miguelfilipe2132@gmail.com` | 0€ | 397€ | Turma 15 \| 2509 |
| `mlurdesrodriguesafonso@gmail.com` | 0€ | 397€ | Turma 16 \| 2511 |
| `nd_design10@hotmail.com` | 0€ | 180€ | Turma 18 \| 2605 |
| `rfndsantos@gmail.com` | 0€ | 3,97€ | Turma 18 \| 2605 |
| `ruimiguelpoliveira@gmail.com` | 0€ | 447€ | Turma 18 \| 2605 |
| `ruir41@gmail.com` | 0€ | 196€ | Turma 11 [renov] + REITs \| 2509 |
| `savelha@gmail.com` | 0€ | 99€ | Turma 16 \| 2511 |
| `sonia.c.carvalho@gmail.com` | 0€ | 197€ | Turma 3 \| 2211 |

Esta lista é para decisão da chefia; não implica nem propõe inactivação.

## Condições antes de ligar

1. Fechar com a chefia o desenho de tags obrigatórias e reembolsos.
2. Validar o relatório completo de divergentes dos escritores 332/334.
3. Decidir a compensação de correcções humanas após `CursEducaSync`.
4. Fechar o sucesso ambíguo das mensagens Discord ou aceitar explicitamente o
   risco de menção duplicada.
5. Implementar a fronteira temporal das tolerâncias antes das primeiras
   coortes mensais de 2027.

Até lá, os interruptores de escrita do fluxo de renovações devem permanecer
desligados.
