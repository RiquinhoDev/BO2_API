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

O **atraso do event loop** e a **memória do processo** também entram: são o aviso que aparece antes de o Railway reiniciar o container.

## Como funciona, e porque é barato

```
1. contadores em memória      um incremento é um Map.set, zero I/O
2. flush para o Redis a 60s   um pipeline por minuto e por réplica (HINCRBY, soma entre réplicas)
3. snapshot horário na Mongo  um documento por hora, ~2 KB
4. painel                     lê só a Mongo: uma query indexada por intervalo
```

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
| `MONGO_PLAN_STORAGE_GB` | % do espaço contratado e semanas até ao tecto |
| `REDIS_PLAN_MEMORY_MB` | % da memória do Redis (se ausente, usa o `maxmemory` que o próprio servidor reporta) |
| `RAILWAY_SERVICE_MEMORY_GB` | % da memória do container |
| `RAILWAY_MONTHLY_BUDGET_USD` | % do orçamento mensal |

## Como ler os sinais

- **Chaves despejadas no Redis acima de zero** — a cache está a ser deitada fora antes de expirar.
  A taxa de acerto cai e a carga passa para a Mongo e para a FMP. É o sintoma que precede os
  problemas que já tivemos no Clareza.
- **Espera no limitador da FMP a subir** — o tecto somos nós, não a FMP. O `fmpThrottle` é local a
  cada processo e **não coordena réplicas**: com duas réplicas, a taxa real duplica sem ninguém dar
  por isso.
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
