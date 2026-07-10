# Renovação OGI — Cargos Discord + Mensagens do Bot (Plano)

> **Estado:** PLANO — nada implementado (pedido do João a 2026-07-10: "não programes, apenas plano").
> **Relacionado:** `RENOVACAO_OGI_BO_PLAN.md` (sync BO→AC) — este plano reutiliza os mesmos padrões (change set, kill switches, dry-run, cron desligado à nascença).
> **Repos envolvidos:** BO2_API (orquestração) · `C:\...\api\API` (bots Discord, discord.js v14) · Front (UI).

---

## 1. Objectivo — 3 entregáveis

1. **12 cargos de renovação** no servidor Discord: `renovaçãojaneiro`, `renovaçãofevereiro`, … `renovaçãodezembro`.
2. **Atribuição automática e LENTA** desses cargos aos membros, consoante a turma actual de cada aluno no BO — a correr todas as noites **depois do sync Hotmart** (job "1º", 04:00).
3. **Área no BO para colar mensagens** que o bot publica num canal específico do Discord.

## 2. O que já existe (auditoria 2026-07-10)

| Peça | Onde | Estado |
|------|------|--------|
| Bot Discord ligado ao servidor | `API/bot1.js` — discord.js v14, `DISCORD_TOKEN`, HTTP na porta 3002 | ✅ operacional (usado p/ cargos Ativo/Inativo) |
| **Fila lenta de alteração de cargos** | `bot1.js` `processQueue`: 1 operação/segundo + tratamento de rate-limit 429 com retry | ✅ exactamente o padrão "devagar" pedido — reutilizar |
| Ligação aluno ↔ Discord | BO2 `User.discord.discordIds[]` (com índice e `findByDiscordId`) | ✅ existe; **cobertura: 2.286 de 4.430 alunos com turma (51,6%)**; 104 alunos com múltiplos IDs |
| Mês de renovação por turma | BO2 `turmaParser.parseTurmaName()` → `accessEndOgi` → **o mês dessa data É o mês de renovação** | ✅ zero trabalho novo no mapeamento |
| Padrão change set + kill switches + dry-run | BO2 `RenewalAcChange` / `renewalAcSync.service` | ✅ copiar o desenho (provou-se no sync AC) |
| Cron nocturno pós-Hotmart | scheduler BO2 (padrão Fase A 04:00 → Fase B desacoplada) | ✅ padrão estabelecido |
| Envio de mensagens pelo bot | — | ❌ não existe (o bot só reage a comandos `!setroleinactive`) |
| Auth no endpoint HTTP do bot | `POST :3002/setUserAsInactive` | ⚠️ **SEM autenticação** — corrigir antes de expor mais endpoints |

## 3. Possível vs Não possível (resposta directa)

### ✅ Possível
| Pedido | Como |
|--------|------|
| Criar os 12 cargos | Manual no Discord (recomendado, 10 min) ou pelo bot. Guardar os **role IDs** em config |
| Atribuir cargo pelo mês de renovação da turma | BO calcula mês via `parseTurmaName`; bot aplica. Trivial com o que existe |
| Fazê-lo "devagar" | A fila 1 op/s do bot1 já faz isto. Backfill inicial: ~2.286 membros ≈ **40 min** numa noite; deltas diários: segundos/minutos |
| Correr todas as noites depois do sync Hotmart | Cron novo no BO2 (ex.: 05:30 Lisboa), mesmo padrão do RenewalAcSync: nasce desligado, gera plano revisável, executa só com switches ligados |
| Trocar o cargo quando o aluno muda de turma/renova | O plano nocturno inclui remover o cargo do mês antigo e aplicar o novo (o bot já sabe fazer add+remove na mesma operação) |
| Bot escrever mensagens coladas num canal específico | Endpoint novo no bot (`POST /messages`) + fila na BD do BO + UI para colar/rever/enviar. Suporta texto até 2000 caracteres por mensagem (limite Discord; textos maiores são divididos automaticamente) |
| Dry-run e reversão | Mesmo modelo do sync AC: plano PLANNED → aprovar → executar; cargo é reversível (remover) |

### ❌ Não possível / limitações a aceitar
| Limitação | Detalhe |
|-----------|---------|
| **~48% dos alunos não têm Discord ligado no BO** | O Discord não expõe email dos membros — é impossível fazer matching por email. **DECISÃO (João, 2026-07-10): não fazer nada agora** — o sistema é auto-corrector: como o diff corre todas as noites, quando um aluno ligar o Discord mais tarde recebe o cargo na noite seguinte automaticamente. Fica só o relatório de "não ligados" para visibilidade |
| Membros que saíram do servidor | Bot não atribui cargos a quem não está no guild → relatório "não encontrado" |
| Cargo acima do cargo do bot | O bot só gere cargos ABAIXO do seu na hierarquia — os 12 cargos têm de ficar abaixo do cargo do bot |
| Velocidade | Rate limit do Discord obriga ao ritmo lento (é o que queremos, mas o backfill não é instantâneo) |
| Mensagens: 2000 caracteres/mensagem | Textos maiores → divididos em várias mensagens. @everyone/@here serão bloqueados por defeito (`allowed_mentions`) para evitar pings acidentais |
| Autoria das mensagens | No Discord aparece sempre o BOT como autor (não quem colou no BO) |
| 104 alunos com múltiplos discordIds | Decidir: aplicar o cargo a todos os IDs (recomendado) ou só ao primeiro |

## 4. Arquitectura proposta (espelho do sync AC)

```
04:00  Cron "1º" (Hotmart) — como hoje, intocado
05:30  Cron novo "DiscordRolesSync" (BO2, NASCE DESLIGADO)
         1. Para cada aluno com turma válida + discordId:
              mês = mês(accessEndOgi da turma actual)
              cargo alvo = renovação{mês}
         2. Diff com o último estado aplicado (guardado no BO)
              → change set DiscordRoleChange (PLANNED): add/remove por membro
         3. Guards: cap por noite (ex. 200 ops, backfill à parte),
              detector de anomalia (>5% de mudanças = abortar),
              switches DISCORD_ROLES_* (default false, runtime)
         4. Execução: BO → POST autenticado ao bot (API repo)
              → fila 1 op/s do bot aplica e devolve resultado
         5. Estado aplicado registado no BO (auditável, reversível)

Mensagens: UI no BO (colar texto + escolher canal) → fila na BD
  → botão Enviar (ou agendar) → POST autenticado ao bot → canal
```

Porquê BO planeia + bot executa (e não o BO a falar directo com a API do Discord): o token fica só no repo API, a fila lenta já existe lá, e o bot é o único com estado do guild (membros/cargos em cache).

## 5. Mapeamento turma → cargo (regra)

- Fonte: turma activa do aluno no BO (`hotmart.enrolledClasses`, a mesma do sync AC).
- `parseTurmaName(className).accessEndOgi` → **mês** → `renovação{mês}` (ex.: turma `| 2505` com 1 ano → acesso termina Maio/2026 → `renovaçãomaio`).
- Turmas `[2anos]` funcionam automaticamente (o parser já soma 24 meses).
- Turma sem parse válido (genérica/intermédia) → sem cargo, entra em relatório BLOCKED (mesma filosofia do sync AC).
- Aluno reembolsado/inativo → remover cargo de renovação (decisão pendente D4).
- **Regra de ouro (D3, decidida):** o cargo espelha SEMPRE a turma actual na Hotmart. Renovação fora de janela → turma nova → o diff nocturno aplica o cargo do mês novo e retira o antigo, sem intervenção manual.

## 6. Riscos e correcções obrigatórias antes de implementar

1. **🚨 Endpoint do bot sem autenticação** (porta 3002): qualquer processo que alcance a porta pode mudar cargos. Corrigir já no primeiro passo: shared secret em header (`X-Bot-Auth`) validado no bot, e idealmente bind a localhost/rede interna do Railway.
2. **Hierarquia**: criar os 12 cargos ABAIXO do cargo do bot; sem permissões associadas (cargos puramente marcadores) — evita escalada acidental de permissões.
3. **Coexistência com Ativo/Inativo**: o bot já mexe em cargos por outro fluxo; o novo sistema só toca nos 12 cargos `renovação*` (allowlist, como a `TURMA_TAG_REGEX` do sync AC).
4. **Massa**: caps + anomalia como no sync AC; backfill inicial executado deliberadamente em lotes aprovados.
5. **Nomes com acentos**: "renovaçãojaneiro" com ç/ã funciona no Discord, mas comparar por **role ID**, nunca por nome (nomes editáveis por admins).

## 7. Decisões pendentes (fechar antes de implementar)

| # | Decisão | Opções | Inclinação |
|---|---------|--------|-----------|
| D1 | Nomes exactos dos cargos | — | **RESOLVIDO: criados a 2026-07-10 como `R. Janeiro` … `R. Dezembro`** (ver 7.1 — IDs verificados por leitura) |
| D2 | Múltiplos discordIds (104 alunos) | aplicar a todos vs só ao 1º | todos |
| D3 | Cargo antigo ao mudar de mês | remover sempre vs manter histórico | **RESOLVIDO (João, 2026-07-10): remover.** O cargo é uma catalogação que raramente muda (subscrição anual → renovam tendencialmente no mesmo mês). Quando muda — renovação fora de janela, "acontece com alguma frequência" — a regra é: o cargo espelha SEMPRE a turma actual na Hotmart; o diff nocturno aplica o cargo do mês novo e retira o anterior automaticamente. 1 cargo de renovação por membro |
| D4 | Reembolsado/ex-aluno | remover cargo vs manter | remover |
| D5 | Canal(is) das mensagens | — | **RESOLVIDO: `🗣📢︱anúncios-alunos`, channel id `1182457352012697671`** (verificado por leitura; canal de texto do guild). Config permite acrescentar mais canais no futuro |
| D6 | Aprovação de mensagens | envia logo quem cola vs 2º par de olhos | enviar logo (com pré-visualização obrigatória e confirmação) |
| D7 | Guild | — | **RESOLVIDO: "Os Riquinhos", guild id `1179187507875827782`** (único servidor; coincide com `DISCORD_GUILD_ID` do .env da API) |

### 7.1 Cargos criados — IDs verificados (leitura à API Discord, 2026-07-10)

Estado ideal confirmado: `permissions=0`, `mentionable=false`, `hoist=false`, posições 1-12 (fundo da hierarquia, muito abaixo do cargo do bot "Ser Riquinho", pos. 59) → todos geríveis pelo bot.

| Mês | Cargo | Role ID |
|-----|-------|---------|
| 1 | R. Janeiro | `1525119563182772385` |
| 2 | R. Fevereiro | `1525119750030495745` |
| 3 | R. Março | `1525119843806875868` |
| 4 | R. Abril | `1525119885867352105` |
| 5 | R. Maio | `1525119933300740156` |
| 6 | R. Junho | `1525119979500998818` |
| 7 | R. Julho | `1525120024681910424` |
| 8 | R. Agosto | `1525120114918166638` |
| 9 | R. Setembro | `1525120320225149108` |
| 10 | R. Outubro | `1525120518695682199` |
| 11 | R. Novembro | `1525120372071202827` |
| 12 | R. Dezembro | `1525120419768696872` |

⚠️ Nota: Outubro/Novembro/Dezembro não foram criados pela ordem do mês (IDs/posições fora de sequência) — irrelevante para o sistema (usamos IDs), registado só para ninguém "corrigir" a ordem à mão e estranhar.

### 7.2 ⚠️ Descoberta na verificação: token principal do bot INVÁLIDO no .env local

O `DISCORD_TOKEN` (bot principal, bot1.js) no `.env` local do repo API devolve **401 Unauthorized** — foi rodado e o local está desactualizado face ao Railway. A verificação acima foi feita com o token do bot BTC (market bot, mesmo servidor). **Antes da Fase D2 (execução):** sincronizar o token actual do Railway para o `.env` local, senão o desenvolvimento/testes locais do bot principal falham.

## 8. Faseamento (ordem decidida pelo João a 2026-07-10)

- **Fase D1 — cargos + mapeamento**: criar os 12 cargos no Discord (manual), config mês→roleId no BO; endpoint genérico de cargos no bot (reutilizando a fila 1 op/s); motor de plano `DiscordRolesSync` em dry-run (só BD), tab no Front (espelho da "Sync AC").
- **Fase D2 — execução piloto**: switches ligados, aplicar a 2-3 membros de teste, verificar no Discord; depois backfill por lotes aprovados (~40 min total).
- **Fase D3 — cron nocturno**: ligar o cron 05:30 (deltas diários, auto ou com aprovação — mesma escolha do sync AC).
- **Fase D4 — mensagens**: endpoint `POST /messages` no bot + fila/UI no BO (colar → pré-visualizar → enviar), `allowed_mentions` bloqueado por defeito.
- **Fase D5 (última, decisão do João) — segurança do bot**: auth (shared secret) nos endpoints HTTP do bot, incluindo o `/setUserAsInactive` existente. Feita depois de tudo operacional. *Mitigação entretanto: manter a porta 3002 inacessível do exterior (rede interna Railway/localhost) — confirmar exposição actual na Fase D1.*

## 9. Números para expectativas

- Alunos com turma: **4.430** · com Discord ligado: **2.286 (51,6%)** · múltiplos IDs: 104.
- Backfill inicial: ~2.286 operações × 1/s ≈ **38-40 min** (uma noite).
- Deltas diários (renovações/mudanças de turma): tipicamente < 30 ops → segundos.
- Custo Discord: zero (bot próprio, API gratuita dentro dos rate limits).

---

## 10. Sistema de mensagens — desenho detalhado (2026-07-10)

Contexto do João: a equipa envia tipicamente **2 mensagens** por ciclo de fim de acesso no canal `🗣📢︱anúncios-alunos`:
1. **"Aviso importante"** — o acesso terminou, há um período de tolerância na comunidade antes da remoção;
2. **"Último dia"** — despedida/última chamada, o acesso é removido à meia-noite.

Hoje as turmas são nomeadas à mão no texto ("Turma 5, Turma 10, Turma 14 e Turma 1,2 e 3") e a mensagem "fala" para o canal inteiro. **A mudança:** passar a mencionar os cargos — ex. `@R. Maio` — para o Discord **notificar apenas as pessoas certas** (quem tem o cargo do mês em causa), em vez de todos.

### 10.1 Como funciona a menção de cargo (tecnicamente)

- No conteúdo da mensagem, a menção é `<@&ROLE_ID>` (ex.: `<@&1525119933300740156>` renderiza como **@R. Maio**).
- Os cargos estão `mentionable=false` (correcto — impede membros de os pingar). Para o **bot** conseguir pingar mesmo assim, precisa da permissão **"Mencionar @everyone, @here e todos os cargos"** — a dar por **override só no canal `🗣📢︱anúncios-alunos`** (não no servidor inteiro).
- Na API, o envio usa `allowed_mentions.roles = [apenas os R.* seleccionados na UI]` — garantia dupla: mesmo que alguém cole `@everyone` no texto, **não pinga** (a allowlist só contém os 12 cargos R.*; `@everyone`/`@here`/users ficam sempre bloqueados).

### 10.2 Templates editáveis (Front)

- Os 2 textos actuais entram como **templates default** guardados na BD, editáveis na UI (área nova na tab/página Discord do BO).
- Placeholders suportados: `{cargos}` (substituído pelas menções dos meses seleccionados), `{dataFim}` (ex.: "31 de Maio").
- Fluxo na UI: escolher template (ou texto livre) → seleccionar 1+ meses (checkboxes R. Janeiro…R. Dezembro) → preencher `{dataFim}` se aplicável → **pré-visualização** (com as menções resolvidas e contagem de membros por cargo) → confirmar → enviar.
- Registo de envios na BD: quem enviou, quando, para que cargos, texto final, message id do Discord (permite apagar/editar a mensagem do bot depois, se preciso).

### 10.3 Limites e comportamento

- 2000 caracteres/mensagem (limite Discord para bots): as 2 mensagens actuais têm ~1.7k e ~1.4k — cabem; textos maiores são divididos automaticamente em várias mensagens (a menção vai na primeira).
- O autor visível no Discord é sempre o bot.
- Editar/apagar depois do envio: possível (mensagens do próprio bot), via registo do message id.

### 10.4 Sinergia com o sync AC (nota)

O mês certo para enviar cada mensagem é derivável dos dados que o BO já tem (turmas a expirar no fim do mês = tab Desempenho das Renovações). Futuro opcional (não pedido): o BO sugerir "este mês toca a @R. Maio" e pré-preencher a selecção — o envio continua sempre manual.
