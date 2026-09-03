# Diagramas do fluxo das renovações

`anatomia-das-renovacoes.html` — oito diagramas mermaid do nocturno, para a
equipa e a chefia decidirem ligar ou ajustar.

Publicado em https://claude.ai/code/artifact/697f8346-906f-4882-9eb0-87628c8ce9eb

## Para o Codex: o que verificar

Os diagramas foram escritos a partir das decisões, não do código. **Verifica que
batem certo com o que está implementado** e diz o que não bater. Em concreto:

**Diagrama 1 — a ordem dos nove passos.** Confere com
`renewalPipeline.service.ts:129-160`, incluindo quais têm `runGatedStep` e o
nome de cada interruptor.

**Diagrama 2 — a decisão da expiração.** Confere com `calcularExpiracao()` em
`acExpirationSync.service.ts`: o ramo base/renovação vem da turma; a oferta só
entra quando não há turma; a guarda `encurtaria()` fecha o caminho.

**Diagrama 4 — as cinco guardas da tag.** Confere com `syncTurmaTags()` em
`acTurmaTagSync.service.ts`: activo, compra válida, excepção, convenção,
existência da tag na AC, já tem. A ordem no diagrama tem de ser a ordem real.

**Diagrama 5 — reembolsos.** Confere com `handleRefunds()` em
`refundHandler.service.ts`, sobretudo que a guarda da recompra é por
**período** e não por objecto ciclo, e que a tag removida é a do ciclo
reembolsado.

**Diagrama 7 — a janela da campanha e o buraco de calendário.** Confere com o
gerador: a existência de turma no mês e a tolerância em dias.

**Diagrama 8 — o que o sistema nunca faz.** Cada linha tem de ter uma guarda
real no código. Se alguma não tiver, é a mais importante de reportar.

## Números

Todos foram medidos contra produção a 24/08/2026, em leitura. Se algum não se
reproduzir, diz qual e o que obtiveste — pode ser o diagrama a estar errado ou
os dados a terem mudado desde então.
