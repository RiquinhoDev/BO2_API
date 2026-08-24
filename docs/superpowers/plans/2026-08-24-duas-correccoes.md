# Duas correcções nos dry-runs

Data: 2026-08-24. Para o Codex, a seguir ao `b71a560`.

Validei e corri os dois dry-runs contra produção.

**O teu runner falhou por não abrir a ligação, não por a BD ter expirado.** O
`scripts/qualidade/dry-runs-renovacoes.ts` nunca chama `ligar()` — o
`lib.ts` tem o ajudante e o script não o usa. Daí o
`buffering timed out after 10000ms`: o Mongoose ficou à espera de uma ligação
que ninguém abriu. Corrido com `await mongoose.connect(process.env.MONGO_URI)`
à cabeça, funciona.

Comando que usei:

```bash
railway run npx tsx <ficheiro>.ts
```

## O que está certo

245/245 testes aplicáveis. Os dois passos ligados na fase da AC, gated, antes
das timelines. O resolvedor funciona — o `jaTem` passou de 20 para **902** e o
`tagInexistente` deu **0**, portanto nenhuma tag seria criada na AC. A guarda
`semCompraValida` apanha 11.

E o desenho dos reembolsos está melhor do que eu tinha suposto: remove a tag
**do ciclo reembolsado**, localizado pela transacção, e não a tag da turma
actual. O `exec@henriqueblanc` perde a tag da Turma 15 de 2509 e mantém a da
Turma 16 onde está agora. Correcto.

---

## C1 — Aplicaria tags a 14 alunos inactivos

```
{"candidatos":930,"aAplicar":14,"jaTem":902,"semMapeamento":3,
 "semCompraValida":11,"tagInexistente":0}
```

`aAplicar` tinha de dar zero. Deu 14, e são **todos `INACTIVE`**, todos da
mesma turma:

```
tiaggo.santos          likax_118            lilianam.barros
joaomontargil          joana.carreteiro     nexitah95
helenacabrita2311      diogobarbara56       danielaf.correia99
danielbv90             c.dossantos81        benjamin.816
andreiafbmota          arhp1991

todos "Turma 6 [2a renov] + REITs | 2507"
```

É a coorte cujo acesso acabou a **31/07/2026** e que o sync inactivou na noite
de 23 para 24. Ainda têm turma e timeline, e o serviço percorre timelines sem
nunca verificar o `combined.status`: **930 candidatos quando há 813 activos**.

- [ ] Só alunos com `combined.status: 'ACTIVE'` são candidatos.
- [ ] Contador novo para os excluídos, para não desaparecerem em silêncio.
- [ ] Teste: aluno inactivo com turma e timeline → não é candidato.

---

## C2 — A guarda da recompra nunca dispara

```
{"reembolsos":22,"protegidosPorRecompra":0,"aRemover":13,"semTag":9}
```

A guarda procura uma compra válida **dentro do ciclo reembolsado**:

```ts
const validSalesAfter = (ciclo?.compras ?? []).filter(...)
```

Mas quem é reembolsado e volta a comprar fica com **dois ciclos do mesmo
período**, não com um ciclo que contém as duas compras:

```
mfranciscamartins14   ciclo 2507   24/07/2025  447€  REEMBOLSADA
                      ciclo 2507   31/07/2025  397€  válida     <- outro ciclo

vania.conceicao       ciclo 2502   24/02/2025  397€ + 97€  REEMBOLSADAS
                      ciclo 2502   24/02/2025  322,76€ + 78,86€  válidas
```

O ciclo do reembolso não tem compra válida lá dentro. A guarda nunca dispara,
e as duas perdem a tag de uma turma que pagaram — a `vania.conceicao` pagou no
**mesmo dia**.

**Duas das treze remoções estão erradas.** As outras onze estão certas: ou não
houve recompra nenhuma, ou a recompra é de outro período e tem tag própria.

- [ ] A guarda passa a olhar para o **período**, não para o objecto ciclo. Se
      existir outro ciclo do mesmo período com compra válida posterior ao
      reembolso, protege.
- [ ] Teste: reembolso e recompra no mesmo dia, em ciclos separados do mesmo
      período → protegido, não remove.
- [ ] Teste: reembolso e recompra 7 dias depois, mesmo período → protegido.
- [ ] Teste: reembolso e recompra num período diferente → **remove** a tag do
      período reembolsado e não toca na do novo.

---

## Números que o dry-run tem de dar

```
tags de turma      aAplicar   0        (era 14)
                   jaTem     ~902
                   semCompraValida ~11
                   tagInexistente   0

reembolsos         protegidosPorRecompra  2     (era 0)
                   aRemover              11     (era 13)
```

Se o `aRemover` não descer para 11, a guarda do período não está a apanhar a
`mfranciscamartins14` e a `vania.conceicao`. Se descer abaixo de 11, está a
proteger gente que devia perder a tag — para e reporta.

## Regras de sempre

- Não ligar nada. Os interruptores ficam `false`.
- Os dry-runs são leituras.
- **Corre-os a sério desta vez**, com a ligação aberta, e cola a saída.
- Commit sim, push não. `main`.
