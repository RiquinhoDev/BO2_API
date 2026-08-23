# Teste de qualidade do sistema de renovações

Data da execução: 2026-08-23/24. Snapshot Railway e APIs consultados em modo
somente leitura. Os interruptores `AcExpirationSync` e `RenewalPipeline` ficaram
desligados.

## Quadro de decisão

| dimensão | resultado | nota |
|---|---:|---|
| conformidade | 911 timelines | 791 conforme, 98 legado, 4 erro, 18 sem dados |
| determinismo | 4.427 timelines | 0 diferenças |
| fidelidade do espelho | 40 amostrados | 0 divergências, 0 falhas de API |
| casos-limite | 10 testes | 10/10 passam |
| falhas a meio | 5 pontos | 0 ficam presos |
| dias de acesso | 889 ciclos de 911 timelines | mínimo 365,00; mediana 374,14; nenhum <350 |

O número de conformidade não é 922 porque essa referência não é reproduzível
no snapshot atual. O filtro fixo encontra 933 `UserProduct` OGI/Hotmart/ACTIVE;
22 apontam para um `userId` sem documento `User`, deixando 911 alunos
resolvíveis e 911 timelines. A diferença foi investigada e fica reportada,
não absorvida num arredondamento.

## 1. Conformidade

O script é `scripts/qualidade/conformidade.ts`. O ramo vem da turma activa do
aluno (`base`, `renovação`, `sem turma`), não da oferta. O veredicto da cadeia
é classificado sem juntar categorias:

- `ok` → conforme;
- `legado` ou `a-menos` → legado;
- `sem-dados` → sem dados;
- qualquer divergência restante → erro.

Resultado observado:

| ramo | conforme | legado | erro | sem dados | total |
|---|---:|---:|---:|---:|---:|
| base | 323 | 0 | 4 | 16 | 343 |
| renovação | 468 | 98 | 0 | 2 | 568 |
| sem turma | 0 | 0 | 0 | 0 | 0 |
| **total** | **791** | **98** | **4** | **18** | **911** |

A referência recebida (337 base, 571 renovação, 14 sem turma, 922 total) é de
uma população diferente do join actual. Os quatro erros são os casos de base
já conhecidos da Turma 19; não foram recategorizados como legado.

## 2. Determinismo

`scripts/qualidade/determinismo.ts` reúne todos os emails presentes nas fontes
do espelho, gera cada timeline duas vezes e compara a forma canónica, ignorando
apenas `geradoEm` e `updatedAt`. Foram comparadas 4.427 timelines: 0 documentos
diferentes e 0 campos diferentes.

## 3. Fidelidade do espelho

`scripts/qualidade/fidelidade.ts` escolhe os 40 primeiros emails em ordem
lexicográfica entre `UserProduct` OGI/Hotmart/ACTIVE com `User` resolvido. Para
cada um consulta Hotmart e ActiveCampaign ao vivo e compara:

| fonte | divergentes |
|---|---:|
| vendas Hotmart | 0/40 |
| campo 332 (expiração) | 0/40 |
| campo 334 (compra) | 0/40 |
| tags de percurso | 0/40 |

As tags são filtradas pela mesma família que `acstudenttags` guarda; comparar
todas as tags AC incluiria tags de estado/marketing que não fazem parte do
espelho. A medição não passa `userId` ao serviço AC, para não preencher cache na
BD: é leitura externa e leitura local, sem escrita.

Idade dos espelhos no momento da leitura:

- vendas: `2026-08-23T20:27:35.219Z`;
- tags: `2026-08-22T00:15:31.097Z`.

A amostra está fiel, mas a diferença de frescura das tags é uma fragilidade
operacional. O caso conhecido do Gabriel continua a justificar um alerta de
frescura: com o pipeline desligado, uma venda nova pode ainda não estar no
espelho.

## 4. Casos-limite

`scripts/qualidade/casos-limite.ts` executa os dez cenários construídos da
especificação: 31 de Janeiro, 29 de Fevereiro, compras no mesmo dia, compra
mais extensão, prestações, coorte do ano 2, turma genérica, oferta sem nome
com turma, sem turma/oferta e reembolso. Resultado: **10/10**, sem falhas.

Isto cobre explicitamente a regra 334 (avulsas = última compra; prestações =
primeira cobrança), a decisão pelo ramo da turma e o arredondamento generoso ao
fim do mês.

## 5. Falhas a meio da escrita

`scripts/qualidade/falhas-meio.ts` verifica os cinco pontos do escritor:

| ponto | comportamento observado |
|---|---|
| rasto antes da AC falha | AC não é chamada; claim é libertado |
| AC devolve `false`/throw | rasto recusado; watermark não avança; retry possível |
| AC aceita e confirmação Mongo falha | `finalizacao-pendente`; corrida seguinte reconcilia pela fotografia |
| claim concorrente | um vencedor escreve; o outro observa conflito/pending |
| fotografia antiga/sem evento | salta sem nova escrita e sem regressão do watermark |

Os cinco pontos deixam `preso: false`. Não há caminho observado que exija
desbloqueio manual; a confirmação pendente é deliberadamente retomável.

## 6. Dias de acesso reais

`scripts/qualidade/dias-acesso.ts` usa apenas o ciclo mais recente de cada
timeline, para não contar os anos/coortes anteriores como acessos actuais. Das
911 timelines, 889 têm ciclo com compra e expiração; 22 não têm compra e, por
isso, não têm intervalo de acesso para calcular.

Distribuição dos 889 intervalos:

- mínimo: **365,0042 dias**;
- mediana: **374,1375 dias**;
- máximo: **760,3314 dias**;
- 0 abaixo de 365 dias;
- 730 entre 365 e 395 dias;
- 159 acima de 395 dias;
- lista abaixo de 350 dias: vazia.

O excesso face a 365 é o fim de mês previsto na regra, não dívida. Recomendo
que `a-menos` só seja emitido para faltas materiais (mais de 15 dias), mantendo
`legado` para o arredondamento histórico. Com a distribuição observada, os 34
casos conhecidos não atravessam esse limiar; assim o painel deixa de transformar
uma diferença de calendário num falso alarme sem esconder uma perda real.

## Defeitos corrigidos antes da medição

Commit `ad953a9`:

1. `ciclos[].compras[]` passa a persistir `paymentMode` e `offerCode`; o
   reconciliador do 334 escolhe a primeira cobrança em prestações e a última
   compra em avulsas.
2. `universalSyncService` garante `combined.status` quando cria/actualiza os
   campos de turma por `$set` directo; o valor existente é preservado e o
   fallback é `ACTIVE`.

Os testes novos reproduzem ambos os defeitos. A suíte aplicável correu com
`npx tsx --test`: **207 testes, 207 passam, 0 falhas**. Dois ficheiros fora
 deste trabalho não são compatíveis com esse runner no checkout actual:
`tests/load/load.test.ts` depende de globals Jest (`describe`) e
`tests/sprint1/architecture.test.ts` depende de `chai`; foram excluídos apenas
da contagem aplicável e não alterados.

## Opinião

O núcleo está determinístico e idempotente, e a amostra externa não encontrou
divergências. As fragilidades que merecem trabalho seguinte são:

1. **Frescura do espelho:** vendas e tags têm watermarks diferentes; o pipeline
   desligado torna possível uma venda válida ausente. Mediria frescura como
   métrica e alertaria antes de qualquer escritor.
2. **Integridade da população:** 22 `UserProduct` activos órfãos fazem qualquer
   total depender do join. Devem ser tratados como uma categoria explícita e
   não desaparecer silenciosamente do denominador.
3. **Calendário versus dívida:** a-menos sem limiar é uma fonte de falsos
   alarmes. O limiar material acima mantém o sinal útil e conserva a explicação
   histórica.
4. **Transições de escrita:** a guarda de evento, o rasto anterior à AC e a
   finalização pendente resistiram aos cinco cenários; devem permanecer
   obrigatórios quando o pipeline for autorizado.
5. **Metadados do ciclo:** `paymentMode` e `offerCode` são parte da decisão, não
   decoração. Uma migração que os descarte reintroduz o erro do Paulo.
6. **Os quatro erros reais da Turma 19:** devem ser tratados como problemas de
   dados/turma, não rebaixados a legado para fazer a tabela bater com uma
   referência antiga.

Nada nesta medição liga jobs ou escreve em ActiveCampaign/Hotmart.
