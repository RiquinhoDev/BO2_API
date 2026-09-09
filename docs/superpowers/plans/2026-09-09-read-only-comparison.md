# Comparação em modo de leitura

Estado: EM CURSO — implementação local; ativação no ambiente pendente.

## Objetivo e âmbito

Comparar a API remake com os dados copiados para um cluster isolado, preservando os bloqueios de operações mutáveis e de acesso aos fornecedores. Alterações apenas no branch `remake`, com commit local; sem push, deploy ou configuração remota nesta tarefa.

## Ativação obrigatória antes de publicar

1. Para BD partilhada, usar um utilizador Mongo com apenas o papel `read`. Para a cópia isolada aprovada, é aceite o utilizador administrador existente exclusivamente no destino exato e com `NODE_ENV=test`. Não alterar permissões do utilizador de produção.
2. Configurar exclusivamente a API de teste com esse utilizador em `MONGO_URI` e `READ_ONLY_MODE=true`.
3. Publicar a API de teste e confirmar os controlos antes de permitir operações de comparação. Nunca assumir que o modo está ativo apenas por existir um commit.

O modo é opt-in para preservar o comportamento dos ambientes existentes. A configuração de exemplo não o ativa. Fora da exceção isolada descrita abaixo, se as credenciais tiverem permissões de escrita, privilégios desconhecidos ou não puderem ser verificadas, o arranque falha antes de carregar modelos, rotas e jobs. A autorização Mongo é a proteção contra escritas indiretas em handlers GET, incluindo pipelines de agregação que gravem resultados. A verificação usa `connectionStatus` com privilégios efetivos, não apenas o nome de um papel.

## Proteções implementadas

- Middleware bloqueia métodos de alteração e caminhos GET de sincronização/reparação antes dos handlers e do processamento de webhooks.
- Login e logout são exceções de sessão. O login continua a verificar credenciais e bloqueios existentes, mas não grava tentativas, desbloqueios ou último acesso na conta. O limitador HTTP permanece ativo em memória local.
- Jobs, seeds, warmups e monitores do carregador de jobs não são carregados.
- Mongo usa `autoCreate=false` e `autoIndex=false`; a ligação ao Redis partilhado é omitida.
- O transporte HTTP/HTTPS e fetch bloqueia escritas externas. Só permite GET/HEAD HTTPS nos caminhos auditados de subscrições/contactos Guru e API v3 ActiveCampaign em `*.api-us1.com`. Outros fornecedores/hosts ficam bloqueados até revisão explícita. Fetch não segue redirects; pedidos Node são novamente verificados em cada request.
- Sem o modo ativo, o comportamento existente é preservado.

## Limites operacionais

Este modo não promete que todas as páginas funcionem: leituras que tentem gravar caches/estatísticas, fornecedores não permitidos e operações de refresh podem falhar. Não se deve silenciar essas falhas nem apresentar dados incompletos como completos. A autorização Mongo deve permanecer apenas de leitura durante todo o uso; mudanças administrativas posteriores das credenciais ficam fora do controlo da aplicação.

A implementação inicial foi feita apenas em commits. Posteriormente o modo foi ativado no Railway e os dados foram copiados para o cluster isolado. O Front não necessita de alteração para receber a resposta explícita `READ_ONLY_MODE`.

## Verificação

- RED: três testes de política falharam antes da implementação.
- Testes de middleware, transporte nativo/Axios/fetch, login sem gravações, ausência de jobs e infraestrutura.
- Mongo local autenticado: utilizador `read` lê documentos sintéticos e recebe erro de autorização numa tentativa de inserção. Nenhuma tentativa de escrita contra a BD real.
- As permissões foram verificadas no Mongo 8.2.6 local e comparadas com a [documentação de papéis MongoDB](https://www.mongodb.com/docs/manual/reference/built-in-roles/).
- Uma verificação auxiliar iniciada fora do runner tentou descarregar MongoDB; foi interrompida. Os testes concluídos usam o executável em cache e download desativado. Caches existentes foram preservadas.
- Verificação alargada: 92 suites / 647 testes de configuração, segurança, arranque, runtime e autenticação passaram. Depois foi acrescentado e validado o caso da aplicação montada: 2 suites / 5 testes de política e transporte. Integração Mongo local: 1 suite / 2 testes. Build, lint, whitespace e catálogos de rotas, respostas e leituras passaram.

## Ajuste para a cópia isolada — 2026-09-09

A pedido do utilizador, `isIsolatedComparisonDatabase` permite credenciais administradoras apenas quando a URI usa o cluster de testes aprovado, o caminho `/teste`, a ligação confirma `databaseName=teste` e `NODE_ENV=test`. Não existe exceção genérica baseada no nome de utilizador ou apenas na flag de leitura. O cluster real, outra BD, outro ambiente ou uma seleção divergente continuam sujeitos à verificação de privilégios.

Esta exceção retira a garantia de bloqueio Mongo por permissões **na cópia isolada**: uma leitura com efeitos laterais pode gravar caches ou estatísticas nessa cópia. Os bloqueios HTTP, jobs, seeds, warmups, Redis partilhado e transporte externo permanecem ativos. Na BD partilhada continua a ser obrigatório um utilizador Mongo apenas de leitura.

Verificação: RED reproduziu a recusa do administrador no destino correto; GREEN 5 suites / 28 testes, incluindo destino real, BD incorreta, divergência da BD selecionada e ambiente production. Build e lint passaram. Publicação deste ajuste ainda pendente.
