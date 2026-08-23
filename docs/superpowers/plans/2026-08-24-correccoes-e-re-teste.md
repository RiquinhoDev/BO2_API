# Três correcções e re-teste obrigatório

Data: 2026-08-24. Para o Codex. Validei o `19de8c6` contra produção.

O trabalho está bom: 207/207 testes confirmados, a timeline já guarda
`offerCode`/`paymentMode`/`extensao`, o `combined.status` está corrigido na
origem e continuam zero contas sem estado, nada foi ligado e nada foi escrito.
O relatório é honesto — recusar absorver a diferença entre 911 e 922 num
arredondamento e explicá-la em vez disso foi a coisa certa a fazer.

Três problemas. Depois de os corrigires, **o re-teste é obrigatório** e tem de
bater com os números do fim deste documento.

---

## C1 — Regressão na regra do 334: `every` devia ser `some`

**Ficheiro:** `src/services/renewal/acPurchaseDateReconcile.service.ts`,
`dataCompraDoCiclo()`.

```ts
const ePrestacao = compras.length > 1 && compras.every(
  (compra) => String(compra.paymentMode ?? '').toUpperCase() === MODO_PRESTACOES
)
```

`every` exige que **todas** as compras do ciclo sejam prestações. Mas a forma
mais comum na realidade é um plano de prestações **com uma extensão de 97€ à
boleia**, que é `PAY_IN_FULL`:

```
zz.carlos   03/12/2024   99€  MULTIPLE_PAYMENTS
            03/12/2024   97€  PAY_IN_FULL        <- faz o every falhar
            03/01/2025   99€  MULTIPLE_PAYMENTS
            03/02/2025   99€  MULTIPLE_PAYMENTS
            03/03/2025   99€  MULTIPLE_PAYMENTS
            03/04/2025   99€  MULTIPLE_PAYMENTS
```

O ciclo é classificado como avulso e o reconciliador quer escrever a **última**
prestação, `2025-04-03`. A AC tem `2024-12-03`, a primeira, e **está certa**.

Medido contra a AC, nos alunos activos:

```
com every (o que está lá)    4 alterações propostas — as quatro erradas
com some  (a correcção)      0 alterações
```

Afectados: `zz.carlos@hotmail.com`, `cm.love.ar@hotmail.com`,
`jbate.desde1992@live.com.pt`, `ruben.mvlm.sequeira@hotmail.com`.

**Porque é que os testes não apanharam:** cobrem prestações sozinhas
(linha 57, linha 278) e compras avulsas sozinhas (linha 46), mas **nunca a
mistura**.

- [ ] Trocar `every` por `some`. Confirmar que o `paulo_rodrigues_08` continua
      a não ser proposto — ele é o caso avulso genuíno (397€ + 97€, ambas
      `PAY_IN_FULL`, ofertas diferentes) e a resposta certa é a última compra.
- [ ] **Teste novo obrigatório:** ciclo com prestações **mais** uma extensão
      `PAY_IN_FULL` → usa a PRIMEIRA cobrança.
- [ ] **Teste novo obrigatório:** ciclo só com duas compras `PAY_IN_FULL` de
      produtos diferentes → usa a ÚLTIMA.
- [ ] Dry-run em produção: tem de dar **0 alterações**.

---

## C2 — A medição dos dias mede a regra contra si própria

**Ficheiro:** `scripts/qualidade/dias-acesso.ts`

```ts
diasEntre(inicio, ciclo.acessoAte)
```

O `ciclo.acessoAte` é a expiração **calculada pela regra**, não o que a AC
guarda. Como a regra arredonda sempre para o fim do mês, tudo dá ≥365 por
construção — daí o "mínimo 365,00; nenhum <350" do relatório.

Isso torna a medição circular: **não consegue detectar um aluno com menos
acesso do que pagou**, que era exactamente o que esta dimensão existia para
apanhar.

Medido contra o campo 332 real da AC, o mínimo é **352 dias**, não 365.

- [ ] Medir `compra → expiração REAL na AC` (o campo 332, via
      `acrenewaldata.expirationDate`).
- [ ] Manter também a medição contra a regra, mas **em coluna separada e
      identificada**. As duas juntas mostram o efeito do arredondamento, que é
      informação útil; confundidas não valem nada.
- [ ] Listar quem tem menos de 350 dias reais.

---

## C3 — Os 4 "erro" na base são 3 desactualizados e 1 real

Corrigi três deles na AC a 23/08 às 21h e confirmei relendo da API:

```
                    AC real (verificada)   espelho acrenewaldata
aurelio.cavaleiro   2027-10-31             2027-08-31
asdrubal.sff        2027-10-31             2027-06-30
cmbcosta            2027-10-31             2027-07-31
gabriel_figueiredo  2027-06-30             2027-06-30   <- este é real
```

O espelho não sabe, porque o sync de leitura da AC não correu desde então. A
medição de conformidade leu o espelho e reportou quatro erros onde só há um.

**E isto matiza a dimensão da fidelidade.** "0 divergências em 40" não é prova
de que o espelho é fiel — aqui estão três registos que sabemos estarem
desactualizados e que a amostra de 40 não apanhou. Com 40 em 911 é normal
falhar; o que não se pode é ler o resultado como garantia.

- [ ] Antes de qualquer medição, **sincronizar o espelho da AC** e dizer no
      relatório a que horas foi.
- [ ] Toda a medição passa a declarar **a idade dos dados que leu** — última
      sincronização de vendas e de tags da AC. Um número sem idade não é
      auditável.
- [ ] Na dimensão da fidelidade, acrescentar ao resultado a margem: com 40 de
      911, que percentagem de divergências passaria despercebida.
- [ ] **Não escrever nada ao `gabriel_figueiredo1999`.** Está identificado e
      espera autorização do João.

---

## Re-teste obrigatório

Depois das três correcções, correr as seis dimensões outra vez, **com o espelho
fresco**, e substituir o `2026-08-24-qualidade.md`.

Números que têm de bater:

```
reconciliador 334        0 alterações propostas
dias de acesso (AC real) mínimo ~352, e a lista de quem está abaixo de 350
conformidade, ramo base  1 erro (o gabriel), não 4
determinismo             0 diferenças
testes                   207 + os 2 novos da C1
```

Se algum não bater, **investiga antes de reportar**. Pode ser o meu número a
estar errado — enganei-me quatro vezes nas últimas 24 horas e duas delas foste
tu que tinhas razão.

## Regras de sempre

- Não ligar `AcExpirationSync` nem `RenewalPipeline`.
- Nada escreve na AC nem na Hotmart, com a excepção já dita: nem ao Gabriel.
- Commit sim, push não. `main`.
- Se discordares de alguma destas três correcções, diz antes de a fazer.
