# Handoff — corrigir o escritor da data de expiração

Para quem vai implementar. O desenho está fechado; falta o código.

Data: 2026-08-22

## ⛔ Isto não vai para produção nesta tarefa

O código é escrito, testado e commitado. **Os interruptores ficam desligados.**
Ligar depende de respostas da chefia que ainda não chegaram.

- **Não** ligar o `AcExpirationSync` no `CronJobConfig`.
- **Não** ligar o `RenewalPipeline`.
- **Não** correr nada que escreva na ActiveCampaign.
- A verificação faz-se em **dry-run**, que não escreve nada.
- **Commit sim, push não.** O trabalho fica commitado no `main` local e **não
  é enviado para o remoto** — um push dispara deploy. Quem faz o push é o
  João, depois de validar a saída do dry-run e de ter a resposta da chefia.

Quem implementa não decide ligar. Isso é do João, depois da chefia responder.

## O que está errado hoje

`src/services/renewal/acExpirationSync.service.ts` escreve o campo 332 da AC
(data de expiração) — o único campo que este sistema escreve lá. Tem três
defeitos:

**1. Arredonda para o lado errado.** `computeExpirationFromPurchaseDate()`
faz `compra + 365 dias` e arredonda ao **1º dia do mês seguinte**. Tem de ser
o **último dia do mês**. Dos 927 contactos com expiração na AC, 926 estão no
último dia do mês. O código está sozinho.

**2. Conta da cobrança errada.** Usa `latestApprovedDate` — a última cobrança.
Num plano de prestações o acesso conta da **primeira**, porque é ela que dá
acesso. São 46 alunos activos em prestações; com a regra actual levavam até
129 dias de acesso a mais.

**3. Pode encurtar acesso já pago.** Há 142 acessos de 2 anos vivos (vendidos
até Setembro de 2025, a acabar até 2027). Estão **correctos na AC**. Se o
escritor recalcular por cima com 12 meses, tira-lhes um ano. Medido: 39 alunos
activos em risco, um deles com a data nova a cair no passado.

## A regra que fica

```
data base    primeira cobrança do ÚLTIMO ciclo
anos         12 meses
arredonda    último dia do mês
guarda       nunca escrever data anterior à que a AC já tem — reporta
```

A guarda substitui a necessidade de perceber extensões: os acessos de 2 anos
já estão certos na AC e a guarda impede que sejam encurtados. Compras de 2
anos deixaram de existir, por isso `12 meses` está sempre certo daqui para a
frente.

## O que mudar

### 1. `computeExpirationFromPurchaseDate` → fim do mês

Ficheiro: `src/services/renewal/acExpirationSync.service.ts`

```ts
/**
 * compra + 12 meses, no último dia desse mês.
 *
 * A AC guarda "válido até ao fim do mês" como o último dia — 926 dos 927
 * contactos estão assim. Arredondar ao dia 1 do mês seguinte diz a mesma
 * coisa mas compara como outro mês, e o painel passava a marcar divergência
 * em cada aluno tocado.
 *
 *   compra 11/08/2026 → expira 31/08/2027
 */
export function computeExpirationFromPurchaseDate(purchaseDate: Date): Date {
  const d = new Date(purchaseDate)
  // Date.UTC(ano+1, mes+1, 0) = último dia do mês `mes`, um ano depois
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}
```

Atenção: o `formatDateYYYYMMDD()` corta pelo `toISOString()`, por isso um
`23:59:59.999Z` sai como o dia certo. Não mudar essa função.

### 2. A data base passa a vir do ciclo

O serviço hoje lê só `latestApprovedDate`. Passa a precisar das vendas todas
para as agrupar em ciclos.

Na consulta ao `HotmartSaleHistory`, trocar o `select`:

```ts
.select('userId sales latestApprovedDate latestTransactionStatus')
```

E acrescentar o import da função pura — a mesma que a timeline usa, para os
dois nunca discordarem:

```ts
import { agruparCiclos } from './renewalCycles'
```

A data base de cada aluno passa a ser:

```ts
// A primeira cobrança do último ciclo. Num plano de prestações é a
// primeira das cobranças; numa compra única é a própria compra. As duas
// regras são a mesma expressão.
const ciclos = agruparCiclos(hm.sales ?? [])
const ultimo = ciclos[ciclos.length - 1]
if (!ultimo) {
  report.skippedNoHotmartData += 1
  continue
}
const dataBase = ultimo.compras[0].data
```

`agruparCiclos` já ignora reembolsos e já junta as compras do mesmo dia, por
isso as verificações de reembolso que existem antes continuam a fazer sentido
mas deixam de ser a única defesa.

### 3. A guarda de não encurtar

Acrescentar `expirationDate` ao `select` do `ACRenewalData`:

```ts
.select('userId email contactId purchaseDate expirationDate refundDate purchaseStatus')
```

E, antes de escrever:

```ts
// Nunca encurtar acesso já concedido. Os 142 acessos de 2 anos vivos estão
// correctos na AC e não podem ser recalculados por baixo. Esticar é seguro;
// encurtar tira algo a um cliente pago e passa a exigir uma pessoa.
if (ac.expirationDate && expiration < ac.expirationDate) {
  report.skippedWouldShorten += 1
  report.divergentes.push({
    email: ac.email,
    acTem: ac.expirationDate,
    calculado: expiration,
    motivo: 'encurtaria'
  })
  continue
}
```

### 4. Dry-run, com o valor seguro por defeito

A assinatura passa a:

```ts
export async function syncAcExpirationDates(
  opcoes: { dryRun?: boolean } = {}
): Promise<AcExpirationSyncReport> {
  // sem dizer explicitamente que quer escrever, NÃO escreve
  const dryRun = opcoes.dryRun !== false
```

E a escrita fica atrás dela:

```ts
if (dryRun) {
  report.wouldWrite += 1
} else {
  // ... o bloco de updateContactField que já existe
}
```

O único sítio que passa `dryRun: false` é o passo do pipeline em
`renewalPipeline.service.ts`:

```ts
const acExpiration = await runGatedStep(
  'AC Expiração (escrita)',
  AC_EXPIRATION_SYNC_JOB_NAME,
  () => syncAcExpirationDates({ dryRun: false })
)
```

Assim qualquer chamada distraída é inofensiva, e escrever exige duas coisas ao
mesmo tempo: o interruptor ligado **e** o `dryRun: false` explícito.

### 5. O relatório

Acrescentar ao `AcExpirationSyncReport`:

```ts
  wouldWrite: number
  skippedWouldShorten: number
  divergentes: Array<{
    email: string
    acTem: Date | null
    calculado: Date
    motivo: 'encurtaria' | 'diferente'
  }>
```

Além do que o gatilho apanha, listar em `divergentes` **todos** os alunos cujo
valor calculado difere do que a AC tem, com motivo `'diferente'` — mesmo os
que o gatilho não acciona. É essa lista que permite validar antes de ligar
seja o que for.

Inicializar os três campos a `0` / `[]` como os outros.

## O que NÃO mudar

- **O gatilho.** Continua a ser `ac.purchaseDate` vs `hm.latestApprovedDate`.
  Sabemos que é imperfeito — dispara pela desactualização do campo 334 para
  reescrever o 332 — mas mudá-lo é outra decisão, ainda por tomar. A guarda de
  não encurtar já cobre o perigo.
- **`formatDateYYYYMMDD`**, as verificações de reembolso, e o
  `AC_EXPIRATION_DATE_FIELD_ID`.
- **Nada fora deste ficheiro**, além da linha do `renewalPipeline.service.ts`.

## Testes

Runner: o jest **não está instalado**. Usa o do Node:

```bash
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

O glob entre aspas é obrigatório — a forma de directório dá
`ERR_UNSUPPORTED_DIR_IMPORT` neste Node/tsx no Windows.

Estado actual: **75 testes, 0 falhas**. Nada disto pode partir.

Criar `src/services/renewal/__tests__/acExpirationSync.test.ts` com estes
casos. `computeExpirationFromPurchaseDate` é pura e testa-se directamente:

```
compra 2026-08-11  →  2027-08-31       fim do mês, não 01/09
compra 2026-01-31  →  2027-01-31       mês de 31 dias
compra 2024-02-29  →  2025-02-28       ano bissexto, mês curto
compra 2026-12-15  →  2027-12-31       viragem de ano
```

A lógica da data base e da guarda vive dentro da função que lê a BD, por isso
não é directamente testável sem base de dados. Extrai as duas decisões para
funções puras e testa essas:

```ts
export function dataBaseDoAluno(sales: VendaEntrada[]): Date | null
export function encurtaria(calculado: Date, acTem: Date | null): boolean
```

Casos a cobrir:

```
prestações      4 cobranças de Março a Agosto  → a data base é a de Março
compra única    uma venda                       → a data base é essa
duas anuais     2025-02 e 2026-02               → a data base é a de 2026
sem vendas      []                              → null
reembolso só    uma venda REFUNDED              → null
encurtaria      calculado 2026-05-31, AC 2027-05-31  → true
estica          calculado 2027-05-31, AC 2026-05-31  → false
AC vazia        calculado qualquer, AC null          → false
```

## Como verificar sem escrever

```bash
railway run npx tsx -e "import('./src/services/renewal/acExpirationSync.service').then(async (m) => { const g = await import('mongoose'); await g.default.connect(process.env.MONGO_URI); const r = await m.syncAcExpirationDates({ dryRun: true }); console.log(JSON.stringify({ candidatos: r.candidatesChecked, jaAlinhados: r.alreadyInSync, escreveria: r.wouldWrite, travadosPorEncurtar: r.skippedWouldShorten, divergentes: r.divergentes.length }, null, 2)); console.log(r.divergentes.slice(0, 20)); await g.default.disconnect() })"
```

O que se espera ver, com base no que foi medido a 22/08:

- `travadosPorEncurtar` **maior que zero** — se for 0, a guarda não está a
  funcionar, porque sabemos que há 39 alunos de 2 anos em risco.
- `escreveria` na ordem das centenas, não dos milhares.
- Nenhuma data em `divergentes` a cair no passado.

Entregar esta saída no relatório. É ela que o João leva à validação.

## Commit (sem push)

No `main` local. **Não criar branches** e **nunca tocar nos branches
`remake`**. Mensagem em português. **Não fazer `git push`** — deixa os commits locais.
Terminar a mensagem com:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## O que fica a aguardar a chefia

Não faz parte desta tarefa, mas explica porque é que ela pára aqui:

1. Quem tira a `Alunos OGI Ativos` e ao fim de quanto tempo — há 30 alunos do
   lote de Julho que ainda a têm.
2. Se o sistema passa a aplicar as tags de turma sozinho.
3. Confirmação de que a AC remove as tags que deixam de ser verdade.

O desenho completo está em
`docs/superpowers/specs/2026-08-22-fluxo-nocturno-renovacoes.md`.
