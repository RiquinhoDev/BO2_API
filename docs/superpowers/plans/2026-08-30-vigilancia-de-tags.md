# Vigilância de tags — adaptação ao remake

Snapshot de código: 2026-09-08. Origem: `00a9b9a0cfd9d378608fc06b56dd29640ac68732`, já contida em `main` (`b4836ee9`).

## Estado e responsabilidade

**PENDENTE: validação em dev.** Backend é responsável pelos comandos, limites, configuração e comportamento da API. Frontend é responsável pela fila, expansão de lotes, histórico e apresentação dos erros. A conclusão da implementação offline é registada em `TASKS_DONE.md`; este roteiro não certifica produção.

A adaptação substitui o plano histórico de 30/08, cujas contagens reais e afirmações sobre jobs ligados não descrevem o ambiente atual. O documento original continua acessível no commit de origem, mesmo depois de removido o branch. As notas visuais de `.impeccable.md` não são configuração da API; o contexto funcional relevante está neste documento e no diagrama.

## Contrato preservado

- Vigiar a turma atual, as duas tags obrigatórias nomeadas, a pertença à lista Alunos OGI e o estado Aluno OGI Antigo. As tags históricas de outras turmas não entram por serem antigas.
- Identificar alunos OGI pelo produto Hotmart e cruzar com `combined.status: ACTIVE`; não confundir toda a população ativa com a coorte OGI.
- Comparar antes de atualizar o espelho; a primeira leitura e uma tag que passou a ser visível não significam remoção/aplicação real.
- Agrupar rajadas por proximidade de 120 segundos, limiar 10. Nunca colapsar as linhas persistidas.
- Registar os eventos localmente; nunca aplicar/remover tags na ActiveCampaign. Aceitar retira da fila, mas preserva o histórico.
- `AcTagWatch` tem agendamento próprio, nasce desativado e usa as proteções de execução persistida do remake. Escritas locais exigem o switch mutável e os controlos da rota; estes comandos de diagnóstico não as efetuam.

## Comandos adaptados

Usar as dependências já instaladas. Não executar através de `railway run`, nem instalar pacotes para este procedimento.

```powershell
# Base isolada, acessível localmente; os nomes têm de acabar em _dev ou _test.
$env:NODE_ENV = 'development'
$env:VIGILANCIA_DEV_MONGO_URI = 'mongodb://127.0.0.1:27017/bo2_dev'
node node_modules/ts-node/dist/bin.js --project scripts/qualidade/tsconfig.json scripts/qualidade/fotografar-espelho.ts snapshots/antes.json
node node_modules/ts-node/dist/bin.js --project scripts/qualidade/tsconfig.json scripts/qualidade/diff-espelho-tags.ts snapshots/antes.json
```

Criar previamente a pasta `snapshots/`, já ignorada pelo Git. A fotografia contém dados pessoais; nunca versioná-la. O destino deve ser novo: o comando recusa sobrescrever um ficheiro existente. Credenciais, se necessárias, são fornecidas apenas pelo ambiente. Não há carregamento automático de `.env`.

Os dois comandos acima só leem Mongo. A fotografia é um array JSON compatível com o formato original, validado antes de utilização: emails únicos, tags válidas, datas válidas e pertença à lista conhecida ou nula. Leituras usam cursor ordenado, lotes de 200, timeout de 5 segundos e máximo de 20.000 registos. Snapshots acima de 32 MiB são recusados, nunca truncados. A ligação fecha em caso de sucesso ou erro; criação automática de coleções/índices está desligada.

O diff usa as regras canónicas e o contexto OGI atual. O relatório JSON inclui eventos, lotes, severidade, origem inferida e estado das quatro obrigatórias. A atribuição `nosso` considera apenas logs reais de turma/reembolso lidos na janela recente de três horas e próximos do evento. É uma inferência, não identifica o autor humano da alteração. A comparação é destinada a snapshots recentes do mesmo ambiente; não reconstrói a coorte histórica.

Para consultar a AC de dev sem persistir eventos ou atualizar o espelho:

```powershell
# Fornecer também a configuração completa exigida por loadConfig (segredos distintos,
# credenciais AC e IDs das listas), exclusivamente do ambiente isolado de dev.
# VIGILANCIA_DEV_AC_API_URL tem de coincidir exatamente com AC_API_URL.
$env:VIGILANCIA_DEV_AC_API_URL = $env:AC_API_URL
node node_modules/ts-node/dist/bin.js --project scripts/qualidade/tsconfig.json scripts/qualidade/dry-run-vigilancia.ts
node node_modules/ts-node/dist/bin.js --project scripts/qualidade/tsconfig.json scripts/qualidade/dry-run-vigilancia.ts --sensibilidade
```

Este último comando faz leituras externas: **dry-run não significa offline**. Deve usar uma conta AC isolada de dev, previamente confirmada pelo responsável do ambiente. A verificação de URL exige configuração explícita; não consegue provar que a conta é de dev. `--sensibilidade` efetua três leituras, com limiares 3, 5 e 10; alterações concorrentes na AC podem afetar a comparação. Erro ou relatório parcial termina com código diferente de zero e sem despejar credenciais na consola.

## Validação em dev — PENDENTE

1. BE: executar fotografia, diff e dry-run apenas com dados sintéticos, comparar antes/depois e provar ausência de escritas na AC/BD durante os comandos.
2. BE: simular perda de tag obrigatória, aplicação Antigo com acesso pago, primeira leitura da lista, devolução/recompra e falha de leitura da lista.
3. BE: confirmar idempotência, ordem entre gravação e atualização do espelho e recusa de execução sem os switches/recibos necessários.
4. FE: confirmar fila, expansão e aceitação; o remake limita aceitação em lote a 200 eventos e devolve erro explícito acima disso.
5. FE/BE: validar os envelopes e os timeouts do endpoint manual; não ativar o agendamento por considerar os testes offline suficientes.

[Anatomia das renovações e vigilância](../diagramas/anatomia-das-renovacoes.html) · [Roteiro geral de dev](2026-09-08-main-parity-dev-validation.md)
