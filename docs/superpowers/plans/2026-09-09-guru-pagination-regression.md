# Guru churn live — 2026-09-09

Estado: EM CURSO. Correção e validação local completas em `remake`; publicação bloqueada pelo isolamento do ambiente.

## Correção BE

O paginador partilhado exigia `total_rows` em todas as páginas e rejeitava `next_cursor: null`. Leitura limitada do fornecedor confirmou que o total aparece apenas na primeira página e que o cursor terminal é null. Estas respostas válidas originavam `GURU_PAGINATION_ENVELOPE_INVALID` e erro 500 em churn live.

`src/services/guru/sync/client.ts` mantém o total inicial quando páginas seguintes o omitem e aceita cursor null na última página. Continua a rejeitar total inicial ausente, totais posteriores inválidos ou alterados, cursores sem progresso, flags contraditórias, limites excedidos e contagem final divergente. A alteração também beneficia os restantes consumidores do mesmo paginador.

## Evidência

- RED/GREEN para total posterior ausente e cursor terminal null.
- 16 testes específicos de paginação, incluindo casos negativos de total posterior e cursor null não terminal.
- Verificação independente relacionada: 15 suites / 106 testes passaram, com transporte simulado e sem chamadas a fornecedores ou BD real.
- Build e lint passaram. Catálogos de contratos e leituras passaram sem alterações geradas.
- A consulta live recolheu apenas metadados de paginação; nenhum conteúdo pessoal foi persistido. O endpoint publicado não foi novamente validado com a correção.

## Condição de publicação

A BD é partilhada com produção e o utilizador autoriza apenas leitura. Mesmo com `SCHEDULER_ENABLED=false`, o arranque chama `ensureCronSeeds` e warmups; estes podem alterar configurações e gravar estatísticas. Não foi efetuado push nem reinício da API. Ownership BE/ambiente: estabelecer isolamento ou proteção efetiva de leitura antes do deploy, incluindo efeitos laterais de arranque e endpoints.

Os branches `main` não foram alterados. As seis correções Front e a validação conjunta estão documentadas no repositório Front, em `docs/superpowers/plans/2026-09-09-test-environment-regressions.md`.
