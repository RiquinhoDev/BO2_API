# Auditoria do BO2_API — Fase 0

Data: 2026-07-15
Branch auditada: `remake` (`bfe1c44`)
Âmbito: análise estática/offline de build, arquitetura, segurança, robustez e testes.

## Resumo executivo

O BO2_API não deve ser reescrito num big-bang. A recomendação é **refactor incremental por estrangulamento**, começando por conter o perímetro de segurança e construir um gate confiável. A API expõe 456 pares método/path, o Front tem 188 chamadas principais vivas, e existem consumidores externos, webhooks, CRON jobs e regras de domínio que um rewrite teria dificuldade em reproduzir com segurança.

O risco atual é, porém, alto. O achado mais grave não é apenas “falta de autorização por papel”: quase toda a API está montada sem autenticação. Rotas que inativam alunos, executam sincronizações, escrevem/removem tags, executam CRONs e apagam snapshots estão acessíveis sem o middleware existente. O build também produz um falso verde: foram medidos **568 erros TypeScript em 87 ficheiros**, mas `tsc || exit 0` devolve sucesso.

Esta auditoria não arrancou a API, não leu `.env`, não correu suites que possam tocar em Mongo/integrações e não executou qualquer script de sync/apply/cleanup. A única validação executada foi estática e offline: TypeScript `--noEmit`, regeneração do manifest de rotas e o contract test isolado do Front.

## Atualização F1.0 — 2026-07-15

- O commit `3a5f5ea` declarou Jest/ts-jest, `mongodb-memory-server` e Supertest e sincronizou `package-lock.json` e `yarn.lock`.
- Existem hoje **dois package managers autoritativos**: o `Dockerfile` executa `npm ci`, enquanto `nixpacks.toml` executa `yarn install --frozen-lockfile`. Até uma decisão operacional explícita, qualquer alteração de dependências tem de atualizar e validar **ambos** os lockfiles. Recomendação para decisão: padronizar npm, por já ser o caminho do build de imagem e de produção, migrar o Nixpacks num commit isolado e só depois retirar `yarn.lock`; não fazer essa troca dentro da contenção F1.0.
- A cache original do binário Mongo estava em `node_modules/.cache/mongodb-memory-server` e seria destruída por `npm ci` ou pela remoção de `node_modules`, exigindo novo download. A F1.0 fixa `MONGOMS_DOWNLOAD_DIR=.cache/mongodb-memory-server`, fora de `node_modules`, com runtime download desligado nos testes; a cache continua sendo artefacto local ignorado e deve ser pré-carregada no ambiente offline.
- O gate Jest padrão passa a bloquear egress antes das suites, não inicia Mongo globalmente e mantém load, E2E e a suite legacy de arquitetura fora da execução normal. A suite legacy deixou de aceitar `MONGO_URI` como fallback e só pode receber `MONGO_URI_TEST` validada pelo sentinel.

## Atualização F1.8 — 2026-07-15

- A redação de observabilidade passa a ter uma única implementação, consumida pelo logger Winston e pelo error handler. Os vetores cobrem emails planos e `%40`, Bearer tokens, segredos nomeados, query strings e paths conhecidos com PII.
- Foram migrados apenas os pontos de fuga definidos para esta fase: autenticação, métricas de requests e fragmentos de credenciais/tokens do serviço de lições Hotmart. Auth e métricas guardam templates de rota, nunca o email presente no path.
- Permanecem **2681 chamadas `console.*` em 136 ficheiros**. Esta dívida não foi escondida nem migrada em massa: deve ser tratada por módulo. A F1.10 deve ativar `no-console` no scope limpo para impedir novas chamadas enquanto a migração avança.

## Método e escala

Severidade:

- **Crítica** — permite acesso/escrita não autorizada, exposição de credenciais ou dano operacional direto.
- **Alta** — quebra uma garantia de segurança/qualidade ou cria impacto relevante explorável.
- **Média** — aumenta probabilidade/impacto de falhas e dificulta operação segura.
- **Baixa** — dívida de higiene/manutenção sem impacto imediato demonstrado.

Esforço: **S** (até ~1 dia), **M** (alguns dias), **L** (várias iterações/módulos). As estimativas pressupõem testes offline e revisão independente.

## Achados priorizados (severidade × esforço)

### P0 — contenção imediata

| ID | Severidade | Esforço | Achado e evidência | Recomendação |
|---|---|---:|---|---|
| SEC-01 | **Crítica** | M | **Perímetro sem autenticação/autorização.** `src/routes/index.ts:47-106` monta todas as features sem uma guarda global. Entre 452 declarações `router.*`, apenas `src/routes/auth.routes.ts` e `src/routes/tagMonitoring.routes.ts` importam `authenticate`. Exemplos destrutivos sem guarda: `src/routes/classes.routes.ts:71,77,86`, `src/routes/guru.routes.ts:326-395,438`, `src/routes/ACroutes/activecampaign.routes.ts:109-121`, `src/routes/cron/cronManagement.routes.ts:21-24` e `src/routes/renewalAc.routes.ts:93-121`. | Criar uma matriz explícita público/autenticado/papel; aplicar **default deny** em `/api` e allowlist curta para login, health e webhooks autenticados por assinatura. Exigir `authorize(...)` nas operações destrutivas. Fazer rollout por grupos com testes de 401/403 e contract test. |
| SEC-02 | **Crítica** | S | **JWT forjável quando falta env.** Há fallback hardcoded idêntico em `src/middleware/auth.middleware.ts:5`, `src/controllers/auth.controller.ts:6` e `src/controllers/classes.controller.ts:20`; `JWT_SECRET` nem está documentado em `.env.example:1-19`. | Remover todos os defaults, validar segredo forte no arranque e abortar antes de montar rotas. Centralizar emissão/verificação numa única configuração. Rotar o segredo depois da mudança. |
| SEC-03 | **Crítica** | S | **Endpoints de teste/debug ativos em produção.** `src/index.ts:338-339` monta sempre `/api/test/history`; as rotas alteram, revertem, apagam e populam dados, incluindo todos os utilizadores (`src/routes/testHistory.routes.ts:18-46`). `/api/guru/debug/token` revela existência, comprimento e fragmentos do token (`src/routes/guru.routes.ts:96`; `src/controllers/guru.webhook.controller.ts:536-555`). Há ainda `/api/activecampaign/debug/curseduca-data` (`src/routes/ACroutes/activecampaign.routes.ts:128`). | Remover da superfície de produção. Se forem indispensáveis localmente, compilar/montar apenas com uma flag explícita proibida em produção e autenticação SUPER_ADMIN. Nunca devolver previews de segredos. |
| SEC-04 | **Crítica** | S (código) + operação | **Credenciais previamente expostas continuam marcadas para rotação.** `URGENT_KEY_REPLACEMENT.md:15-30,52-58` lista MongoDB e duas credenciais CursEduca ainda pendentes; o próprio plano OGI repete a pendência do Mongo. | Rotar imediatamente no Atlas/CursEduca, atualizar Railway/local, invalidar valores antigos e pedir purge dos objetos Git órfãos. Não esperar pelo refactor. Registar apenas conclusão/data, nunca os valores. |
| SEC-05 | **Crítica** | M | **Upload não autenticado + parser vulnerável + sem limites.** `src/routes/users.routes.ts:45,517` usa `multer({ dest })` sem limites e entrega o ficheiro a `XLSX.readFile` (`src/controllers/users.controller.ts:1985-1986`). Lockfile: `multer@1.4.5-lts.2` e `xlsx@0.18.5` (`package.json:21,27`). O advisory GHSA-fjgf-rc76-4x9p afeta Multer `<2.0.2`; o mais recente GHSA-5528-5vmv-3xc2 afeta `<2.1.1`. SheetJS 0.18.5 é afetado por GHSA-4r6h-8v6p-xvw6 e GHSA-5pgg-2g8v-p4x9. | Primeiro proteger/desligar o endpoint. Impor `fileSize`, contagem, MIME + assinatura real, armazenamento temporário e cleanup. Atualizar Multer para `>=2.1.1`. Substituir `xlsx` por biblioteca mantida ou usar uma distribuição corrigida e fixada após revisão de supply chain. Testar ficheiros hostis offline. |
| SEC-06 | **Alta** | S/M | **Webhooks ActiveCampaign sem autenticidade.** `src/routes/webhooks.routes.ts:12-14` monta três POST públicos sem verificação de assinatura/segredo. `src/controllers/webhooks.controller.ts:15-62` confia no body, regista email/link e o endpoint de teste devolve o body. Em contraste, Guru valida token em `src/controllers/guru.webhook.controller.ts:75-85`. | Validar assinatura/segredo com comparação constante antes de parse/processamento; limitar body e taxa; remover `/ac/test`; tornar processamento idempotente/replay-safe. |
| SEC-07 | **Alta** | M | **PII e tokens nos logs/métricas.** Auth regista URL, fragmentos do header/token e email (`src/middleware/auth.middleware.ts:30-52`). Hotmart regista fragmentos do access token/header (`src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService.ts:44,77,122`). O middleware guarda `req.path` e regista paths lentos (`src/middleware/metrics.middleware.ts:30-48`), enquanto emails aparecem em paths como `src/routes/users.routes.ts:508`, `src/routes/ACroutes/acReader.routes.ts:17-18` e `src/routes/guru.routes.ts:187`. Existem ainda milhares de `console.*` com emails. | Criar logger único com redação central, IDs de rota normalizados (`/users/by-email/:email`) e allowlist de metadata. Proibir tokens/headers/bodies/email cru. Proteger métricas e migrar PII de path para body/query quando possível. Adicionar testes de vetores de redação como no Front. |

### P1 — restaurar garantias básicas

| ID | Severidade | Esforço | Achado e evidência | Recomendação |
|---|---|---:|---|---|
| TOOL-01 | **Alta** | L | **Falso-verde eliminado por ratchet; dívida TypeScript ainda aberta.** `package.json` mantém temporariamente `tsc || exit 0`, mas o `prebuild` executa `types:check` e falha antes do compilador se a dívida subir ou migrar para um ficheiro limpo. Remover os stubs `@types` não alterou 568 erros/87 ficheiros/391 TS2349; tipar 22 guards de models reduziu para 194/45 e eliminou TS2349. | Baixar a baseline ratcheted até zero, por módulo. O ESLint ratcheted é um gate separado já entregue. Quando TypeScript chegar a zero, ativar `noEmitOnError:true`, remover o bypass e iniciar `strict` em ondas. |
| TOOL-02 | **Alta** | M | **ESLint ratcheted entregue na F1.10.** A flat config aplica regras recommended de JavaScript/TypeScript, regras explícitas de segurança e `no-console` global. A baseline nativa contém 2904 suppressions por ficheiro+regra: 2681 `no-console`, 115 `no-unused-vars` e 108 das restantes regras. Não existe comando para aumentar a baseline; suppressions obsoletas fazem o gate falhar até `lint:baseline:prune`. | Manter `--max-warnings=0`, podar a baseline à medida que a dívida desce e nunca usar `--pass-on-unpruned-suppressions`. `no-explicit-any` fica desligada por 1965 violações em 183 ficheiros enquanto `strict:false`; reavaliar e ratchetar quando o `strict` entrar em ondas. |
| TOOL-03 | **Alta** | S/M | **Dois package managers controlam builds diferentes.** `Dockerfile` usa `npm ci`/`package-lock.json`; `nixpacks.toml` usa Yarn com `yarn.lock`. Atualizar só um lockfile pode partir apenas um dos caminhos de deploy, escondendo a divergência no outro. | Decisão operacional pendente: recomendar npm como autoridade única e migrar Nixpacks num commit isolado e revisto. Até lá, tratar os dois lockfiles como gate obrigatório em qualquer alteração de dependências. |
| TEST-01 | **Alta** | M | **Suites podem tocar em sistemas reais.** `tests/sprint1/architecture.test.ts:16-25` cai de `MONGO_URI_TEST` para `MONGO_URI` e cria/apaga dados. `tests/load/load.test.ts:8-68` faz até 1100 pedidos HTTP. `tests/setup.ts:6-30` tenta MongoMemoryServer, mas a dependência não está declarada. | Proibir fallback para env de produção; exigir URI efémera com nome/sentinel de teste e abortar caso contrário. Separar unit/integration/load/e2e; mocks por defeito; load só com opt-in e host allowlisted local. |
| TEST-02 | **Alta** | M | **Runner/gate incoerente.** Scripts referem Jest, Playwright e Mocha (`package.json:50-55,92`), mas nenhum está declarado; `playwright.config.ts` está vazio. Existem apenas 3 ficheiros TS de teste para 306 ficheiros TS de produção. | Consolidar Jest para unit/integration (ou escolher outro runner uma vez), remover JS derivados, declarar toolchain e criar cobertura inicial honesta. Playwright só para E2E explícito e totalmente sandboxado; Mocha legacy deve ser migrado. |
| SEC-08 | **Alta** | M | **Sem headers, rate limiting ou política de body/upload.** `src/index.ts:282-306` aplica apenas CORS, compressão, JSON e métricas; não há Helmet/rate limiter. Login tem lock por conta (`src/controllers/auth.controller.ts:38-73`), mas isso não limita IP nem as centenas de endpoints públicos. O container corre como root (`Dockerfile:19-36`, sem `USER`). | Helmet; rate limits separados para login, webhooks e operações pesadas; limites de body/upload; timeouts; utilizador não-root no container. Testar headers e 429 offline. |
| SEC-09 | **Alta** | M | **Validação de input/mass assignment inconsistente.** Foram encontrados 368 acessos a `req.body/query/params`, mas uso de `express-validator` é residual. Vários controllers passam bodies inteiros para criação/update (`src/controllers/acTags/tagRule.controller.ts:81,119`, `src/controllers/users.controller.ts:1427`, `src/controllers/cron/cronManagement.controller.ts:422`). Não existe sanitização NoSQL global. | Schemas por endpoint na fronteira, com strip/reject de campos desconhecidos e DTOs explícitos. Sanitização contra `$`/`.` como defesa adicional, não substituto da validação. Testes de operators maliciosos e mass assignment. |
| SEC-10 | **Alta** | M | **Erros internos devolvidos ao cliente e sem handler central.** Não existe middleware final `(err, req, res, next)` em `src/index.ts:268-393`; há centenas de respostas com `error.message/details`, por exemplo `src/routes/events.routes.ts:34,52,89` e `src/controllers/analytics.controller.ts:105-108`. | Erros tipados + handler central no fim; mensagem pública estável, correlation ID e detalhe só no logger redigido. Migrar por feature preservando contratos do Front. |
| SEC-11 | **Alta** | S/M | **CORS fixo e permissivo em dev.** A whitelist está hardcoded (`src/index.ts:269-301`); origem desconhecida é permitida fora de `NODE_ENV=production`. Isto é o bloqueador D3 do deploy. | `ALLOWED_ORIGINS` separada por vírgulas, unida aos defaults; normalizar e testar. Manter sem-origin apenas onde necessário. Em ambientes não locais, falhar fechado; não usar `NODE_ENV` como única fronteira. |
| OPS-01 | **Alta** | M | **Config não validada e arranque com side effects.** Mongo aceita string vazia (`src/index.ts:84`); JWT tem default fraco; imports arrancam jobs (`src/index.ts:14,27`), Redis liga e Mongo/CRON/seeds/warmups iniciam ao importar (`src/index.ts:79-265`). | Módulo de configuração validado e tipado, com fail-fast. Separar `createApp()` puro de `bootstrap()`; registo explícito de modelos e jobs; startup order e shutdown testáveis. |
| OPS-02 | **Alta** | M/L | **Idempotência/limites não são política transversal.** Renewal AC/Discord têm kill switches, caps e alguma idempotência (`src/services/renewal/renewalAcSync.service.ts:426-465`; `src/services/renewal/discordScheduledMessages.service.ts:12-20`), mas rotas destrutivas legacy não apresentam a mesma fronteira e estão sem auth. | Reutilizar o padrão bom: plan/approve/execute, idempotency key persistida, cap por run, dry-run default, kill switch e audit log. Aplicar primeiro a inativação CursEduca/Guru e syncs/tags AC. |

### P2 — arquitetura e manutenção

| ID | Severidade | Esforço | Achado e evidência | Recomendação |
|---|---|---:|---|---|
| ARCH-01 | **Média** | M | **Bootstrap god-file.** `src/index.ts` tem 393 linhas, 53 imports, modelos por side effect (`:37-66`), jobs por import (`:14,27`), ligação a infra/seeds/warmups (`:79-265`), middleware e rotas (`:268-339`) e `listen` (`:349`). | Extrair `config`, `app`, `routes`, `database`, `jobs` e `server`. `createApp(deps)` não pode ligar rede/BD nem iniciar jobs; `bootstrap` coordena dependências explicitamente. |
| ARCH-02 | **Média** | L | **Módulos gigantes apesar de existirem camadas úteis.** Exemplos: `clarezaCarteiraService.ts` 4692 linhas, `users.controller.ts` 3649, `universalSyncService.ts` 2585, `classes.controller.ts` 2347. | Refactor vertical por domínio, não reorganização cosmética. Extrair use cases e adapters atrás das rotas atuais; golden/characterization tests primeiro. |
| ARCH-03 | **Média** | L | **Contrato de resposta inconsistente.** Há arrays diretos (`src/controllers/classes.controller.ts:105,679`), envelopes `{success,data}`, `{message}`, `{error}` e detalhes internos. O Front já sofreu regressões entre `{success:false}` e rejeições. Instância reproduzida: `GET /api/users/v2` devolvia itens sem `products` (ou com `null`), causando `n.products is not iterable` no analytics; a F1.9 fixa `products` como array na fronteira da resposta. | Definir envelope/versionamento para código novo; adaptar feature a feature. Não converter 456 rotas de uma vez. Preservar semanticamente as mutações destrutivas até os consumidores migrarem. |
| ARCH-04 | **Média** | M/L | **Superfície de rotas maior que o consumo conhecido.** Manifest atual: 456 rotas; Front principal: 188 chamadas. A diferença não é automaticamente código morto (webhooks/consumidores externos). Candidatas fortes: `/api/test/history/*`, debug Guru/AC, `/api/webhooks/ac/test`, e montagem duplicada/legacy de cron em `/cron-tags` (`src/index.ts:336`) e `/api/cron-tags` (`src/routes/index.ts:100`). | Criar catálogo com owner/consumer/criticidade/publicidade por rota. Marcar deprecated, observar uso com path template redigido e remover só após janela definida. Regenerar manifest e correr contract test em cada mudança. |
| ARCH-05 | **Média** | M | **Paginação/limites inconsistentes.** Defaults de 10 000 em `src/controllers/guru.sso.controller.ts:245` e `src/controllers/guru.webhook.controller.ts:305`; 1000 em `src/controllers/users.controller.ts:629` e `src/controllers/testimonials.controller.ts:753`; várias listagens usam `find({})`. | Helper único de paginação com min/max, cursor onde necessário e projeção explícita. Limites por endpoint baseados no payload e índice. |
| DOC-01 | **Média** | S | **Auditoria anterior sobredeclara garantias.** `COMPLETE_SECURITY_AUDIT.md:4` diz “100% completa”, usa “impossível/garantido” (`:418-498,1346-1357`), mas termina com testes pendentes (`:525-526,1365`). Os scripts exigidos `initialize-native-tags-protection.js` e `test-native-tag-protection.js` não existem no checkout, embora sejam citados em `:167-170`. O serviço/modelo existem e o orchestrator chama a proteção, mas não há testes automatizados localizados. | Renomear/classificar como documento histórico de Tag System, remover garantias absolutas e abrir testes de caracterização totalmente mockados. Não executar os comandos de produção ali sugeridos durante a auditoria. |
| DOC-02 | **Baixa** | S | **Sprawl e metadata.** Há 18 Markdown na raiz, `name: my-app-backend`, `main:index.js` (`package.json:2-4`), `nul`/logs grandes ignorados no working copy e compose com imagens `latest` + Grafana `admin/admin` (`docker-compose.monitoring.yml:5,20,25-26`). | Mover docs para `docs/` com índice/status; limpar artefactos locais; corrigir metadata; fixar imagens por versão/digest e retirar credenciais default. |

## Reconciliação dos documentos existentes

### `COMPLETE_SECURITY_AUDIT.md`

O documento é uma auditoria específica da proteção de tags nativas, não uma auditoria geral da API. Foram confirmados no código o modelo, o serviço, o formatter, o snapshot e a chamada do orchestrator. Não foram confirmadas as garantias absolutas: não há testes automatizados encontrados para `canRemoveTag`/`filterSafeTagsToRemove`, os dois scripts de validação citados não existem e o próprio documento marca testes pendentes. Além disso, a captura falha de forma tolerada (`src/services/activeCampaign/tagOrchestrator.service.ts:107-115`) e uma tag manual com formato BO continua a depender da qualidade do snapshot. Deve ser preservado como histórico, corrigido e coberto por testes antes de qualquer ativação.

### `URGENT_KEY_REPLACEMENT.md`

Continua acionável. A limpeza do histórico não invalida credenciais já expostas; Mongo e CursEduca devem ser rotados fora do ciclo de refactor. Não foi lido nem reproduzido qualquer valor de `.env` nesta auditoria.

### `RENOVACAO_OGI_BO_PLAN.md`

O padrão de segurança mais maduro da API está neste domínio: master switches default-off, caps, plan/approve/execute, freshness e seeds que não reativam kill switches. Estes componentes são ativos a preservar e servem como padrão para refatorar operações destrutivas legacy. O documento também confirma que existem integrações/CRONs vivos e reforça a decisão contra rewrite.

## Testes e ponte de contrato

- O manifest foi regenerado offline a partir do checkout atual: **456 rotas**, sem diff.
- O teste isolado `Front/src/__tests__/transportContract.test.ts` passou: **10/10**.
- O Front ratchets **188** chamadas do backend principal e não encontrou gaps contra o manifest.
- Isto prova montagem método/path, não autenticação, payload, efeitos ou segurança.
- A lista de `parseOrWarn` do Front deve ser recolhida em staging com dados sintéticos/cópia anonimizada; não se deve apontar o Front de teste à API/BD de produção.

Gate seguro proposto antes de qualquer suite da API:

```text
1. Validar que NODE_ENV=test e MONGO_URI_TEST aponta para instância efémera/local.
2. Bloquear DNS/egress para Guru, CursEduca, ActiveCampaign, Discord e Hotmart.
3. Unit tests com adapters mockados.
4. Integration tests contra Mongo efémero, sem fallback.
5. Contract test do Front após qualquer alteração de rota.
6. Load/E2E apenas por opt-in, target allowlisted 127.0.0.1.
```

## Refactor incremental vs. rewrite

### Recomendação: refactor incremental por estrangulamento

**Não recomendar rewrite big-bang.** Fundamentação:

1. Existem 456 contratos de rota e 188 chamadas vivas só no Front; há ainda webhooks e consumidores externos.
2. Integrações reais e CRON jobs incorporam regras operacionais difíceis de redescobrir.
3. Há ativos recuperáveis: separação routes/controllers/services/models, adapters, contract bridge, kill switches/caps do renewal e proteção de tags.
4. Os riscos mais graves — auth, segredos, test/debug, uploads, logs e gate — podem ser contidos incrementalmente sem reimplementar domínio.
5. Um rewrite executado com testes atuais reproduziria bugs e perderia comportamento, porque a cobertura é quase inexistente e algumas suites usam dados reais.

Reescrita localizada pode ser adequada para unidades de entropia extrema, como `clarezaCarteiraService.ts`, `users.controller.ts` e o bootstrap, mas sempre atrás das rotas/adapters existentes e com characterization tests. “Rewrite” deve significar substituir um módulo de cada vez, não lançar uma segunda API paralela sem paridade.

## Ordem recomendada após validação do revisor

1. **Incidente/contensão:** rotação de chaves; retirar test/debug; JWT fail-fast; proteger operações destrutivas com default-deny.
2. **Perímetro:** webhooks assinados, upload limitado, Multer/xlsx, Helmet/rate limits, CORS env.
3. **Test harness seguro:** remover fallbacks reais, declarar um runner, Mongo efémero obrigatório e egress bloqueado.
4. **Tooling ratcheted:** remover stubs obsoletos, tipar os guards de models, medir/corrigir TypeScript por módulo e adicionar ESLint incremental; só então eliminar `|| exit 0`.
5. **Bootstrap:** `createApp` puro, config validada, error handler central, jobs explícitos.
6. **Strangler por domínio:** primeiro operações destrutivas CursEduca/Guru/AC; depois módulos de maior tamanho/risco.
7. **Contratos:** envelope novo apenas por versão/módulo, manifest + contract test sempre.
8. **Bloco conjunto Front/API:** JWT localStorage para cookie `httpOnly`, com CSRF/SameSite/CORS desenhados em conjunto.

## Gate de aceitação da Fase 0

- [x] Achados priorizados por severidade × esforço.
- [x] Evidência `ficheiro:linha` para cada achado material.
- [x] Auditorias/planos existentes reconciliados.
- [x] Contract manifest regenerado e teste offline executado.
- [x] Recomendação fundamentada refactor vs. rewrite.
- [x] Nenhuma chamada real, servidor ou script destrutivo executado.
- [ ] Revisão independente deste relatório antes da Fase 1.

## Referências externas de advisories

- SheetJS prototype pollution: https://github.com/advisories/GHSA-4r6h-8v6p-xvw6
- SheetJS ReDoS: https://github.com/advisories/GHSA-5pgg-2g8v-p4x9
- Multer malformed-request DoS: https://github.com/advisories/GHSA-fjgf-rc76-4x9p
- Multer uncontrolled-recursion DoS: https://github.com/expressjs/multer/security/advisories/GHSA-5528-5vmv-3xc2
