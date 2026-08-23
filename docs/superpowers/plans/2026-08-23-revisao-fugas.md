# Revisão do sistema — fugas encontradas

Data: 2026-08-23. Varrimento dos crons, dos escritores e das fontes de verdade,
com tudo medido na base de dados de produção.

O objectivo do sistema é sincronizar Hotmart, ActiveCampaign, CursEduca e
Discord de forma a que o backoffice mostre uma versão única e limpa de cada
aluno. Uma fuga, aqui, é qualquer sítio onde duas plataformas podem discordar
sem que alguém dê por isso.

---

## Resumo

| # | Fuga | Estado hoje | Se ligarmos o nocturno |
|---|------|-------------|------------------------|
| F1 | Duas definições de "fim de acesso" | 292 em 884 discordam | o painel acusa 292 falsos divergentes |
| F2 | O escritor corta um ano a ciclos de 2 anos | tapado pela guarda | 138 alunos em risco |
| F3 | O Discord executa sozinho pela turma | **a correr agora** | 38 perdem a comunidade cedo |
| F4 | `TAG_RULES_SYNC` armado e adormecido | não agendado | escreve tags sem dry-run |
| F5 | Job de produção chamado `TEST_...` | **a correr agora** | — |
| F6 | Job de produção chamado `1º` | **a correr agora** | — |
| F7 | Escritas sem snapshot nem registo de quem | — | correcções irreversíveis |

---

## F1 — Há duas definições de "fim de acesso" e não concordam

**A mais importante.** O sistema calcula o fim de acesso por dois caminhos:

```
o painel e o Discord   fim = nome da turma       ("... | 2509" -> Setembro/2026)
o escritor da AC       fim = compra + 1 ano      (fim do mês)
```

Medido sobre 884 alunos activos com turma datada e venda conhecida:

```
painel(turma)  !=  escritor(compra)     292      33%
cargo Discord  !=  escritor(compra)     292
cargo Discord  !=  painel(turma)          0      concordam sempre
```

O painel e o Discord concordam a 100% porque bebem da mesma fonte — a turma.
O escritor é o único que segue a regra que o João fixou: **o acesso é anual a
contar da compra, não do nome da turma.**

A consequência é desagradável: o elo "Fim do acesso" do painel dá 890 ok / 0
divergente **porque compara a AC contra a turma**. Se ligarmos o escritor, ele
move 38 alunos para a data da compra e o painel passa a acusá-los como
divergentes — estando eles certos. O painel mede a coisa errada.

**O que falta decidir:** qual das duas é a verdade. Se é a compra (e a regra
do João diz que sim), o painel tem de passar a comparar a expiração contra a
compra, e a turma passa a ser o elo seguinte, não a referência.

---

## F2 — O escritor da expiração continua a cortar um ano a quem comprou dois

Este defeito está descrito no spec desde 22/08 como "defeito 1". O serviço novo
foi construído depois e **não o corrigiu**:

```ts
// acExpirationSync.service.ts:64
export function computeExpirationFromPurchaseDate(purchaseDate: Date): Date {
  return new Date(Date.UTC(purchaseDate.getUTCFullYear() + 1, ...))
}
```

Soma exactamente um ano. Não recebe, nem consulta, o `ciclo.anos`.

```
alunos activos cujo ULTIMO ciclo vale 2 anos    138
alunos activos cujo ultimo ciclo vale 1 ano     747
```

Exemplo real — `albanocosta1984`, ciclo `2409`, 397 EUR + 97 EUR no mesmo dia,
`anos = 2`. O escritor calcula Setembro/2025. O acesso dele vai a Setembro/2026.

**Hoje não há estrago**, porque a guarda `encurtaria()` recusa escrever uma
data mais curta do que a que a AC já tem, e todos os 138 têm a data longa lá.
Mas a guarda **falha aberta**: devolve `false` quando a AC está vazia.

```
activos sem expiração na AC, com ciclo de 2 anos    0    <- hoje
```

Zero hoje. Um só contacto sem o campo 332 preenchido, e leva a data curta sem
nada a travar. A protecção é um acidente feliz, não um desenho.

**Correcção:** o cálculo tem de receber os anos do ciclo. A guarda fica, mas
como rede, não como mecanismo principal.

---

## F3 — O Discord está a executar sozinho, e pela fonte errada

Os quatro interruptores estão ligados em produção:

```
DISCORD_ROLES_SYNC_ENABLED           = true
DISCORD_ROLES_AUTO_EXECUTE           = true      <- sem aprovação humana
DISCORD_MESSAGES_ENABLED             = true
DISCORD_SCHEDULED_MESSAGES_ENABLED   = true      <- publica no servidor
```

`DiscordRolesSync` corre às 05:30, `DiscordScheduledMessages` às 10:00 nos
dias 8 e 15. A regra do sync está escrita no topo do ficheiro:

```
// Regra de ouro (D3): o cargo espelha SEMPRE a turma actual na Hotmart.
```

E remove cargos por iniciativa própria: *"Aluno já não elegível (sem turma
activa/ligação) — remover cargo de renovação (D4)"*.

Cruzado com F1: dos 884, há **38** cuja compra dá acesso até um mês depois do
que a turma diz. Se ligarmos o escritor, esses 38 ficam com acesso na AC até
31/10 e **perdem o cargo do Discord a 30/09**. Pagaram um mês que a comunidade
lhes tira.

Ao lado disto ficam os casos já conhecidos: a conta partilhada `arita_16` serve
dois alunos, e cada aluno traz um parceiro. Um corte automático por `discordId`
apanha gente que não devia apanhar.

**Não proponho desligar** — está a funcionar e a chefia conta com ele. Proponho
que o cargo passe a derivar da mesma data que a AC, e que a remoção continue a
exigir olhos humanos enquanto F1 não fechar.

---

## F4 — `TAG_RULES_SYNC` está armado e adormecido

Na colecção `cronconfigs` (o sistema de crons **antigo**, separado do
`cronjobconfigs`):

```
ON   0 2 * * *   TAG_RULES_SYNC   lastRun = 2025-12-27   nextRun = 2025-12-28
```

`isActive: true`, mas parado há oito meses. Está parado porque o `index.ts`
nunca chama `initializeCronJobs()` — confirmado por grep. Não é uma decisão
escrita em lado nenhum; é uma linha que não existe.

Se alguém a acrescentar, arranca às 02:00 um escritor de tags na AC que não
passa por nenhum dos gates `RENEWAL_AC_*` que criámos, e sem dry-run.

**Correcção:** pôr `isActive: false` no documento. Um interruptor desligado é
uma decisão; uma linha em falta é um acidente à espera.

---

## F5 e F6 — Dois jobs de produção com nomes que ninguém vai auditar

```
ON   10 23 * * *   TEST_CURSEDUCA_4MIN   "TESTE - Sync CursEDuca em 4 minutos"
                   610 registos, 606 actualizados, todas as noites
ON   0 4 * * *     1º                    "Job de Hotmart"
                   4432 registos actualizados, todas as noites
```

O primeiro chama-se TESTE e faz trabalho real. O segundo chama-se `1º`. Ambos
tocam nos dados de que tudo o resto depende — as turmas vêm da CursEduca, as
vendas da Hotmart.

Quando alguém for procurar porque é que uma turma mudou sozinha, vai ler esta
lista e saltar os dois. Renomear é meia hora e evita um dia perdido.

---

## F7 — As escritas não guardam o que substituíram

`acExpirationSync.service.ts` conta o que fez:

```
skippedRefunded, skippedNoContact, skippedNoHotmartData, skippedWouldShorten
```

Mas não grava **quem**, nem **o valor anterior**. Duas consequências:

Os 255 alunos travados por `encurtaria()` são um número e mais nada. Ninguém
os pode rever, e são exactamente os casos onde a compra e a turma discordam —
a informação mais valiosa que a corrida produz, deitada fora.

E uma corrida errada não é reversível. Este processo vai correr todas as
noites sem ninguém a ver.

**Correcção:** gravar cada escrita com email, valor anterior, valor novo e
motivo; e gravar também as recusas.

---

## O que não é fuga

Verifiquei e está bem fechado:

- **As escritas na AC passam todas por um ficheiro** —
  `activeCampaignService.ts`. Um só sítio para auditar.
- **Os gates `RENEWAL_AC_*` não existem no ambiente**, logo estão todos a
  `false`. `AcExpirationSync` e `RenewalPipeline` continuam `enabled: false`.
- **`DailyPipeline` e `EvaluateRules` estão desligados** — são os que aplicam
  tags em massa pelo motor de regras.
- **`GuruTrialCheck` marca `PARA_INATIVAR` e não inactiva.** A inactivação é
  manual, como devia ser.
- **O Clareza não foi tocado**, conforme instrução.
