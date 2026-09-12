# Painel de Capacidade & Consumo

Responde a três perguntas, por esta ordem:

1. **Onde estamos a bater?** — cada recurso em percentagem do tecto contratado, ordenado por risco.
2. **Onde é que o consumo vai?** — por rota, por fornecedor externo, por colecção, por job.
3. **E se crescermos?** — consumo por aluno e projeção para ×1,5, ×2 e ×3 da base actual.

No Front: menu **Análise de Dados → Capacidade & Consumo**, ou o link directo `/ops/capacidade`.

## O que é medido

| Frente | Medida | Onde é recolhida |
|---|---|---|
| FMP | chamadas/dia por endpoint, 429s, latência, chamadas poupadas por deduplicação, espera no limitador | `FmpJsonClient` e `fmpThrottle` |
| MongoDB | dados, índices, total, documentos; comandos por colecção e latência | `dbStats` + `$collStats` + eventos `commandStarted/Succeeded` do driver |
| Redis | memória usada, chaves, despejos, taxa de acerto, peso por família de chaves | `INFO`, `DBSIZE`, `SCAN` + `MEMORY USAGE` por amostra |
| Railway | CPU, memória, egress e custo estimado do ciclo | API GraphQL do Railway |
| API | pedidos, latência p95/p99 e bytes de saída por rota | middleware `routeUsageInstrumentation` |
| Jobs | execuções, falhas e tempo total por job | `CronJobExecutor` |
| Negócio | alunos, alunos activos, inscrições, produtos activos | `estimatedDocumentCount` + vista `DashboardStats` |
| Estabilidade | reinícios do processo, erros 5xx, jobs falhados | uptime a descer entre snapshots + contadores |

O **atraso do event loop** e a **memória do processo** também entram: são o aviso que aparece antes de o Railway reiniciar o container.

## Como funciona, e porque é barato

```
1. contadores em memória      um incremento é um Map.set, zero I/O
2. flush para o Redis a 60s   um pipeline por minuto e por réplica (HINCRBY, soma entre réplicas)
3. snapshot horário na Mongo  um documento por hora, ~2 KB — vive 14 dias
4. resumo diário e semanal    um documento por dia (400 dias) e um por semana (para sempre)
5. painel                     lê só a Mongo: uma query indexada por intervalo
```

### A escada de retenção

| Degrau | Para quê | Retenção | Tamanho |
|---|---|---|---|
| Horário | investigar a semana em curso, com detalhe por rota/colecção | 14 dias | ~670 KB |
| Diário | tendência e "semanas até ao tecto" | 400 dias | ~400 KB |
| Semanal | memória longa, comparar meses e anos | sem limite | ~52 KB/ano |

Em regime, a medição inteira ocupa **cerca de 1 MB**. Apagar é automático, por TTL:
não há cron de limpeza.

Cada resumo guarda **média e pico**. Só a média mentia — uma semana com seis dias calmos
e um pico de seis horas tem média baixa, e é o pico que rebenta o tecto. Nas métricas que
são nível e não caudal (espaço ocupado, número de alunos) o resumo fica com o **último**
valor, porque é esse que conta contra o tecto.

As repartições por etiqueta (rota, colecção, endpoint, job) só existem no degrau horário.
Por isso o painel avisa de que janela vêm, e ela nunca passa de 14 dias.

Quem abre o painel não paga o custo de medir — as sondas correm no cron, nunca no pedido.

O detalhe caro (tamanho por colecção, peso por prefixo de Redis, consumo facturado do Railway) só é
recolhido **uma vez por dia**, no fecho da hora das 04:00 UTC.

Custo de armazenamento da própria medição: 24 documentos/dia × ~2 KB ≈ **18 MB/ano**, com TTL de 400
dias. A janela de contadores no Redis expira ao fim de 15 dias e é apagada assim que o snapshot da
hora fica gravado.

## Endpoints

| Rota | Para quê |
|---|---|
| `GET /api/ops/capacity?days=14` | Relatório completo a partir do histórico. É o que o painel usa. |
| `GET /api/ops/capacity?days=180&granularity=week` | Vista semanal: uma barra por semana, com média por dia e pico. |
| `GET /api/ops/capacity/live?collections=true` | Sondagem imediata, sem histórico. Corre probes a sério — usar para verificar, não em ciclo. |

Ambas são leitura autenticada. Não há endpoint de escrita: o snapshot é escrito pelo cron interno,
não por HTTP.

## Configuração

Nada disto é obrigatório — sem estas variáveis o painel mede tudo na mesma, apenas sem percentagem
de tecto. Ver `.env.example`, secção *Painel de Capacidade & Consumo*.

| Variável | O que desbloqueia |
|---|---|
| `RAILWAY_API_TOKEN` + `RAILWAY_PROJECT_ID` | cartão de custo e egress facturado |
| `FMP_PLAN_CALLS_PER_DAY` | % da quota FMP e projeção de escala |
| `MONGO_PLAN_STORAGE_MB` / `MONGO_PLAN_STORAGE_GB` | % do espaço contratado e semanas até ao tecto. Usar MB nos planos pequenos: o Atlas M0 são 512 MB e em GB inteiros não havia como escrevê-lo |
| `REDIS_PLAN_MEMORY_MB` | % da memória do Redis (se ausente, usa o `maxmemory` que o próprio servidor reporta) |
| `RAILWAY_SERVICE_MEMORY_GB` | % da memória do container |
| `RAILWAY_MONTHLY_BUDGET_USD` | % do orçamento mensal |

## O que pode derrubar a API

O painel tem três restrições dedicadas a isto, e aparecem no topo quando disparam:

- **Reinícios do processo por dia** — detectados pelo uptime a descer entre snapshots. O
  Railway reinicia o container em silêncio; sem isto, um ciclo de reinícios passa
  despercebido. Acima de zero já é sintoma.
- **Erros 5xx por dia** — falhas nossas a servir pedidos. Sobem quase sempre com um job a
  rebentar.
- **Execuções de jobs falhadas** — inclui o refresh diário do Clareza, que passa pelo
  `CronJobExecutor` e por isso é medido sem código próprio.

Duas coisas que o painel **não** cobre e valem uma decisão à parte:

- Não existem handlers de `unhandledRejection` nem de `uncaughtException` no projeto. No
  Node 18+ uma promessa rejeitada sem `catch` **mata o processo**. O painel conta o
  reinício depois de acontecer; não o evita.
- O serviço no Railway não tem `healthcheckPath` configurado. Um processo pendurado que
  não saia não é detectado nem reiniciado.

## Dados mortos

Secção própria no painel, alimentada pelo snapshot detalhado diário. Responde a três
perguntas separadas, porque a acção que cada uma pede também é diferente:

- **Colecções paradas** — ocupam espaço e não receberam um único comando na janela medida.
  Sai do cruzamento entre o tamanho por colecção e o contador `mongo.commands{collection}`
  que já existia; não custa uma query nova. *Parado não é o mesmo que descartável*: uma
  colecção lida uma vez por trimestre aparece aqui.
- **Sem modelo no código** — existem na base e nenhum modelo do mongoose as referencia.
  São restos de versões antigas. Confirmar antes de apagar.
- **Histórico antigo nas que pesam** — quanto de cada colecção tem mais de 90 e de 180
  dias, e quanto foi escrito ontem. Uma percentagem alta na coluna dos 90 dias é o sítio
  óbvio para um TTL.

**Índices nunca usados ficam de fora.** Precisam de `$indexStats`, que o Atlas bloqueia nos
planos partilhados — tal como `serverStatus`, `connPoolStats` e `hostInfo`. Num plano
dedicado passam a estar disponíveis, e valem a pena: os índices deste cluster são dezenas
de megabytes.

## Retenção

**Não se apaga histórico.** A colecção `userhistories` é toda mantida, e não existe no
código nenhuma forma de a fazer expirar. Foi uma decisão explícita, depois de se ver o que
lá está: o que parecia ruído de migração — registos sem campo e sem valor anterior — é a
forma como se regista uma inscrição num produto, porque numa inscrição não há valor
anterior. São `FIRST_ENROLLMENT` e `PRODUCT_ADDED`, marcados `HIGH`, e são história
comercial: a data em que cada aluno entrou e em que comprou cada produto.

A única retenção que existe é a dos **snapshots de utilizador**:

```
npm run retention:plan     # simula, não altera nada
npm run retention:apply    # aplica
```

Destes, só o mais recente de cada aluno é alguma vez lido — `getLastUserSnapshot`, para o
diff da sincronização seguinte. Os outros dias são cópias sem leitor. Retenção por omissão:
2 dias (`USER_SNAPSHOT_DAYS`).

Mudar o valor no modelo não chega: o Mongo só altera um índice TTL que já existe por
`collMod`, e é isso que o script faz — quando alguém o corre, não no arranque.

## Como ler os sinais

- **Chaves despejadas no Redis acima de zero** — a cache está a ser deitada fora antes de expirar.
  A taxa de acerto cai e a carga passa para a Mongo e para a FMP. É o sintoma que precede os
  problemas que já tivemos no Clareza.
- **Espera no limitador da FMP a subir** — o tecto somos nós, não a FMP. O `fmpThrottle` é local a
  cada processo e **não coordena réplicas**: com duas réplicas, a taxa real duplica sem ninguém dar
  por isso.
- **Chamadas FMP recusadas por quota (429)** — o retry espera pela viragem do minuto (ou pelo
  `Retry-After`, quando vem), em vez dos 2 segundos fixos do retry genérico. A quota da FMP é por
  minuto: com 2 segundos, as três tentativas caíam todas dentro do minuto que já tinha recusado a
  primeira. Continua a haver um tecto de 500 na fila do limitador — acima disso a chamada é
  **rejeitada**, não adiada.
- **Atraso do event loop no p99 a subir com memória estável** — não é falta de RAM, é trabalho
  síncrono a bloquear o processo.
- **Rotas no topo do tráfego de saída** — é por aí que sai o egress que o Railway factura.

## Limitações conhecidas

- A projeção de escala é linear e assume que o consumo variável cresce com o número de alunos.
  Serve para escolher plano e perceber o que rebenta primeiro; não serve para prever o dia.
- A parte fixa de cada métrica (o refresh diário de mercado da FMP, o piso de um serviço no Railway)
  está estimada por percentagem, não medida. Depois de duas ou três semanas de histórico vale a pena
  substituir essas percentagens pelos valores reais observados nos dias de menor tráfego.
- O esquema da API do Railway pode mudar sem aviso. Se mudar, o cartão de custo passa a
  "indisponível" com a razão; o resto do painel não é afectado.
- A estimativa de memória por família de chaves do Redis vem de uma amostra de 50 chaves por
  prefixo, extrapolada. É uma ordem de grandeza, não um número exacto.
