# API main -> remake: validação em desenvolvimento

Estado: PENDENTE. Responsável: backend; adaptação e validação dos consumidores: frontend.

Este documento acompanha a migração do comportamento de `main` em `b4836ee9` para a estrutura de `remake` em `0704745b`. A implementação é local. Nenhuma integração externa ou base de dados de produção foi usada nesta tarefa.

## Preparação

1. Usar uma base de dados isolada e credenciais de teste. Confirmar os IDs dos produtos Hotmart/Guru e dos campos ActiveCampaign nesse ambiente; os valores herdados do código principal não constituem configuração válida de dev.
2. Manter inicialmente `SYNC_MUTABLE_EXECUTION_ENABLED`, os três switches `CLAREZA_*_ENABLED` e os switches Discord desligados. Consultar `.env.example` para os nomes exactos. Não activar jobs apenas por existirem no catálogo.
3. Criar/verificar os índices dos modelos novos e dos recibos de execução na base isolada. Validar a unicidade das timelines por aluno, dos espelhos por identidade de negócio e dos recibos por pedido. Validar listas antigas de inativação antes de qualquer reversão.
4. Preparar alunos sintéticos que cubram compra inicial, renovação, prestações, reembolso, recompra, turma sem mapeamento e conta Discord inexistente. Incluir conjuntos superiores a 200 registos para confirmar a travessia de vários lotes.

## Contratos e interface

| Família | Condições para execução mutável |
| --- | --- |
| Novos endpoints de sincronização de vendas, espelhos e timelines | `SYNC_MUTABLE_EXECUTION_ENABLED=true`, autenticação e autorização |
| Novos endpoints de tags de turma, reembolsos e vigilância | As mesmas condições, mais `dryRun: false` explícito; não dependem de ligar o agendamento do job |
| Continuação diária `RenewalPipeline` | Sucesso do pipeline principal, switch global activo e job `RenewalPipeline` activo; escritas AC respeitam ainda os switches de jobs por fase |
| Família existente `RenewalAcSync` | Mantém os seus switches `RENEWAL_AC_*`; estes não substituem o switch da nova família |
| Clareza canónico | `CLAREZA_CANONICAL_ENABLED`, `CLAREZA_REFRESH_ENABLED` e `CLAREZA_FMP_EGRESS_ENABLED`, além da configuração necessária |
| Envio agendado/manual Discord | `DISCORD_SCHEDULED_MESSAGES_ENABLED`, `DISCORD_MESSAGES_ENABLED`, regra activa e configuração completa do bot |

- Os endereços novos preservam os prefixos de main: `/api/renewal-hotmart-sales`, `/api/renewal-ac-data`, `/api/renewal-timeline`, `/api/ac-tag-watch` e `/api/products-sales-performance`.
- As respostas usam os contratos de sucesso do remake. Validar os consumidores de `data`, relatórios e erros; não assumir a forma JSON antiga.
- As sincronizações HTTP aguardam o resultado protegido por recibo persistido. Os estados são lidos da base de dados, em vez de variáveis em memória. Confirmar os timeouts do proxy em dev e a consulta de estado durante uma execução longa.
- Manter o mesmo `X-Request-ID` ao repetir o mesmo pedido. Pedido diferente com o mesmo identificador deve falhar; execução concorrente deve ser recusada. Resultado indeterminado exige inspeção/reconciliação, não repetição automática com outro identificador.
- Os previews de vigilância de tags, sincronização de tags de turma e tratamento de reembolsos usam `dryRun` por omissão. Confirmar ausência de escritas locais e externas durante o preview.
- `RenewalPipeline` é uma continuação do pipeline diário e não recebe um segundo temporizador. Só arranca após sucesso do processo principal e com o seu interruptor activo. `AcTagWatch` mantém agendamento independente, inicialmente desligado.

## Sequência funcional

1. Validar autenticação e permissões: sem sessão, utilizador sem privilégio e administrador autorizado. Confirmar que os switches desligados impedem os efeitos.
2. Gerar espelhos Hotmart/AC com fixtures completas; simular página em falta, resposta inválida, limite excedido, timeout e falha a meio. Confirmar que dados incompletos não são publicados como sincronização bem-sucedida.
3. Gerar timelines e comparar os resultados com os casos de negócio de main. Confirmar preservação das âncoras históricas e dos estados de reembolso/recompra.
4. Criar, listar, apagar apenas o histórico e reverter listas de inativação. Confirmar que produtos fora do âmbito OGI não são alterados e que o estado anterior é restaurado.
5. Executar os previews AC; rever decisões antes de activar, individualmente, os switches de escrita no ambiente isolado. Confirmar perda de posse da execução e falha parcial sem sucesso falso.
6. Testar mensagens Discord agendadas e envio manual no mesmo mês: um único envio por regra/mês, incluindo concorrência. Confirmar que uma conta inexistente tem tratamento terminal e outros erros continuam visíveis.
7. Activar o core Clareza em dev, preparar uma geração publicada e comparar leituras, radar, carteira, pesquisa, sugestões e documentos complementares. Confirmar indisponibilidade controlada sem configuração FMP/Redis necessária e impossibilidade de dois caminhos de refresh escreverem em paralelo.
8. Validar o percurso completo no Front de dev, incluindo estados de execução, paginação, mensagens de erro e timeouts. Esta tarefa não alterou o Front.

## Critério de fecho operacional

Registar dados sintéticos, versão exacta, resultados de cada percurso e responsáveis FE/BE. Os testes offline e os catálogos confirmam apenas o código local; promoção e produção permanecem fora deste fecho.
