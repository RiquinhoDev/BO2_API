# Handoff — mecanismos de compensação e fecho das fugas

Data: 2026-08-23. Para o agente seguinte (Codex). O João valida no fim.

## O que este sistema está a tentar fazer

Quatro plataformas guardam pedaços do mesmo aluno e nenhuma sabe da outra:

```
Hotmart        as vendas          <- a verdade. Gerida a mão, nunca escrevemos la.
ActiveCampaign datas e tags       <- escrevemos, com muito cuidado
CursEduca      as turmas          <- lemos; o sync nocturno substitui o que la esta
Discord        cargos e acesso    <- escrevemos, e ja esta a executar sozinho
Backoffice     onde tudo isto tem de aparecer limpo e explicavel
```

O objectivo não é "sincronizar" no sentido de copiar. É que um humano abra a
ficha de um aluno no backoffice e veja **uma** história coerente: comprou nesta
data, o acesso acaba nesta, está nesta turma, tem estas tags — e que cada
divergência esteja identificada com o nome de quem a causou.

## O princípio que orienta tudo o resto

Já apanhámos o sistema a estragar dados sem ninguém dar por isso, mais do que
uma vez. A lição que ficou:

> **Quando uma acção nossa provoca um efeito lateral noutra plataforma, o
> sistema tem de desfazer esse efeito por iniciativa própria — não esperar que
> um humano dê por ele.**

É isso que chamamos mecanismo de compensação. O primeiro está desenhado abaixo.
Uma das tuas tarefas é procurar onde faltam outros.

## Regras que não se negoceiam

- **Não ligar** `AcExpirationSync` nem `RenewalPipeline`. Ambos ficam com
  `schedule.enabled: false`. Nada disto vai online sem validação da chefia.
- **Nunca escrever na Hotmart.** É gerida à mão.
- **Nunca tocar no campo 337** (Data da 1ª Compra) sem autorização explícita.
- **Nunca remover tags** sem autorização explícita.
- **Não tocar em nada do Clareza.**
- **Trabalhar no `main`**, nos dois repos. Nunca nos branches `remake`.
- **Commit sim, push não.** O push é do João.
- Comentários e nomes em **português**, como o resto do repo.

## Ambiente

```bash
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

O glob entre aspas é obrigatório — a forma de directório dá
`ERR_UNSUPPORTED_DIR_IMPORT` neste Node/tsx no Windows. **O jest não está
instalado; não instalar nada.**

Base de dados real: `railway run npx tsx <ficheiro>.ts`. Não há `.env` local.

Contexto completo:

- `docs/superpowers/specs/2026-08-22-fluxo-nocturno-renovacoes.md` — o desenho
- `docs/superpowers/plans/2026-08-23-revisao-fugas.md` — as sete fugas medidas

---

## Tarefa 1 — O passo 6: reconciliar a data de compra

**Ficheiro novo:** `src/services/renewal/acPurchaseDateReconcile.service.ts`
**Testes:** `src/services/renewal/__tests__/acPurchaseDateReconcile.test.ts`

### O problema

Aplicar uma tag de renovação na AC parece disparar uma automação deles que
escreve a data de compra (campo 334) com **o dia de hoje**. A 20 e 21 de
Agosto, 23 dos 25 contactos carimbados tinham tags aplicadas nesse mesmo dia.

Isto é inofensivo quando o aluno acabou de comprar. É destrutivo quando a tag
é aplicada com atraso: o passo 4 do nocturno (garantir tags obrigatórias) é
retroactivo por natureza — procura quem não tem a tag e acrescenta-a. Ao fazê-lo
carimba a data de compra de quem comprou há meses.

### A regra

O cron passa a poder escrever o campo 334, **e só para o repor na data da
venda da Hotmart**. Nunca outro valor, nunca outro motivo.

Para cada aluno **activo** com timeline:

```
data real = ciclos[ultimo].compras[0].data      a ancora do ultimo ciclo
```

Escreve o 334 apenas se **todas** forem verdade:

- existe `data real` (há venda na Hotmart para o último ciclo);
- o 334 actual difere da `data real` em mais de 24 horas;
- o aluno está activo.

Sem venda conhecida, **não escreve** e conta como `semDados`. Nunca inventa
uma data.

A **âncora** e não a última cobrança: em planos de prestações o acesso começa
na primeira. Esta regra já salvou 47 contactos de serem corrompidos — não a
inverter.

### Onde encaixa

Último passo da corrida, não a seguir à tag:

```
1  sincronizar turmas/vendas
2  gerar timelines
3  escrever expiracao (332)
4  aplicar tags obrigatorias           <- pode disparar carimbos
5  reembolsos
6  reconciliar a data de compra (334)  <- desfaz o que o 4 provocou
```

**Não corrigir logo a seguir a aplicar a tag.** Se a automação da AC tiver
latência, a correcção imediata é sobreposta por ela segundos depois e fica pior
do que não ter feito nada — o carimbo passa a existir sem rasto de que
tentámos. No fim da corrida apanhamos o que já disparou; o que disparar depois
é apanhado na noite seguinte. É auto-curável.

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

**`dryRun` por omissão é `true`.** Copiar o padrão de
`acExpirationSync.service.ts`:

```ts
const dryRun = opcoes.dryRun !== false
```

Escrever ao contrário (`opcoes.dryRun ?? false`) transforma um esquecimento
numa escrita em produção.

### Passos

- [ ] Escrever os testes primeiro. Casos mínimos:
      `334 igual a ancora -> nao escreve` ;
      `334 com a data de hoje e ancora ha 3 meses -> escreve a ancora` ;
      `sem venda no ultimo ciclo -> semDados, nao escreve` ;
      `plano de prestacoes -> escreve a PRIMEIRA cobranca, nao a ultima` ;
      `aluno inactivo -> ignorado` ;
      `dryRun por omissao -> nao chama a AC`
- [ ] Correr e ver falhar.
- [ ] Implementar.
- [ ] Correr e ver passar. A suite toda tem de continuar verde.
- [ ] Correr o dry-run contra produção e **colar a saída no relatório**.
- [ ] Commit. Não ligar nada.

**Esperado no dry-run:** poucas escritas ou nenhuma. Os 144 contactos foram
corrigidos a 23/08 e nenhuma tag foi aplicada desde então. Se aparecerem
centenas, **para e reporta** — quer dizer que a âncora está a ser lida mal.

---

## Tarefa 2 — O escritor da expiração corta um ano a quem comprou dois

**Ficheiro:** `src/services/renewal/acExpirationSync.service.ts`

```ts
// linha 64 — soma sempre exactamente um ano
export function computeExpirationFromPurchaseDate(purchaseDate: Date): Date {
  return new Date(Date.UTC(purchaseDate.getUTCFullYear() + 1, ...))
}
```

138 alunos activos têm o último ciclo a valer 2 anos (397 EUR + 97 EUR no mesmo
dia). Para todos eles o cálculo dá um ano a menos.

Hoje ninguém é atingido, porque a guarda `encurtaria()` recusa escrever uma data
mais curta do que a que a AC já tem. Mas **a guarda falha aberta**: devolve
`false` quando a AC está vazia. Um contacto sem o campo 332 e com ciclo de 2
anos leva a data curta sem nada a travar.

**O que fazer:** o cálculo passa a receber os anos do ciclo.

```ts
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

O `anos` vem de `ciclo.anos` do último ciclo — o mesmo que `agruparCiclos` já
calcula. O `dataBaseDoAluno()` devolve só a data; vai ter de devolver também os
anos, ou passa a existir uma função ao lado que devolve o ciclo inteiro.

A guarda `encurtaria()` **fica**, mas como rede de segurança e não como o
mecanismo que impede o erro.

- [ ] Teste: `ciclo de 2 anos -> expiracao a 2 anos da compra`.
- [ ] Teste: `ciclo de 2 anos, AC vazia -> escreve 2 anos, nao 1`.
- [ ] Teste: os existentes de 1 ano continuam a passar.
- [ ] Medir em produção antes/depois: quantos passam a ser escritos e quantos
      deixam de ser travados por `encurtaria()`. Hoje são 38 escritos e 255
      travados.
- [ ] Commit.

**Se os 255 travados não descerem muito**, para e reporta — quer dizer que a
causa deles é outra e vale a pena saber qual antes de continuar.

---

## Tarefa 3 — Nenhuma escrita sem rasto

**Ficheiros:** `acExpirationSync.service.ts`, o serviço novo da Tarefa 1, e um
modelo novo.

Hoje o escritor conta (`skippedWouldShorten: 255`) mas não grava **quem** nem
**o valor anterior**. Duas coisas ruins ao mesmo tempo: uma corrida errada não
é reversível, e os 255 casos mais interessantes que a corrida encontra são
deitados fora.

Criar `src/models/renewal/AcWriteLog.ts`:

```ts
{
  quando: Date
  servico: 'expiracao' | 'dataCompra'
  email: string
  campo: number          // 332 ou 334
  antes: string | null
  depois: string | null
  accao: 'escrito' | 'recusado'
  motivo?: string        // 'encurtaria' | 'semVenda' | 'reembolsado' | ...
  dryRun: boolean
}
```

Gravar **as escritas e as recusas**. Em dry-run grava na mesma, com
`dryRun: true` — assim o dry-run passa a produzir a lista revisível que hoje
não existe.

- [ ] Modelo + índice por `email` e por `quando`.
- [ ] Ligar nos dois serviços.
- [ ] Teste: uma recusa por `encurtaria` deixa registo.
- [ ] Commit.

---

## Tarefa 4 — Desarmar o que está armado

Três coisas pequenas, sem código de negócio.

**a) `TAG_RULES_SYNC`.** Na colecção `cronconfigs` (o sistema de crons antigo)
está `isActive: true`, agendado para as 02:00, parado desde 2025-12-27. Só está
parado porque o `index.ts` nunca chama `initializeCronJobs()`. Se alguém
acrescentar essa linha, arranca um escritor de tags na AC sem dry-run e sem
passar por nenhum dos gates `RENEWAL_AC_*`.

Escrever um script em `scripts/` que ponha `isActive: false` nesse documento, e
correr. Um interruptor desligado é uma decisão; uma linha em falta é um
acidente à espera.

**b) Renomear dois jobs de produção** em `cronjobconfigs`:

```
TEST_CURSEDUCA_4MIN   ->   CursEducaSync      (610 registos por noite)
1º                    ->   HotmartSync        (4432 registos por noite)
```

Actualizar também as descrições. Confirmar antes que nada no código procura
estes jobs pelo `name` — se procurar, muda-se a referência junto.

**c) Não mexer nos interruptores do Discord.** Estão os quatro a `true` em
produção e estão a funcionar. Ficam como estão até a chefia decidir (ver
pergunta 2 abaixo).

- [ ] Cada alínea com o seu commit.

---

## Tarefa 5 — A tua avaliação do fluxo

Esta é a parte em que quero a tua opinião, não execução.

Lê o spec do fluxo nocturno e a revisão das fugas. Depois responde, com dados
medidos e não por impressão:

**1. Onde faltam mecanismos de compensação?** O da Tarefa 1 nasceu de um efeito
lateral que descobrimos por acaso. Procura os outros: sítios onde uma escrita
nossa provoca uma reacção noutra plataforma, ou onde um sync nocturno desfaz
uma correcção humana. Sabemos de um caso — o sync da CursEduca substitui a
turma e já desfez uma correcção manual (o `marcoelho`). Há mais?

**2. O que é que corre todas as noites e ninguém revê?** Fizemos o inventário
dos crons, mas o inventário não diz o que cada um **escreve**. Para cada job
ligado, diz que colecções e que campos toca, e quais deles são a fonte de
verdade de outra coisa.

**3. Onde é que o backoffice mostra "ok" e não devia?** A fuga F1 é exactamente
isto: o painel diz 890 ok / 0 divergente no fim de acesso porque compara a AC
contra a turma, quando a regra do João é que a verdade é a data de compra. Há
outros elos a medir a coisa errada?

**4. O que é que se parte quando houver turmas todos os meses?** A partir de
2027 vai haver uma turma nova por mês. Muita coisa aqui assume turmas
trimestrais e tolerâncias de meses (`TOLERANCIA_ATRAS = 2`,
`TOLERANCIA_FRENTE = 4`). O que é que deixa de funcionar?

Entrega isto como `docs/superpowers/plans/2026-08-23-avaliacao-codex.md`.
**Sem inventar números.** Se não mediste, diz que não mediste.

---

## Duas perguntas que NÃO deves decidir sozinho

São do João e da chefia. Reporta-as, não as resolvas.

**1. Qual é a verdade do fim de acesso — a compra ou a turma?** O painel e o
Discord dizem turma; o escritor diz compra; discordam em 292 de 884 alunos
activos. A regra do João é a compra. Mas mudar o painel para medir contra a
compra faz aparecer 292 divergências onde hoje há zero, e isso tem de ser uma
decisão consciente, não um efeito colateral de uma tarefa técnica.

**2. O cargo do Discord segue a turma ou o acesso?** Se ligarmos o escritor da
expiração, 38 alunos ficam com acesso na AC até ao fim de Outubro e perdem o
cargo do Discord a 30 de Setembro. Pagaram um mês que a comunidade lhes tira.

---

## Relatório final

- Saída do dry-run da Tarefa 1 contra produção, colada.
- Números antes/depois da Tarefa 2 (escritos e travados por `encurtaria`).
- Confirmação de que `AcExpirationSync` e `RenewalPipeline` continuam
  `enabled: false`, e de que **não houve push**.
- Confirmação de que nenhuma tag foi aplicada ou removida durante o trabalho.
- O documento da Tarefa 5.
