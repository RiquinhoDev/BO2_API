# Handoff — o nocturno de renovações

Data: 2026-08-23. Para o agente seguinte (Codex). O João valida no fim.

## O que este sistema faz

Quatro plataformas guardam pedaços do mesmo aluno e nenhuma sabe da outra:

```
Hotmart        as vendas       <- a verdade. Gerida a mão, NUNCA escrevemos lá.
ActiveCampaign datas e tags    <- escrevemos, com cuidado
CursEduca      as turmas       <- lemos; o sync nocturno substitui o que lá está
Discord        cargos          <- escrevemos, e já está a executar sozinho
BD             onde tudo isto se concentra, actualizado todas as noites
Backoffice     onde um humano vê uma história coerente por aluno
```

Até agora este alinhamento foi feito **à mão**. O objectivo deste trabalho é
que, daqui para a frente, seja o sistema a fazê-lo nas compras novas.

## O modelo, decidido com o João

```
TODAS AS NOITES, para todos
   puxar vendas da Hotmart
   puxar tags da AC
   gerar timelines           <- a fotografia do estado; escreve na BD,
                                não escreve para fora. JÁ EXISTE.

POR EVENTO — venda nova (primeira compra OU renovação)
   escrever a expiração na AC
   aplicar as tags que a chefia definir

QUANDO A CHEFIA DECIDIR — reembolso
   tags na AC + estado na BD
```

A BD é o espelho diário. As escritas para fora acontecem **só por evento**.
Não há varrimento que escreva em toda a gente.

## As duas regras da expiração

```
TURMA BASE        expiração = período do nome da turma + 12 meses, fim do mês
                  "Turma 20 | 2703"  ->  31/03/2028
                  a turma sai do CÓDIGO DE OFERTA da venda (renewaloffers)

TURMA RENOVAÇÃO   expiração = data da compra + 12 meses, fim do mês da compra
                  comprou 06/10/2025  ->  31/10/2026
                  não precisa da turma para nada
```

**`[2 anos]` no nome da turma dobra o prazo** (`Turma 14 + [2 anos] | 2505` →
31/05/2027). Não "simplificar" isto para +1 ano: parte 138 alunos. O ramo pode
ser apagado depois de **Setembro/2027**, quando o último acesso de 2 anos
termina — não antes.

As duas fórmulas já existem e estão correctas:
`parseTurmaName()` faz a primeira, `computeExpirationFromPurchaseDate()` a
segunda. O que falta é **escolher qual usar por aluno**.

## Onde fica cada aluno

```
compra base        a oferta identifica a turma desde o primeiro dia
                   renewaloffers.offerName -> "OGI Turma 18 | L2605 | 397"

compra renovação   entra na turma genérica e no fim do mês é movido para a
                   turma final, que se chama sempre
                       "Turma Renovação | <YYMM do mês da compra>"
                   portanto sabemos o destino desde o primeiro dia
```

## Regras que não se negoceiam

- **Não ligar** `AcExpirationSync` nem `RenewalPipeline`. Ambos ficam com
  `schedule.enabled: false`. Nada vai online sem validação da chefia.
- **Nunca escrever na Hotmart.**
- **Nunca tocar no campo 337** (Data da 1ª Compra) sem autorização explícita.
- **Nunca remover tags** sem autorização explícita.
- **Não tocar em nada do Clareza.**
- **Não mexer nos interruptores do Discord.** Estão os quatro a `true` em
  produção e a funcionar.
- **Trabalhar no `main`**, nos dois repos. Nunca nos branches `remake`.
- **Commit sim, push não.** O push é do João.
- Comentários e nomes em **português**.

## Ambiente

```bash
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

O glob entre aspas é obrigatório — a forma de directório dá
`ERR_UNSUPPORTED_DIR_IMPORT` neste Node/tsx no Windows. **O jest não está
instalado; não instalar nada.**

Base de dados real: `railway run npx tsx <ficheiro>.ts`. Não há `.env` local.

Contexto: `docs/superpowers/specs/2026-08-22-fluxo-nocturno-renovacoes.md` e
`docs/superpowers/plans/2026-08-23-revisao-fugas.md`.

---

## Tarefa 1 — Distinguir turma base de turma de renovação

**Ficheiro:** `src/services/renewal/turmaParser.ts` (ou ao lado)
**Testes:** `src/services/renewal/__tests__/turmaParser.test.ts`

É a tarefa central. Hoje há dois sítios que decidem quando acaba o acesso e
cada um aplica sempre a mesma regra a toda a gente:

```
o gerador (enche o painel)     usa SEMPRE a turma
o escritor (escreve na AC)     usa SEMPRE a compra
```

Cada um acerta em metade dos alunos e nenhum sabe em qual. Exemplo medido:

```
afonsorpereira97   "Turma 15 | 2509"          BASE       comprou Jul/2025
   gerador   compara AC(Set/2026) com turma(Set/2026)  -> ok        CERTO
   escritor  calcularia Jul/2026                       -> encurtava  ERRADO

anacapelaalves     "Turma 11 [renov] | 2509"  RENOVAÇÃO  comprou Ago/2025
   gerador   compara AC(Set/2026) com turma(Set/2026)  -> ok, mas nunca
             olhou para a compra dela. Confirma que uma cópia bate com o
             original, não que algum dos dois esteja certo.
   escritor  calcula Ago/2026                          -> CERTO
```

É por isso que o painel dá 890 ok e esconde 100 divergências.

**O que fazer:**

```ts
export type TipoTurma = 'base' | 'renovacao'

export function tipoDeTurma(nome: string): TipoTurma {
  return /\[\s*\d*\s*a?\s*renov|renova[çc]/i.test(nome) ? 'renovacao' : 'base'
}
```

Testes obrigatórios (nomes reais da produção):

```
"Turma 15 | 2509"                            -> base
"Turma 14 + [2 anos] | 2505"                 -> base
"Turma antigos alunos | 2606"                -> base
"Turma 11 [renov] + REITs | 2509"            -> renovacao
"Turma 9 [2a renov] | 2603"                  -> renovacao
"Turma 3 [3a renov] + REITs | 2511"          -> renovacao
"Turma Renovação | 2610"                     -> renovacao
"Turma Renovação Genérica"                   -> renovacao
```

- [ ] Testes primeiro, ver falhar, implementar, ver passar.
- [ ] Commit.

---

## Tarefa 2 — O gerador escolhe a regra certa

**Ficheiro:** `src/services/renewal/renewalTimeline.generator.ts:461-516`

Hoje:

```ts
expiracaoIgualTurma = mesmoMes(e.acExpiracao, fimDaTurma) ? 'ok' : 'divergente'
// ...
expiracao: { esperado: fimDaTurma, encontrado: e.acExpiracao }
```

Passa a ramificar por `tipoDeTurma`:

```
base       esperado = fim da turma            (como hoje)
renovacao  esperado = âncora do último ciclo + 12m × anos, fim do mês
```

**A âncora é `compras[0]` do último ciclo, não a última cobrança.** Em planos
de prestações o acesso começa na primeira. Esta regra já salvou 47 contactos
de serem corrompidos — não a inverter.

**Antes de commitar, medir em produção.** Números de hoje, para comparar:

```
turma base        337 activos    0 divergências    14 sem valor na AC
turma renovação   571 activos    100 divergências   5 sem venda
```

**Esperado depois:** a base fica igual; a renovação passa a mostrar as 100 que
hoje estão escondidas. **Isso é a correcção, não uma regressão.**

**As 100 são legado e têm de aparecer como tal, não como "divergente".**
Causa medida: renovaram no mês antes de a coorte abrir (54 alunos, −1 mês) ou
no mês a seguir (34, +1 mês). Ninguém lhes vai tocar — o cron só escreve por
evento. Se aparecerem como alarme vermelho, alguém vai tentar "corrigir" e
repete-se a limpeza de 23/08 sobre gente que não tem problema nenhum.

Acrescentar um veredicto `'legado'` ao lado de `ok` / `divergente` /
`sem-dados`, e usá-lo quando a expiração da AC não bate com a regra **mas o
aluno não teve venda nova desde que a expiração foi escrita**.

- [ ] Testes para os dois ramos.
- [ ] Medir antes/depois e colar no relatório.
- [ ] Commit.

---

## Tarefa 3 — O escritor escolhe a regra certa

**Ficheiro:** `src/services/renewal/acExpirationSync.service.ts`

Duas mudanças.

**a) Ramificar por tipo de turma.**

```
base       escreve o fim da turma
renovacao  escreve a âncora + 12m × anos, fim do mês
```

Na base a turma vem do código de oferta da venda
(`renewaloffers.offerName` → `parseOffer`). **Se a oferta não tiver nome nem
período, não escreve** e regista `semTurma` — ver Tarefa 6.

**b) O cálculo passa a receber os anos.**

```ts
// hoje, linha 64 — soma sempre exactamente um ano, ignora ciclo.anos
export function computeExpirationFromPurchaseDate(
  purchaseDate: Date,
  anos = 1
): Date {
  return new Date(Date.UTC(
    purchaseDate.getUTCFullYear() + anos,
    purchaseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999
  ))
}
```

138 alunos activos têm o último ciclo a valer 2 anos. Hoje ninguém é atingido
porque a guarda `encurtaria()` recusa encurtar — mas ela **devolve `false`
quando a AC está vazia**, portanto falha aberta. A guarda fica como rede, não
como o mecanismo que impede o erro.

**A guarda `encurtaria()` mantém-se em ambos os ramos.** O sistema nunca
encurta o acesso de ninguém, por nenhuma via.

- [ ] Testes: base escreve a data da turma; renovação escreve compra+12m;
      ciclo de 2 anos escreve 2 anos; ciclo de 2 anos com a AC vazia escreve
      2 anos e não 1; oferta sem nome não escreve.
- [ ] Dry-run em produção, saída colada no relatório.
- [ ] Commit. **Não ligar.**

---

## Tarefa 4 — Escrever só por evento

**Ficheiro:** `src/services/renewal/acExpirationSync.service.ts`

Hoje `syncAcExpirationDates()` percorre **todos** os alunos, todas as noites.
Não é o que foi decidido. Passa a agir só quando há motivo:

```
age        venda nova desde a última corrida  (primeira compra OU renovação)
age        aluno sem expiração na AC
age        corrida manual sobre um aluno
observa    todo o resto — a timeline regista, o escritor não toca
```

Guardar a marca de água (data da última corrida, ou o conjunto de transacções
já vistas) para saber o que é novo. Uma corrida sem vendas novas escreve zero.

- [ ] Teste: corrida sem vendas novas não chama a AC nenhuma vez.
- [ ] Teste: uma venda nova de um aluno dispara só a escrita desse aluno.
- [ ] Commit.

---

## Tarefa 5 — Reconciliar a data de compra (o mecanismo de compensação)

**Ficheiro novo:** `src/services/renewal/acPurchaseDateReconcile.service.ts`
**Testes:** `src/services/renewal/__tests__/acPurchaseDateReconcile.test.ts`

### O problema

Aplicar uma tag de renovação na AC parece disparar uma automação deles que
escreve a data de compra (campo 334) com **o dia de hoje**. A 20 e 21 de
Agosto, 23 dos 25 contactos carimbados tinham tags aplicadas nesse mesmo dia.

Inofensivo quando o aluno acabou de comprar. Destrutivo quando a tag é
aplicada com atraso.

**A causa não está provada.** A 23/08 apliquei a tag `Aluno OGI 2606 -
Renovação` (id 725) à `eva.lrei`, com o 334 dela em `2025-06-03`, e minutos
depois o campo continuava intacto. Três hipóteses vivas: a automação reage só
a certas tags; tem latência; ou o que houve a 20/21 teve outra causa comum.

**O passo é correcto nas três.** Se o carimbo acontece, desfá-lo; se não
acontece, não escreve nada. Não é preciso saber a causa para ficar protegido.

### A regra

O cron pode escrever o campo 334, **e só para o repor na data da venda da
Hotmart**. Nunca outro valor, nunca outro motivo.

```
data real = ciclos[último].compras[0].data      a âncora, não a última cobrança
```

Escreve apenas se **todas** forem verdade:

- existe `data real`;
- o 334 actual difere dela em mais de 24 horas;
- o aluno está activo.

Sem venda conhecida não escreve e conta `semDados`. Nunca inventa uma data.
Nunca toca no 337. Nunca toca no 332 — esse é do escritor da expiração.

### Corre no fim, não colado à tag

```
1  puxar vendas da Hotmart e tags da AC
2  gerar timelines
3  escrever expiração (332)         por evento
4  aplicar tags obrigatórias        por evento, quando a chefia definir
5  reembolsos                       quando a chefia definir
6  reconciliar a data de compra     <- desfaz o que o 4 provocou
```

Se a automação da AC tiver latência, uma correcção imediata é sobreposta por
ela segundos depois e fica pior do que não ter feito nada. No fim da corrida
apanhamos o que já disparou; o que disparar depois é apanhado na noite
seguinte. É auto-curável.

### Assinatura

```ts
export interface ReconcileReport {
  verificados: number
  escritos: number
  jaCertos: number
  semDados: number
  erros: number
  alteracoes: Array<{ email: string; antes: string | null; depois: string }>
}

export async function reconcilePurchaseDates(
  opcoes: { dryRun?: boolean } = {}
): Promise<ReconcileReport>
```

**`dryRun` por omissão é `true`**, como em `acExpirationSync`:

```ts
const dryRun = opcoes.dryRun !== false
```

Escrever ao contrário (`opcoes.dryRun ?? false`) transforma um esquecimento
numa escrita em produção.

- [ ] Testes: 334 igual à âncora não escreve; 334 com a data de hoje e âncora
      de há 3 meses escreve a âncora; sem venda não escreve; prestações
      escrevem a PRIMEIRA cobrança; aluno inactivo é ignorado; dryRun por
      omissão não chama a AC.
- [ ] Dry-run em produção, saída colada.
- [ ] Commit.

**Esperado no dry-run:** poucas escritas ou nenhuma. Os 144 contactos foram
corrigidos a 23/08 e nenhuma tag foi aplicada desde então. Se aparecerem
centenas, **para e reporta** — a âncora está a ser lida mal.

---

## Tarefa 6 — Ofertas sem turma associada

**Ficheiro novo:** rota + painel, ou um relatório em `scripts/`

A colecção `renewaloffers` é o mapa oferta → turma, sincronizada todas as
noites pelo `RenewalOfferSync` (05:00). Mas os nomes são postos à mão:

```
ofertas no total                         69
   com nome e período                    12   (isManuallyEdited: true)
   em branco                             57
```

Para os alunos que já estão em turmas isto não importa. Importa para uma
**compra base nova através de uma oferta ainda não nomeada** — aí o sistema
não consegue saber a turma e não pode calcular a expiração.

**O que fazer:** listar no backoffice as ofertas que têm vendas mas não têm
nome nem período, com o número de alunos afectados, para alguém as nomear.
E o escritor (Tarefa 3) não escreve nesses casos, em vez de adivinhar.

- [ ] Commit.

---

## Tarefa 7 — Nenhuma escrita sem rasto

**Ficheiro novo:** `src/models/renewal/AcWriteLog.ts`

Hoje o escritor conta (`skippedWouldShorten: 255`) mas não grava **quem** nem
**o valor anterior**. Uma corrida errada não é reversível, e os casos mais
interessantes que encontra são deitados fora.

```ts
{
  quando: Date
  servico: 'expiracao' | 'dataCompra'
  email: string
  campo: number          // 332 ou 334
  antes: string | null
  depois: string | null
  accao: 'escrito' | 'recusado'
  motivo?: string        // 'encurtaria' | 'semVenda' | 'semTurma' | ...
  dryRun: boolean
}
```

Gravar **as escritas e as recusas**. Em dry-run grava na mesma com
`dryRun: true` — assim o dry-run produz a lista revisível que hoje não existe.

- [ ] Modelo + índice por `email` e por `quando`.
- [ ] Ligar nos dois serviços.
- [ ] Commit.

---

## Tarefa 8 — Desarmar o que está armado

**a) `TAG_RULES_SYNC`.** Na colecção `cronconfigs` (o sistema de crons antigo)
está `isActive: true`, agendado para as 02:00, parado desde 2025-12-27. Só está
parado porque o `index.ts` nunca chama `initializeCronJobs()`. Se alguém
acrescentar essa linha, arranca um escritor de tags na AC sem dry-run.

Script em `scripts/` que ponha `isActive: false`, e correr.

**b) Renomear dois jobs de produção** em `cronjobconfigs`:

```
TEST_CURSEDUCA_4MIN   ->   CursEducaSync      (610 registos por noite)
1º                    ->   HotmartSync        (4432 registos, 37 min)
```

Confirmar antes que nada no código os procura pelo `name`.

- [ ] Um commit por alínea.

---

## Tarefa 9 — Corrigir os ciclos partidos

**Ficheiro:** `src/services/renewal/renewalCycles.ts`

O par compra + extensão (397€/167€ seguido de 97€) só é agrupado quando cai no
mesmo dia. Três alunos activos têm o par com dias de intervalo e ficaram com o
ciclo partido em dois:

```
paulo_rodrigues_08   25/11/2024 397€  ->  02/12/2024 97€    7 dias
n510_                07/05/2025 167€  ->  08/05/2025 97€    1 dia
mariasilvestre411    10/07/2023 302€  ->  11/07/2023 85€    1 dia
```

Nos três a AC e a turma estão certas; só a nossa timeline está errada.

**O que fazer:** aceitar alguns dias de intervalo quando a segunda compra é o
produto de extensão (`3100292`). Escolher a janela pelos dados — 7 dias cobre
os três casos conhecidos.

- [ ] Teste para cada um dos três padrões.
- [ ] Medir: confirmar que os três passam a ter um ciclo de 2 anos e que mais
      ninguém muda.
- [ ] Commit.

---

## Tarefa 10 — A tua avaliação do fluxo

Aqui quero a tua opinião, não execução. Lê o spec e a revisão das fugas, e
responde **com dados medidos, não por impressão**:

**1. Onde faltam mecanismos de compensação?** O da Tarefa 5 nasceu de um efeito
lateral descoberto por acaso. Procura os outros: sítios onde uma escrita nossa
provoca uma reacção noutra plataforma, ou onde um sync nocturno desfaz uma
correcção humana. Sabemos de um caso — o sync da CursEduca reescreve 606 de 610
registos por noite e já desfez uma correcção manual (o `marcoelho`). Há mais?

**2. O que corre todas as noites e ninguém revê?** O inventário dos crons
existe, mas não diz o que cada um **escreve**. Para cada job ligado: que
colecções e que campos toca, e quais deles são fonte de verdade de outra coisa.

**3. Onde é que o backoffice mostra "ok" e não devia?** A Tarefa 2 corrige um
caso. Há outros elos a medir a coisa errada?

**4. O que se parte quando houver turmas todos os meses?** A partir de 2027 há
uma turma nova por mês. Muito aqui assume turmas trimestrais e tolerâncias de
meses (`TOLERANCIA_ATRAS = 2`, `TOLERANCIA_FRENTE = 4`). O que deixa de
funcionar?

Entrega como `docs/superpowers/plans/2026-08-23-avaliacao-codex.md`. Se não
mediste, diz que não mediste.

---

## O que NÃO decides sozinho

**O cargo do Discord segue a turma ou o acesso?** Hoje o sync deriva o cargo do
nome da turma (`DISCORD_ROLES_AUTO_EXECUTE=true`, sem aprovação humana). Com a
Tarefa 3 ligada, alguns alunos ficam com acesso na AC até ao fim de Outubro e
perdem o cargo a 30 de Setembro. Reporta, não resolvas.

**A `silviabelbute`.** Renovou em Setembro/2025 — tem a tag, está na turma de
renovação, a AC dá-lhe acesso até Set/2026 — mas não há venda nenhuma na
Hotmart desde os 5 × 99€ de 2024/25. É a única venda em falta que encontrámos.
Não é o cron que resolve isto.

**Os passos 4 (tags obrigatórias) e 5 (reembolsos)** continuam por construir —
dependem de decisões da chefia que ainda não chegaram.

---

## Relatório final

- Números dos dois ramos antes e depois das Tarefas 2 e 3.
- Saída dos dry-runs das Tarefas 3 e 5, colada.
- Confirmação de que `AcExpirationSync` e `RenewalPipeline` continuam
  `enabled: false`, e de que **não houve push**.
- Confirmação de que nenhuma tag foi aplicada ou removida durante o trabalho.
- O documento da Tarefa 10.
