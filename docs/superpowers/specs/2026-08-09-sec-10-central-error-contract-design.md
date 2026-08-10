# SEC-10 — contrato central de erros Front + Back

**Data:** 2026-08-09  
**Repositórios:** `BO2_API/remake` e `Front/remake`  
**Estado:** desenho aprovado; implementação pendente

## Objetivo

Eliminar respostas HTTP 500 construídas localmente e exposição pública de detalhes internos, sem alterar respostas de sucesso nem interromper consumidores do Front durante a migração.

O estado terminal é:

- `res.status(500)` local no Back: **302 → 0**;
- detalhe interno (`error.message`, stack, tokens ou payloads de terceiros) em respostas: **0**;
- helpers de erro duplicados no Front: **4 → 1**;
- consumidores Front que interpretam diretamente `response.data.error/message/details`: **21 → 0**;
- todas as falhas HTTP usam correlation ID e logging central redigido.

## Decisões

### Envelope canónico

```ts
interface ApiErrorPayload {
  success: false
  code: string
  message: string
  correlationId: string
}
```

`message` é pública, estável e segura. O detalhe técnico nunca integra a resposta.

### Compatibilidade durante a migração

O Front passa primeiro a usar uma única função que compreende o envelope canónico e, temporariamente, os campos legacy `message`, `error` e `details`. Essa compatibilidade existe apenas na fronteira HTTP; componentes e features não interpretam payloads diretamente.

O Back é então migrado por famílias. Respostas de sucesso, status não relacionados e contratos de dados permanecem inalterados. Uma família só fica concluída quando o respetivo Front já usa a fronteira canónica.

### Classificação e logging

- `HttpError` representa erros esperados com `status`, `code` e `publicMessage`.
- `IntegrationUnavailableError` permanece 503 e é convertido pelo handler central.
- Erros desconhecidos tornam-se `500 / INTERNAL_ERROR / Erro interno do servidor`.
- O `cause` completo é enviado apenas ao logger central após `redactSensitiveData`.
- O handler reutiliza um `X-Request-ID` válido ou gera um novo correlation ID.
- Se headers já tiverem sido enviados, o handler delega para o próximo error handler do Express.

## Arquitetura

### Front

1. `src/lib/apiError.ts` torna-se a única fronteira de interpretação.
2. O tipo inclui `code` e `correlationId`, além dos aliases legacy temporários.
3. O helper devolve mensagem segura e permite obter status, code e correlation ID sem casts locais.
4. Os helpers duplicados em renewal offers, Guru trials e lesson links são removidos.
5. Um inventário machine-checked falha perante novos acessos diretos aos campos de erro HTTP fora da fronteira.

### Back

1. `src/security/errorHandling.ts` continua como autoridade do envelope e logging.
2. Um wrapper async partilhado encaminha rejeições para `next(error)` e substitui os wrappers `asyncRoute` duplicados.
3. Uma factory pequena cria `HttpError` com mensagem pública e `cause`, evitando repetição e casts.
4. Controllers deixam de responder no `catch`; encaminham erros esperados tipados ou causas desconhecidas.
5. O inventário existente passa a ratchetar `res.status(500)` e exposição pública de detalhes até zero.

Não será criado middleware que intercepte ou reescreva `res.status(500).json()`. Essa abordagem esconderia dívida e manteria responsabilidades nos controllers.

## Ordem de migração

1. **Fundações Front:** helper único, tipos, compatibilidade e ratchet.
2. **Fundações Back:** wrapper async, factory, contracts do handler e ratchet.
3. **Exposição crítica:** events, course lessons, discovery, business analytics, dashboards e review lists.
4. **Guru:** SSO, analytics, snapshots e inactivation.
5. **ActiveCampaign:** reader, rules, estimates e controller principal.
6. **Cauda:** restantes controllers e middleware até aos inventários zero.
7. **Fecho:** remover aliases legacy do Front apenas quando o inventário e os contract tests provarem ausência de consumidores.

Cada família constitui um assunto e commit próprios. Várias famílias podem ser entregues no mesmo relatório, mas não no mesmo commit.

## Estratégia de testes

Toda alteração de comportamento segue RED → GREEN → refactor.

### Back

- erro desconhecido não expõe a mensagem original;
- `HttpError` preserva status/code/publicMessage;
- correlation ID aparece no header, body e evento de log;
- PII, tokens e paths sensíveis são redigidos no detalhe do logger;
- rejeições async chegam ao handler uma única vez;
- `headersSent` delega sem tentar nova resposta;
- cada família tem characterization tests das respostas de sucesso antes da migração.

### Front

- envelope canónico produz a mensagem esperada;
- payloads legacy continuam legíveis durante a transição;
- code, status e correlation ID são extraídos sem casts locais;
- erros de rede e valores desconhecidos usam fallback;
- o ratchet deteta um consumidor direto artificial e volta a verde após restaurá-lo.

### Gates offline

Por commit, no repositório tocado:

- lint com zero warnings;
- TypeScript estrito;
- testes focados;
- `git diff --check`;
- lockfiles sem alteração não intencional.

Em cada marco grande e no fecho:

- suite unit + integration completa do BO2_API com `MONGOMS_RUNTIME_DOWNLOAD=false`;
- suite Jest completa, ESLint, TypeScript, Prettier dos ficheiros tocados e build Vite no Front;
- zero APIs externas, Mongo/Redis de produção ou browser real.

## Segurança e rollout

- O Back não é publicado antes de o Front compatível estar pronto.
- A compatibilidade é opt-in na fronteira Front, não espalhada por componentes.
- Nenhum detalhe interno é preservado apenas por compatibilidade visual.
- Correlation IDs podem ser registados ou apresentados numa ação de suporte, mas não substituem mensagens humanas.
- Deploy, provisioning e observação real continuam separados do fecho offline.

## Fora de âmbito

- uniformizar respostas de sucesso;
- envelope geral ARCH-03 para endpoints sem erro;
- matriz de papéis e audit log;
- alterar regras de negócio dos controllers;
- corrigir warnings Mongoose não relacionados;
- fazer deploy ou contactar integrações reais.

## Condições de paragem

Parar e pedir decisão se:

- um consumidor depender semanticamente de detalhe técnico hoje exposto;
- um status HTTP atual tiver significado de negócio incompatível com a classificação proposta;
- a migração exigir alterar uma resposta de sucesso;
- um teste revelar que o catch local executa compensação, cleanup ou efeitos além de formatar a resposta;
- um ficheiro estiver morto, duplicado ou shadowed — aplicar regra #9 antes de o migrar.

## Definition of Done

O SEC-10 só fecha quando os quatro inventários chegam a zero, os envelopes canónicos estão cobertos nos dois repositórios, todas as suites offline passam e o workplan distingue claramente fecho de código de validação operacional.
