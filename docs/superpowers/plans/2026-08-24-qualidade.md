# Teste de qualidade do sistema de renovações

Data da execução: 2026-08-23/24. Snapshot Railway e APIs consultados em modo
somente leitura. Os interruptores `AcExpirationSync` e `RenewalPipeline` ficaram
desligados.

## Quadro de decisão

| dimensão | resultado | nota |
|---|---:|---|
| conformidade | 911 timelines | 793 conforme, 98 legado, 2 erros, 18 sem dados; base = 1 erro |
| determinismo | 4.427 timelines | 0 diferenças |
| fidelidade do espelho | 40 amostrados | 0 divergências, 0 falhas de API |
| casos-limite | 10 testes | 10/10 passam |
| falhas a meio | 5 pontos | 0 ficam presos |
| dias de acesso | 889 ciclos de 911 timelines | mínimo 352,31 fora do alerta; 3 abaixo de 350 |

O número de conformidade não é 922 porque essa referência não é reproduzível
no snapshot atual. O filtro fixo encontra 933 `UserProduct` OGI/Hotmart/ACTIVE;
22 apontam para um `userId` sem documento `User`, deixando 911 alunos
resolvíveis e 911 timelines. A diferença foi investigada e fica reportada,
não absorvida num arredondamento.

Antes das medições, o espelho foi sincronizado em `2026-08-23T21:46:42.335Z`
— `22:11:10.886Z` (AC: 911 processados/910 com contacto; tags: 4.453
contactos; vendas: 911 processados). As timelines internas foram regeneradas
às `2026-08-23T22:12:22.976Z`. Estes passos escrevem apenas nos espelhos da
nossa BD; não escrevem na ActiveCampaign, Hotmart, tags ou jobs.

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
| base | 326 | 0 | 1 | 16 | 343 |
| renovação | 467 | 98 | 1 | 2 | 568 |
| sem turma | 0 | 0 | 0 | 0 | 0 |
| **total** | **793** | **98** | **2** | **18** | **911** |

A referência recebida (337 base, 571 renovação, 14 sem turma, 922 total) é de
uma população diferente do join actual. A sincronização AC confirmou que os
três casos antigos (`aurelio.cavaleiro`, `asdrubal.sff`, `cmbcosta`) já estão
correctos na fonte e deixaram de ser erros locais. O único erro de base é
`gabriel_figueiredo1999`, como esperado.

Há ainda uma divergência nova, real e não reclassificada como legado:
`pafpalmeira` comprou em 23/08 (venda e campo 334 presentes), mas o campo 332
continua em 30/09/2026 enquanto a regra do ciclo aponta para 31/08/2027. É a
razão do erro adicional no ramo renovação; não foi escrita nem alterada.

Leitura: `2026-08-23T22:15:10.245Z`.

## 2. Determinismo

`scripts/qualidade/determinismo.ts` reúne todos os emails presentes nas fontes
do espelho, gera cada timeline duas vezes e compara a forma canónica, ignorando
apenas `geradoEm` e `updatedAt`. Foram comparadas 4.427 timelines: 0 documentos
diferentes e 0 campos diferentes.

Leitura: `2026-08-23T22:12:42.454Z`.

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

- vendas: `2026-08-23T22:11:10.830Z`;
- tags: `2026-08-23T21:57:43.785Z`.

A população resolvida é 911 e a amostra fixa é 40: cobertura **4,39%**;
**95,61%** da população fica fora da amostra e uma divergência aí pode passar
despercebida. Portanto, os 0/40 são ausência de divergência observada, não uma
garantia global.

A amostra está fiel, mas a diferença de frescura das tags é uma fragilidade
operacional. O caso conhecido do Gabriel continua a justificar um alerta de
frescura: com o pipeline desligado, uma venda nova pode ainda não estar no
espelho.

Leitura: `2026-08-23T22:15:38.136Z`.

## 4. Casos-limite

`scripts/qualidade/casos-limite.ts` executa os dez cenários construídos da
especificação: 31 de Janeiro, 29 de Fevereiro, compras no mesmo dia, compra
mais extensão, prestações, coorte do ano 2, turma genérica, oferta sem nome
com turma, sem turma/oferta e reembolso. Resultado: **10/10**, sem falhas.

Leitura: `2026-08-23T22:18:01.575Z`.

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

Leitura: `2026-08-23T22:18:02.418Z`.

## 6. Dias de acesso reais

`scripts/qualidade/dias-acesso.ts` usa apenas o ciclo mais recente de cada
timeline, para não contar os anos/coortes anteriores como acessos actuais. Das
911 timelines, 889 têm ciclo com compra e expiração; 22 não têm compra e, por
isso, não têm intervalo de acesso para calcular.

Distribuição dos 889 intervalos:

- campo 332 real — mínimo absoluto: **37,4002 dias**; mediana **374,1437**;
  máximo **1178,2060**;
- campo 332 real — mínimo fora da lista `<350`: **352,3063 dias**;
- campo 332 real — 125 abaixo de 365, 514 entre 365 e 395, 250 acima de 395;
- abaixo de 350: `pafpalmeira` (37,4002), `ajmsantos2022` (304,2021),
  `gabriel_figueiredo1999` (311,7597);
- regra calculada — mínimo **365,0042**, mediana **374,1310**, máximo
  **760,3314**; 0 abaixo de 365, 730 entre 365 e 395, 159 acima de 395.

As duas colunas deixam visível o efeito do fim de mês: a regra dá sempre pelo
menos 365 dias, mas o campo 332 real expõe três casos abaixo de 350. Recomendo
que `a-menos` continue a distinguir faltas materiais (>15 dias) de arredondamento
histórico; os três casos reais devem permanecer alertas. Leitura:
`2026-08-23T22:15:07.854Z`.

## Dry-run do reconciliador 334

Após C1, o dry-run em produção verificou 911 alunos, contou 889 já certos, 22
sem dados, 0 erros e propôs **0 alterações**. O caso `paulo_rodrigues_08`
continua a usar a última compra avulsa; `zz.carlos` e os outros planos mistos
usam a primeira cobrança. Leitura: `2026-08-23T22:11:46.036Z`.

## Defeitos corrigidos antes da medição

Commits `ad953a9` e o commit desta correcção:

1. `ciclos[].compras[]` passa a persistir `paymentMode` e `offerCode`; o
   reconciliador do 334 usa `some` para reconhecer prestações com extensão e
   escolhe a primeira cobrança em prestações e a última compra em avulsas.
2. `universalSyncService` garante `combined.status` quando cria/actualiza os
   campos de turma por `$set` directo; o valor existente é preservado e o
   fallback é `ACTIVE`.

Os testes novos reproduzem ambos os defeitos. A suíte aplicável correu com
`npx tsx --test`: **209 testes, 209 passam, 0 falhas** (207 anteriores + 2
casos C1). Dois ficheiros fora deste trabalho não são compatíveis com esse
runner no checkout actual:
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
6. **Divergências actuais:** Gabriel continua a ser o erro base identificado;
   Paf é uma divergência nova de expiração após uma compra recente. Nenhum
   deve ser rebaixado a legado para fazer a tabela bater com uma referência
   antiga.

Nada nesta medição liga jobs ou escreve em ActiveCampaign/Hotmart.
