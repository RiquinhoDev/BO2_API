# Task 1 — Escritor seguro da expiração

## RED

Comando executado:

```text
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

Resultado: 75 passaram, 3 falharam.

- `computeExpirationFromPurchaseDate` devolveu `2027-09-01T00:00:00.000Z` para a compra de 2026-08-11, em vez de `2027-08-31T23:59:59.999Z`.
- `dataBaseDoAluno` não existia.
- `encurtaria` não existia.

As falhas demonstram precisamente o comportamento a substituir/adicionar.

### RED — correção da revisão

Comando executado depois de acrescentar os testes operacionais:

```text
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

Resultado: 80 passaram, 1 falhou. Com `purchaseDate` e `latestApprovedDate` alinhados, `syncAcExpirationDates` devolveu `skippedWouldShorten: 0` em vez de `1`; o `continue` do gatilho antigo era executado antes da guarda de encurtamento.

## Decisões

- A expiração é calculada a partir da compra âncora do último ciclo válido de vendas, não da última cobrança de uma prestação.
- A comparação `purchaseDate` da AC vs. `latestApprovedDate` da Hotmart continua a ser o único gatilho de escrita.
- O modo padrão é dry-run; apenas o passo com gate da BD no pipeline passa `{ dryRun: false }`.
- Uma data mais curta é registada como divergência `encurtaria` e nunca é escrita; essa razão prevalece sobre `diferente`.
- A guarda de encurtamento é avaliada imediatamente depois da divergência, antes de `contactId` e do gatilho de compra, para contabilizar todos os casos.
- O relatório lista divergências calculadas mesmo quando o gatilho de escrita não dispara.

## GREEN

Comando executado após a implementação:

```text
npx tsx --test "src/services/renewal/__tests__/*.test.ts"
```

Resultado: 78 passaram, 0 falharam (duração: 675 ms). O runner emite avisos preexistentes de modelos/índices Mongoose e de configuração AC ausente; não houve chamadas à ActiveCampaign.

### GREEN — correção da revisão

Depois de mover a guarda antes de `contactId` e do gatilho de compra, o mesmo comando terminou com 81 testes passados e 0 falhados (duração: 690 ms). Os três testes operacionais isolam as leituras da BD e a escrita AC: cobrem `encurtaria` com gatilho alinhado, o dry-run por defeito (`wouldWrite` sem chamada externa) e a escrita apenas com `{ dryRun: false }`.

## Ficheiros

- `src/services/renewal/acExpirationSync.service.ts`
- `src/services/renewal/renewalPipeline.service.ts`
- `src/services/renewal/__tests__/acExpirationSync.test.ts`
- `.superpowers/sdd/2026-08-22-handoff-escritor-expiracao/task-1-report.md`
