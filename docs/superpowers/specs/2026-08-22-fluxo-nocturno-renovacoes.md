# O fluxo nocturno de renovações — o que corre, o que escreve, e o que está travado

Levantamento feito a 2026-08-22 lendo o código e o estado real da base de
dados de produção. Não é o que o plano diz que devia acontecer: é o que
acontece.

## A cadeia de execução

Só há **um** cron que arranca sozinho e conta para renovações: o `1º`, às
04:00. Tudo o resto pendura-se nele ou tem cron próprio.

```
04:00  1º  (DailyPipeline)                        LIGADO
       ├─ 1  Sync Hotmart          utilizadores, produtos e TURMAS
       ├─ 2  Sync CursEduca        utilizadores Clareza
       ├─ 3  Pré-criar tags BO
       ├─ 4  Recalcular engagement
       ├─ 5  Avaliar regras de tags   escreve tags na AC
       ├─ 6  Sync tags de testemunhos
       └─ ▶ RenewalPipeline            só se o interruptor estiver ligado
              ├─ Sync Hotmart (vendas)     lê Hotmart → hotmartsalehistories
              ├─ Sync AC (leitura)         lê AC      → acrenewaldata
              ├─ Sync AC (tags)            lê AC      → acstudenttags
              ├─ AC Expiração (ESCRITA)    interruptor PRÓPRIO, à parte
              ├─ Timelines                 só BD local
              └─ Discord Roles

05:00  RenewalOfferSync                           LIGADO
05:30  DiscordRolesSync                           LIGADO
07:00  GuruTrialCheck                             LIGADO
07:30  RenewalAcSync                              desligado
08:00  AcExpirationSync                           desligado
10:00  DiscordScheduledMessages                   LIGADO
04:30  AchievementEvaluation                      LIGADO
06/12/18  ClarezaRefresh                          LIGADO
```

O `RenewalPipeline` **está desligado**. Corre depois do `1º` terminar de
facto — dependência real, não uma hora fixa que assuma quanto tempo o `1º`
demora. Uma falha dele nunca marca o `1º` como falhado.

O `AcExpirationSync` tem um **segundo interruptor**, independente. Ligar o
`RenewalPipeline` corre só as partes de leitura; a escrita na AC exige o
segundo sim. Está desligado também.

## Quem escreve o quê

```
Hotmart          nunca escrito. Só leitura.
ActiveCampaign   duas coisas, e só duas:
                   · tags, pelo passo 5 do 1º (regras de tags) — LIGADO
                   · campo 332, data de expiração, pelo AcExpirationSync — desligado
Discord          cargos R.{Mês} e mensagens do bot — LIGADO
Nossa BD         tudo o resto
```

O `acExpirationSync` é explícito: 332 é o **único** campo que este sistema
escreve na AC, e nunca escreve para quem está reembolsado.

## As turmas: ninguém as "ajeita"

Não há passo nenhum de renovações que corrija turmas. A turma vem do **passo
1 do `1º`** — o sync da Hotmart —, que escreve `hotmart.enrolledClasses` com
o que a Hotmart diz. Substitui.

É daqui que vem a lacuna do histórico: o `studentclasshistories` só recebe
registo em quatro sítios do `classes.controller.ts`, e todos dentro de syncs
ou de desactivação/reactivação de turmas em bloco. Quando a turma muda pelo
caminho normal, o valor antigo desaparece sem deixar rasto.

Medido a 22/08/2026: dos 696 ciclos sem turma associada, **684 são falta de
registo** e só 12 são mudança realmente em falta.

## Dois defeitos que travam o ligar

### 1. O escritor da expiração corta um ano a quem comprou dois

`computeExpirationFromPurchaseDate()` é sempre **compra + 365 dias**. Não
olha para o produto `3100292`, não olha para `[2 anos]` no nome da turma,
não tem excepção nenhuma.

Se o `AcExpirationSync` fosse ligado hoje, **165 alunos activos** receberiam
escrita. Desses, **39 têm acesso de 2 anos** e ficariam com a expiração
recuada um ano:

```
simaopedroliveira@gmail.com      AC tem 2027-05-31   escreveria 2026-06-01
margarida1@windowslive.com       AC tem 2027-05-31   escreveria 2026-06-01
rtrovisco@gmail.com              AC tem 2027-05-31   escreveria 2026-05-01
ruben.mvlm.sequeira@hotmail.com  AC tem 2026-11-30   escreveria 2026-04-01
```

O último é o pior: `2026-04-01` já passou. Escrever isso põe um aluno activo
com a expiração no passado, e a automação da AC corta-lhe o acesso na
primeira corrida.

### 2. A convenção da data está invertida

O escritor arredonda ao **1º dia do mês seguinte** — o comentário dele
di-lo: `compra 11/08/2026 → expira 01/09/2027`.

A AC hoje não tem um único registo assim:

```
campo 332, 927 contactos com expiração
   último dia do mês   926   (99,9%)
   dia 1 do mês          0   (0%)
   outro dia             1
```

E o painel compara a expiração com o fim do acesso pelo nome da turma, que
também é o último dia do mês. Ligar o escritor punha `01/09` onde tudo o
resto tem `31/08` — mesma intenção, meses diferentes — e o painel passava a
marcar divergência em cada aluno que ele tocasse.

### Um terceiro, menor

O gatilho do escritor é `HotmartSaleHistory.latestApprovedDate ≠
ACRenewalData.purchaseDate` — ou seja, usa a desactualização do campo **334**
para justificar reescrever o campo **332**. São campos diferentes e o 334
está errado em 169 dos alunos activos, por medição independente. O gatilho
dispara por um motivo que não é o que o escritor corrige.

## O Discord está ligado e a executar sozinho

```
DISCORD_ROLES_SYNC_ENABLED   true
DISCORD_ROLES_AUTO_EXECUTE   true      executa sem aprovação manual
DISCORD_MESSAGES_ENABLED     true
DISCORD_ROLES_MAX_OPS_PER_RUN 150
```

A regra é: o cargo espelha sempre a turma actual na Hotmart, e o mês do
cargo vem do fim de acesso calculado por `parseTurmaName`. Corre às 05:30 por
cron próprio, independente do `RenewalPipeline`.

As mensagens seguem a janela de renovação: a turma cujo acesso acabou no fim
do mês M tem o cargo `R.{M}`, e nos 15 dias de M+1 recebe lembrete ao dia 8 e
último aviso ao dia 15.

Nota: o Discord usa `parseTurmaName().accessEndOgi`, que **respeita** o
`[2 anos]`. Ou seja, o Discord já trata os 2 anos correctamente — só o
escritor da expiração é que não.

## O que fazer antes de ligar

1. **Corrigir `computeExpirationFromPurchaseDate`** para respeitar os 2 anos.
   A informação existe em três sítios: o produto `3100292` na compra, o
   `[2 anos]` no nome da turma, e o campo `anos` do ciclo na timeline. A
   timeline é a fonte mais fiável, porque já resolve o caso das prestações e
   das compras no mesmo dia.
2. **Alinhar a convenção** no último dia do mês, que é o que a AC tem em
   99,9% dos casos e o que o painel espera.
3. **Rever o gatilho** para disparar por mudança de acesso, não por
   desactualização de outro campo.
4. Só depois ligar o `RenewalPipeline`, e ainda assim deixar o
   `AcExpirationSync` desligado uma corrida, para ver o relatório do que ele
   *teria* escrito antes de o deixar escrever.

O passo 4 é fácil de fazer: o serviço já devolve `needsWrite` separado de
`written`. Basta uma corrida com o interruptor de escrita fechado para ter a
lista completa sem tocar em nada.

---

## Decisões fechadas com o João — 2026-08-22

### O que o nocturno tem de fazer, pela ordem dele

```
Hotmart: dados dos alunos
Hotmart: vendas — detectar compras novas
   se há compra nova → escrever a expiração: +12 meses, FIM DO MÊS
                       (é a expiração que alinha a turma, não o contrário)
AC: garantir as tags obrigatórias que faltem, na versão actual
BD: actualizar tudo
Discord: por último
```

### Regras confirmadas

- **A expiração é sempre até ao FIM do mês.** Nunca o dia 1 do mês seguinte.
  Foi assim que se corrigiu a AC à mão e é assim que continua. O
  `computeExpirationFromPurchaseDate()` está sozinho e tem de mudar.
- **As tags obrigatórias são três** — `Alunos OGI`, `Alunos OGI Ativos`,
  `OGI - Aluno ou Ex-Aluno` — e o contacto tem de estar na lista
  `Alunos OGI`. Nenhum código faz isto hoje.
- **Sem coortes em Abril/Agosto/Outubro/Dezembro é história.** A partir de
  2027 há turmas todos os meses, porque passaram a vender todos os dias em
  vez de quatro lançamentos por ano.
- **Compras de 2 anos acabaram** (última extensão a 30/09/2025). Restam 142
  vivas, todas a terminar até 2027. Conservar, não recalcular.
- **A Hotmart é sempre gerida à mão.** O sistema nunca lá escreve.

### A janela do fim do mês

Quem renova hoje entra numa turma de renovação genérica e só no fim do mês é
movido para a turma definitiva. Nessa janela a turma é provisória.

Decisão: **o painel deve acusar na mesma**, e além de acusar deve dizer o que
falta fazer — "mover no fim do mês para a turma X". O aviso fica no BO; não é
para silenciar.

Nota: a janela não afecta o que o escritor da expiração escreve — ele calcula
da data da compra, não da turma. Afecta só a comparação do painel.

### Adiado por decisão

- **O sync desfazer correcções humanas** fica para o fim: hoje só se reflecte
  no ACTIVO/INACTIVO dentro do BO, não toca na Hotmart nem na AC.
- **Cargo do Discord provisório** durante a janela: não é grave, corre todas
  as noites e ajusta-se sozinho à medida que as turmas se corrigem.

### Para rever quando o desenho da automação fechar

- `simaoleal94@gmail.com` (396,98€, 06/08) e `beatriz.sadrudin@outlook.com`
  (447€, 02/08) compraram a preço cheio — clientes novos — e estão na
  `Turma Renovação | 2608`. A tag deles já diz `Aluno OGI 2610 - Turma 19`.
  Falta decidir onde é que um aluno novo espera até a turma base abrir.
- A **tolerância de ±2 meses** no emparelhamento tag↔ciclo foi justificada
  com os meses sem coorte. Com coortes mensais a partir de 2027 essa folga
  deixa de ser necessária e passa a poder roubar uma tag à coorte vizinha.
  Deveria depender de existir coorte no mês da compra, em vez de ser fixa.
