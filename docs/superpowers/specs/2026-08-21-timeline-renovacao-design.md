# Timeline de renovação por aluno

Reconstruir, na nossa base de dados, o percurso de cada aluno a partir das
vendas da Hotmart, das tags da ActiveCampaign e das turmas — e afirmar, na
ficha do aluno, se a cadeia bate certo.

Data: 2026-08-21

## Problema

Os dados de um aluno vivem em quatro sítios que ninguém cruza:

```
Hotmart           o que ele pagou
ActiveCampaign    as tags e as datas de compra e expiração
Hotmart/BD        a turma onde está
BD                o histórico de movimentações feitas à mão
```

Responder a "este aluno está bem?" obriga hoje a correr varrimentos com
centenas de chamadas à AC. Durante a sessão de 20 e 21 de Agosto de 2026 essa
pergunta foi feita cinco vezes de maneiras diferentes, e de cada vez custou
dez a quinze minutos.

O caso que motivou isto: um aluno com três compras de extensão e **uma só
entrada** no histórico de turmas. Pagou três ciclos, mudou de turma uma vez.
Nada no backoffice mostrava isso.

## Hierarquia das fontes

A ordem de confiança é explícita e não se discute:

```
1º  vendas da Hotmart     a verdade
2º  tags da AC            devem acompanhar as vendas
3º  turmas                devem acompanhar as tags
4º  histórico manual      tolerante — houve mãos humanas
```

Cada elo compara-se com o de cima, nunca com o de baixo. Assim um desvio
aponta sempre para quem se desviou.

## A unidade: o ciclo

A linha do tempo é a das **vendas**. As tags e as turmas penduram-se nela.

```
ciclo = a compra (ou compras do mesmo dia) que dá acesso
        + a tag que o marca na AC
        + a turma em que ficou
```

Três perguntas caem de imediato:

- **compra sem tag** — pagou um ciclo e a AC não o marcou
- **tag sem compra** — a AC marca um ciclo que ninguém pagou
- **ciclo sem mudança de turma** — pagou, foi marcado, ficou onde estava

O `cdate` da tag é guardado mas **não manda na ordem** — é prova. Quando está
a meses da compra que representa, é sinal de escrita em massa. Foi assim que
se apanhou o carimbo de 2026-08-07, presente em 28 contactos.

## Modelo

Colecção nova, **`studentrenewaltimelines`**, um documento por aluno, ligado
por `userId` — o mesmo padrão de `acrenewaldata`, `hotmartsalehistories` e
`acstudenttags`, que já são todos um-por-aluno.

```ts
StudentRenewalTimeline {
  userId: ObjectId        // índice único
  email: string

  ciclos: [{
    periodo: string       // '2511'
    compras: [{ data, valor, moeda, produtoId, transacao, extensao: boolean }]
    anos: 1 | 2           // 2 se houve o produto 3100292 no mesmo dia
    acessoAte: Date       // compra + anos, arredondado ao fim do mês

    tag:   { id, nome, aplicadaEm } | null
    turma: { nome, classId, entrouEm } | null

    alertas: string[]     // 'sem-tag' | 'tag-tardia' | 'sem-mudanca-turma'
  }]

  tagsOrfas:  [{ id, nome, periodo, aplicadaEm }]
  tagsEstado: [{ id, nome, aplicadaEm }]

  geradoEm: Date
  fontes: { vendas: Date, tags: Date, ac: Date }
}
```

`tagsEstado` fica à parte porque a `347` e a `676` não pertencem a ciclo
nenhum — são estado corrente.

As três datas em `fontes` dizem ao painel se o que mostra é fresco. Se a
última venda for posterior à última sincronização de tags, o painel avisa que
precisa de re-sync em vez de afirmar um desvio que pode não existir.

O `studentclasshistories` **não é tocado**. Continua a ser só das mãos
humanas; o painel compara os dois sem os misturar.

## Mapa de turmas

A relação turma → tag deixa de viver num Excel e passa a colecção,
**`turmatagmap`**, semeada uma vez a partir dele, com duas camadas:

```
1  convenção     Turma Renovação | AAMM  →  Aluno OGI AAMM - Renovação
                 Turma N | YYMM          →  Aluno OGI LYYMM - Turma N
                 Turma N [renov] | YYMM  →  Aluno OGI YYMM - Renovação Turma N

2  excepções     Turma 2 [renov] | 2306  →  Aluno OGI 2302 - Renovação Turma 2
                 Turma 1 e Turma 2 mantêm o número na renovação
                 turmas agrupadas: 'Turmas 1, 2 e 3 [3a renov] | 2605'
```

Turmas novas resolvem-se pela convenção. Quando uma turma não é resolvida por
nenhuma das camadas, o gerador **não inventa**: marca o ciclo com
`tag-por-definir` e a turma entra numa lista de pendentes.

## Gerador

Puro e determinístico. Lê os espelhos locais e o mapa, escreve a timeline.
**Zero chamadas à Hotmart ou à AC.**

```
900 alunos com chamadas à AC   →  10 a 15 minutos
900 alunos tudo local          →  segundos
```

Correr duas vezes dá o mesmo resultado; cada corrida substitui a timeline do
aluno. Sem risco de duplicar nem de acumular lixo.

Quando regenera:

```
a pedido       o botão "Sincronizar este aluno" regenera no fim
em lote        depois do sync nocturno, para todos os activos
por mudança    venda nova ou mudança de turma → regenera só esse aluno
```

## Correcção necessária no sync das tags

O `classificar()` em `src/services/renewal/acStudentTagsSync.service.ts` exige
`^aluno ogi\b` e **não apanha** "Alunos OGI Ativos" — o `s` do plural parte o
`\b`. Das 658 tags da AC o espelho guarda 108, todas de turma.

Correcção: `/^alunos?\s+ogi\b/i`, e voltar a correr o sync (85 segundos, só
leitura do lado da AC). Sem isto o painel não consegue afirmar que a cadeia
está completa, porque nunca vê as tags de estado.

## Painel

O separador Renovação ganha sub-separadores, com a cadeia sempre visível por
cima.

### Faixa da cadeia

Quatro elos, quatro veredictos:

```
✓ AC compra = última venda
✓ Expiração = turma
✓ Tag = turma
⚠ N ciclos sem mudança de turma
```

### Ciclos — separador novo e principal

Uma linha por ciclo, ancorada na compra:

```
CICLO   COMPRA                 TAG                        TURMA
2311    06/11/2023 · 389 CHF   L2311 - Turma 7   06/11/23  Turma 7 | 2311
2411    05/11/2024 · 142 CHF   2411 - Renov T7   24/11/24⚠ —  sem mudança
2511    30/11/2025 · 145 CHF   2511 - Renov T7   30/11/25  Turma 7 [2a renov] | 2511
```

### Tags

Três listas separadas: **Estado** (347, 676, …), **Percurso** (as de turma,
com o ciclo a que pertencem) e **Órfãs** (sem compra que as justifique).

### Turmas e Dados AC

Como estão. O histórico manual ganha uma nota a dizer que é o registo humano.

### Fora de âmbito

Sem gráficos e sem agregados por turma. Isto é uma ficha de aluno.

## Testes

O gerador ser puro torna-o testável sem rede. Os casos vêm desta sessão, e
incluem os que enganaram a análise:

```
percurso limpo          3 compras anuais, 3 tags, 3 turmas
extensão de 2 anos      167€ + 97€ no mesmo dia → um ciclo, dois anos
prestações              5 × 99€ → um ciclo, conta da primeira
tag tardia              cdate a 14 meses da compra (carimbo de 2026-08-07)
tag órfã                tag de renovação sem compra
compra sem tag          ciclo pago e não marcado
ciclo sem mudança       o caso que motivou isto
turma sem mapa          resolve por convenção, ou marca tag-por-definir
reembolso               compra REFUNDED não gera ciclo
mês sem coorte          compra em Abril/Agosto/Outubro/Dezembro
```

## Notas de contexto

- Os 97€ do produto `3100292` chamam-se "OGI - Renovação" mas **são a
  extensão**. A assinatura de 2 anos é `167€ + 97€` no mesmo dia. Procurar a
  linha do produto é o único sinal fiável.
- Nunca houve turmas em **Abril, Agosto, Outubro nem Dezembro**. Quem compra
  nesses meses cai na coorte seguinte e a expiração acompanha a turma.
- **Turma base** — a expiração vem do `| YYMM` do nome.
  **Turma de renovação** — a expiração acompanha a turma, confirmado em 576
  de 580 alunos.
- As tags **seguem a linhagem**, as turmas seguem a coorte. Testado em três
  coortes: oito alunos de linhagem diferente, nenhum recebeu a tag da coorte.
