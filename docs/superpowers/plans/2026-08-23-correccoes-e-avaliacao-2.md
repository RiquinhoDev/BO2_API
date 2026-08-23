# Correcções e segunda avaliação

Data: 2026-08-23, à noite. Para o Codex. O João valida no fim.

Validei o teu trabalho contra a base de dados de produção. Está bom: os
interruptores estão todos desligados, o `acwritelogs` tem 380 registos e
**todos** com `dryRun: true`, nenhum ficheiro de Discord ou Hotmart foi tocado,
os três ciclos partidos ficaram corrigidos e a ramificação base/renovação
funciona — o ramo de renovação dá `ok=468, legado=98`, que reproduzo ao número.

O que segue são quatro correcções pequenas e três medições. Nenhuma depende da
chefia, que só responde amanhã.

## As mesmas regras de sempre

- **Não ligar** `AcExpirationSync` nem `RenewalPipeline`.
- **Nada de escritas reais** na AC. Tudo em dry-run.
- **Não tocar** no Discord, na Hotmart, no Clareza, nem no campo 337.
- **Commit sim, push não.** Trabalhar no `main`.
- Português nos comentários e nomes.

---

# Parte A — Quatro correcções

## A1. A turma decide o ramo; a oferta é o recurso, não a fonte

**Ficheiro:** `src/services/renewal/acExpirationSync.service.ts`,
função `calcularExpiracao` (linha ~106).

Hoje a função pergunta à **oferta** se o aluno é base ou renovação. Quando a
oferta não tem nome, não sabe, assume base, precisa do nome da turma que a
oferta não lhe dá, e devolve `null` → `semTurma`.

Resultado medido: **268 recusas**, das quais **93 são alunos que estão em
turmas de renovação** — e numa renovação a expiração sai da compra e não
precisa de turma nenhuma. Estão presos por uma pergunta que não se lhes aplica.

**A regra do João:** *"[a oferta] é útil para as turmas base, para o resto não
serve de nada."* A oferta é insubstituível num só sítio — a compra nova, antes
de o aluno ser colocado em turma. Aí é a única pista que existe. Em todos os
outros casos o aluno **já está numa turma**, e a turma é a resposta exacta.

**O que fazer — trocar a ordem de precedência:**

```
1. o aluno tem turma actual com período datável?
      -> tipoDeTurma(nome da turma) decide o ramo
      -> base:      expiração = parseTurmaName(turma).accessEndOgi
      -> renovação: expiração = compra + 12m × anos
2. não tem turma (compra nova ainda por colocar)?
      -> usa a oferta, como hoje
3. nem turma nem oferta utilizável?
      -> recusa com semTurma, como hoje
```

Os códigos de `CODIGOS_RENOVACAO_ESPECIAIS` (linhagens da Turma 1 e da Turma 2)
continuam a ter precedência — são a excepção que o nome da turma não distingue.

**Medido: isto resolve 267 dos 268.** O que sobra é o
`santosnascimentogca@gmail.com`, que está na turma "Equipa" e não é aluno.

**Atenção ao que isto NÃO muda:** dos 267, **251 já têm a data certa na AC**.
Passam de `semTurma` a `alreadyInSync`. Só **3** passam a escritas propostas e
**13** ficam travados por não encurtar. Se o teu dry-run der números muito
diferentes destes, para e reporta.

- [ ] Testes: aluno em turma base com oferta sem nome → usa a turma;
      aluno em turma de renovação com oferta sem nome → usa a compra;
      aluno sem turma com oferta nomeada → usa a oferta;
      código da linhagem Turma 1 → renovação, mesmo em turma base.
- [ ] Dry-run antes e depois, com os cinco contadores colados no relatório.
- [ ] Commit.

## A2. O `legado` está a esconder 34 alunos a quem devemos um mês

**Ficheiros:** o gerador e o Front.

Os 98 `legado` são duas coisas opostas:

```
a regra dá MENOS do que a AC   64   o aluno está a mais — certo, não se tira
a regra dá MAIS  do que a AC   34   o aluno está a MENOS — pagou e não tem
```

Exemplos dos 34:

```
queridoalexandre8    devia ter até 31/10/2026    a AC dá 30/09/2026
silvanunes.andreia   devia ter até 31/10/2026    a AC dá 30/09/2026
adrianojmartins      devia ter até 31/12/2026    a AC dá 30/11/2026
```

`legado` lê-se como "desvio histórico aceite, nada a fazer". Nos 64 está certo.
Nos 34 está errado: são pessoas que pagaram um mês que não têm, e como o
sistema só escreve por evento, **nunca lho vai dar**.

A culpa é da minha instrução no handoff anterior — escrevi "legado" para os 100
sem distinguir a direcção. Seguiste-a bem.

**O que fazer:** separar em dois veredictos. `legado` fica para os 64 (a AC dá
mais). Um veredicto novo — sugiro `a-menos` — para os 34. No Front aparecem
distintos: o primeiro é informação, o segundo é uma lista de trabalho.

- [ ] Teste para cada direcção.
- [ ] Medir e confirmar a divisão 64 / 34.
- [ ] Commit.

## A3. O relatório de avaliação é de quatro commits atrás

```
23/08 18:07   cb1a56e   docs(renewal): avaliar fluxo nocturno
23/08 18:09   f319368   fix: bind legacy verdict to sale event
23/08 18:11   1115b34   fix: fixar reconciliação no campo 334
23/08 18:14   fa5dc45   fix: registar recusas de reembolso
23/08 18:16   3e22eda   fix: estabilizar recusa por estado
```

Escreveste o relatório e depois fizeste mais quatro commits, dois deles a mexer
no que o relatório mede. Os números não se reproduzem no código final:

```
                         relatório    medido agora
alterações no 334             0            1     paulo_rodrigues_08: 02/12 → 25/11
escritas 332 propostas       37            0
testes                      197          193     corri os 15 ficheiros
```

Não é trabalho a refazer — é o relatório a actualizar.

- [ ] Correr os dois dry-runs no commit final e substituir os números no
      `2026-08-23-avaliacao-codex.md`.
- [ ] Dizer que comando dá 197 testes, ou corrigir para o número certo.
- [ ] Na tabela dos quatro elos, **dizer explicitamente que filtro de aluno
      usaste**. A tua tabela soma 911 e a minha 922 porque eu filtrei por
      `combined.status: ACTIVE` e tu não. **Tu estavas certo** — ver A4.
- [ ] Commit.

## A4. Seis contas sem `combined.status`

```
INACTIVE  3514
ACTIVE    1415
null         6     <- nem uma coisa nem outra
```

As **únicas 4 timelines com a expiração divergente** pertencem a estas contas.
Eu escondi-as ao filtrar por `ACTIVE`; tu não, e por isso a tua tabela mostrava
3 divergentes na base e a minha zero.

```
aurelio.cavaleiro@gmail.com   Turma 19 | 2610   AC=2027-08-31   turma dá 2027-10-31
asdrubal.sff@gmail.com        Turma 19 | 2610   AC=2027-06-30   turma dá 2027-10-31
```

Compraram em **Agosto de 2026** — são compras recentes — e o sistema nunca os
classificou.

**Esta tarefa é medição, não correcção.** Não mexer no `combined.status` de
ninguém.

- [ ] Listar as 6 com email, turma, vendas, expiração na AC e data de criação.
- [ ] Dizer **porque** é que ficaram sem estado: que processo escreve o
      `combined.status` e em que condição é que não escreve nada.
- [ ] Confirmar se o passo da expiração as apanha ou as ignora — se o filtro
      dele for `ACTIVE`, ficam de fora para sempre e ninguém dá por isso.

---

# Parte B — Três medições para termos amanhã

Nenhuma escreve nada. São para a conversa com a chefia.

## B1. Quantos "renovaram sem comprar"?

Encontrámos a `silviabelbute@gmail.com`: tem a tag
`Aluno OGI 2509 - Renovação Turma 11` aplicada a 26/09/2025, está numa turma de
renovação, a AC dá-lhe acesso até 30/09/2026 — e a Hotmart **não tem venda
nenhuma** desde as 5 prestações de 99€ de 2024/25. Verifiquei sem filtro de
produto e nos quatro estados válidos.

A renovação dela existe como **decisão**, não como transacção.

**A pergunta que interessa: quantos mais há?** Se for uma, é um caso. Se forem
vinte, muda a conversa toda com a chefia.

Critério: aluno cuja turma actual é de renovação, ou que tem tag de coorte de
renovação, e **não tem venda na Hotmart** que sustente esse ciclo.

- [ ] Listar: email, turma, tag de renovação e quando foi aplicada, última
      venda conhecida, expiração na AC.
- [ ] Separar os que podem ter comprado noutro email — procura por nome nas
      vendas — dos que não têm mesmo nada.

## B2. Os reembolsos estão nos dados mas não chegam ao painel

Medido: `hotmartsalehistories` tem **21 REFUNDED e 1 CHARGEBACK**. Mas a
timeline filtra-os e o painel nunca os mostra. Eu tinha dito ao João que talvez
não os ingeríssemos — estava errado, ingerimos.

**11 alunos activos têm o total pago a zero** — cada venda que têm está
reembolsada. Outros 8 têm reembolso mas compraram outra vez depois, e esses têm
acesso legítimo.

O passo dos reembolsos depende da chefia, mas o **caminho dos dados** não.

- [ ] Descrever o que falta para o painel mostrar um reembolso na ficha do
      aluno: onde é que a timeline os descarta e o que custa deixar de o fazer.
- [ ] Listar os 11, com total pago, total devolvido e turma actual.
- [ ] **Não propor inactivações.** É decisão da chefia.

## B3. O que se parte com turmas todos os meses

A partir de 2027 há uma turma nova por mês. Muito do código assume turmas
trimestrais:

```
TOLERANCIA_ATRAS = 2      TOLERANCIA_FRENTE = 4      (generator)
DIAS_MAX_ENTRE_PRESTACOES = 90                        (renewalCycles)
```

Com turmas mensais, uma tolerância de ±2 a 4 meses deixa de separar coortes
vizinhas — passa a emparelhar com a errada.

Se já cobriste isto na primeira avaliação, aponta a secção e não repitas.

- [ ] Simular: com turmas mensais, quantos emparelhamentos de tag ficam
      ambíguos com as tolerâncias actuais?
- [ ] Propor os valores novos, com o raciocínio.

---

## O que NÃO fazer

- Não executar as 3 escritas de expiração nem a do 334 do
  `paulo_rodrigues_08`. Estão identificadas e ficam à espera de autorização.
- Não implementar os passos das tags obrigatórias nem dos reembolsos.
- Não mexer no `combined.status` de ninguém.
- Não tocar nos interruptores do Discord.

## Relatório

- Dry-runs antes e depois da A1, com os contadores todos.
- A divisão 64 / 34 da A2 confirmada.
- Os números actualizados no `2026-08-23-avaliacao-codex.md`.
- As três medições da Parte B.
- Confirmação de que os interruptores continuam desligados, de que não houve
  push, e de que o `acwritelogs` continua sem nenhum registo com
  `dryRun: false`.
