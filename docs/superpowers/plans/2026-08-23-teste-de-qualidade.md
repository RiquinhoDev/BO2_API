# Teste de qualidade do sistema de renovações

Data: 2026-08-23, fim do dia. Para o Codex. O João valida.

Não é para construir funcionalidades. É para **medir se o que está construído
está certo**, contra as regras já fechadas, e produzir um número que se possa
repetir amanhã e daqui a três meses.

As perguntas à chefia ficam de fora: tags obrigatórias, reembolsos, a tag dos
Antigos Alunos. Nada aqui depende delas.

---

# Parte A — As regras, como ficaram

Testa contra estas. Se alguma te parecer errada, **diz antes de a implementar**.

## R1 — A data de compra na AC (campo 334) segue a venda da Hotmart

```
ciclo em PRESTAÇÕES          -> a PRIMEIRA cobrança
compras avulsas no ciclo     -> a ÚLTIMA compra
```

O reconciliador usa hoje sempre `compras[0]`. **Está errado para compras
avulsas**, e não consegue distinguir os dois casos porque a timeline não guarda
o `paymentMode`. Ver a Parte B.

Caso real: `paulo_rodrigues_08` comprou 397€ (prod 4346330) a 25/11/2024 e 97€
(prod 3100292) a 02/12/2024, ambas `PAY_IN_FULL`, ofertas diferentes. Não são
prestações. A AC tem 02/12/2024 e **está certa**; o reconciliador quer escrever
25/11/2024 e está errado.

## R2 — A expiração (campo 332)

```
TURMA BASE        período do nome da turma + 12 meses × anos, fim do mês
                  "Turma 20 | 2703"  ->  31/03/2028
                  "[2 anos]" no nome dobra o prazo

TURMA RENOVAÇÃO   data da compra + 12 meses × anos, fim do mês DA COMPRA
                  comprou 01/10/2025  ->  31/10/2026
```

**O ramo decide-se pela TURMA do aluno**, não pela oferta. A oferta só entra
quando o aluno ainda não tem turma — a compra nova antes da colocação.

**Nunca encurtar.** Se o cálculo der menos do que a AC já tem, não escreve.

**Nota importante sobre o arredondamento:** "fim do mês da compra" arredonda
sempre para cima. Quem compra a 1 de Outubro fica com 31/10 do ano seguinte —
395 dias, não 365. É deliberado, mas quer dizer que **uma diferença face a esta
regra não é uma dívida**. Ver a Parte C, medição 6.

## R3 — Onde o aluno fica

```
COMPRA BASE        a oferta identifica a turma desde o primeiro dia
                   renewaloffers.offerName -> "OGI Turma 18 | L2605 | 397"

COMPRA RENOVAÇÃO   entra na "Turma Renovação Genérica" (código 3V4VBR3n42)
                   e no fim do mês é movida para a turma da COORTE dela:
                      ciclo de 1 ano       -> mês da compra
                      ciclo de 2 anos, ano 2 -> mês da compra + 12
                   nome: "Turma Renovação | YYMM"
                   NUNCA a turma que abre a seguir
```

**Três excepções, e só três:**

```
linhagem Turma 1     fica sempre nas turmas da Turma 1   (preço próprio)
linhagem Turma 2     idem                                 (preço próprio)
Turma Antigos Alunos leva uma tag especial antes de ser movida
                     — a tag está por validar com a chefia
```

## R4 — Quando o sistema escreve

```
escreve   venda nova (primeira compra OU renovação), com turma resolvível
escreve   campo em falta na AC
escreve   corrida manual explícita sobre um aluno
observa   todo o resto — a timeline regista, o escritor não toca
```

Nunca um varrimento que escreva em toda a gente.

## R5 — O que nunca se toca

Campo 337. A Hotmart. O Clareza. Tags, sem autorização explícita. Os
interruptores do Discord.

## R6 — Toda a escrita deixa rasto

Email, campo, valor anterior, valor novo, acção, motivo, `dryRun`. Também as
recusas. Sem isto uma corrida errada é irreversível.

---

# Parte B — Dois defeitos conhecidos, para corrigir antes de medir

## B1. A timeline não guarda o `paymentMode`

Por isso o reconciliador do 334 não consegue aplicar a R1 e usa sempre a
primeira compra. **50 alunos activos** têm o último ciclo com mais do que uma
data, e não há como saber quais são prestações.

- [ ] Levar `paymentMode` (e `offerCode`, que também falta) para
      `ciclos[].compras[]` na timeline.
- [ ] Ramificar o reconciliador pela R1.
- [ ] Testes: par compra+extensão em dias diferentes → escreve a ÚLTIMA;
      plano de prestações → escreve a PRIMEIRA.
- [ ] Confirmar que o dry-run deixa de propor a alteração do
      `paulo_rodrigues_08` — hoje propõe, e é a única que propõe.

## B2. `combined.status` nasce vazio

`universalSyncService.ts:1375-1389` escreve `combined.allClasses`,
`combined.primaryClass`, `combined.classId` e `combined.className` por caminho
directo. Isso **cria** o objecto `combined` sem `status`, e o `default: 'ACTIVE'`
do esquema não se aplica a irmãos num `$set` assim.

Seis contas ficaram sem estado. Já as corrigi à mão a 23/08 — o **campo** está
a zero agora — mas a causa continua lá e o próximo aluno repete o problema.

Este ficheiro corre para todos os utilizadores em cada sync. **Não editar sem
teste.**

- [ ] Garantir que o `combined.status` nunca fica por preencher.
- [ ] Teste que reproduz o caso: utilizador sem `combined`, sync das turmas,
      confirmar que sai com estado.

---

# Parte C — A medição

Um script por dimensão, em `scripts/qualidade/`, cada um a imprimir números
reproduzíveis. **Nada escreve.** No fim, um documento com o quadro completo.

## 1. Conformidade, regra a regra

Para cada aluno activo, calcular o que cada regra diz e comparar com a
realidade. Por ramo (base / renovação / sem turma), e separando sempre três
resultados: **conforme**, **legado** (diverge por causa histórica conhecida),
**erro** (diverge sem explicação).

Referência de hoje, para comparares:

```
ramo base        337 alunos    expiração: 323 ok, 14 sem valor na AC, 0 erros
ramo renovação   571 alunos    expiração: 468 ok, 98 legado, 0 erros
sem turma         14 alunos
```

## 2. Determinismo

Gerar as timelines **duas vezes seguidas** e comparar documento a documento,
ignorando `geradoEm` e `updatedAt`. Qualquer diferença é um bug — já tivemos
dois casos de emparelhamento a depender da ordem do array.

- [ ] Reportar: quantos documentos diferem, e em que campos.

## 3. Fidelidade do espelho

A BD é uma cópia. Se a cópia mentir, tudo o resto mente.

Amostra de **40 alunos activos**, escolhidos por um critério fixo e declarado
(para ser repetível). Para cada um, ir **às APIs ao vivo** — Hotmart e AC — e
comparar com o que a nossa BD diz.

Isto apanha coisas que nenhuma medição interna apanha. Exemplo real de hoje: o
`gabriel_figueiredo1999` comprou a 22/08 e a venda dele **não estava no nosso
espelho**, porque o sync de vendas só corre dentro do pipeline, que está
desligado. Ninguém teria dado por isso.

- [ ] Reportar: quantos divergem, em que campo, e há quanto tempo.
- [ ] Dizer explicitamente **quanto tempo tem o espelho** — a data da última
      sincronização de vendas e de tags.

## 4. Casos-limite

Testes, não medições. Cada um com um caso construído:

```
compra a 31 de Janeiro            arredondamento ao fim do mês
compra a 29 de Fevereiro          ano bissexto
duas compras no mesmo dia         ciclo único de 2 anos
compra + extensão a 7 dias        ciclo único, data da AC = a ÚLTIMA
prestações ao longo de 5 meses    ciclo único, data da AC = a PRIMEIRA
ciclo de 2 anos, ano 2            a turma é a do mês da compra + 12
aluno na turma genérica           expiração calcula-se na mesma
oferta sem nome, aluno com turma  a turma decide
oferta sem nome, aluno sem turma  recusa com semTurma
reembolso a meio do ciclo         não escreve nada
```

## 5. O que acontece quando falha a meio

O escritor faz duas coisas: escreve na AC e confirma na nossa BD. Se a primeira
funcionar e a segunda não, o estado fica ambíguo.

- [ ] Descrever o que acontece hoje em cada ponto de falha.
- [ ] Dizer se uma segunda corrida repete a escrita, salta, ou fica presa.
- [ ] Se houver forma de ficar preso para sempre, dizer como se destranca.

## 6. Quanto acesso os alunos têm mesmo

Não em datas — em **dias**. Foi assim que descobrimos hoje que os 34 alunos
marcados como `a-menos` não estavam a perder um mês: perdiam entre 1 e 13 dias,
e a diferença era o arredondamento da regra, não uma dívida.

- [ ] Para todos os activos: dias de acesso reais (compra → expiração), contra
      365 × anos.
- [ ] Distribuição, e a lista de quem está a menos de 350 dias.
- [ ] **Recomendação sobre o veredicto `a-menos`:** com os dados de hoje, mais
      de 15 dias em falta dá zero alunos. Ou se retira o veredicto, ou passa a
      marcar só faltas materiais. Diz qual preferes e porquê.

---

# Parte D — O que entregar

Um documento, `docs/superpowers/plans/2026-08-24-qualidade.md`, com:

**Um quadro no topo**, legível em dez segundos:

```
dimensão              resultado          nota
conformidade          922 alunos         0 erros, 98 legado, 14 sem dados
determinismo          4427 timelines     0 diferenças
fidelidade            40 amostrados      N divergem
casos-limite          10 testes          todos passam
falhas a meio         5 pontos           nenhum fica preso
dias de acesso        922 alunos         mínimo 352, mediana 365
```

**Depois o detalhe de cada uma**, e no fim **a tua opinião**: onde é que este
sistema é frágil, e o que é que farias a seguir se fosse teu.

## Regras de sempre

- Não ligar `AcExpirationSync` nem `RenewalPipeline`.
- Nada escreve na AC nem na Hotmart. As medições são leituras.
- Commit sim, push não. `main`, nos dois repos.
- Se um número não bater com a referência que dei, **investiga antes de
  reportar** — pode ser a referência a estar errada. Aconteceu-me hoje três
  vezes.
