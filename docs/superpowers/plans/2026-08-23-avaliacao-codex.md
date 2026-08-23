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
de percurso. Nos 933 `UserProduct` OGI activos, 911 tinham timeline:

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
- O elo 334 compara o dia da compra âncora, não a última prestação. O dry-run
  da reconciliação verificou 911 activos: 888 certos, 23 sem dados, zero
  divergentes no momento da medição. Os sem dados aparecem como tal.
- As 100 divergências históricas do ramo renovação passaram a `legado`; isso
  corrige um falso alarme, não esconde um erro novo.

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

Isto não quer dizer que 270 associações actuais estejam erradas: mede quanto
do legado depende da tolerância. Quer dizer que manter a mesma janela em 2027
pode roubar a tag ou a turma à coorte mensal vizinha, tornar uma tag correcta
duplicada/órfã e produzir um `Tag = turma` enganador.

A saída segura é uma regra temporal, não uma troca global:

- coortes anteriores a 2027 conservam a tolerância histórica;
- coortes mensais usam correspondência exacta por `YYMM`, salvo excepção
  explícita e auditada;
- os ciclos `[2anos]` continuam intactos até a última extensão terminar em
  Setembro de 2027; o segundo ano continua a criar a sua própria coorte;
- Turma 1 e Turma 2 nunca entram na linhagem genérica de renovação.

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
