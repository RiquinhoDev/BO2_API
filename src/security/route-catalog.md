# Catálogo de rotas

`route-manifest.json` é a fotografia das 455 rotas gerada pelo Front com
`node scripts/gen-backend-routes.mjs`. O SHA-256 desta cópia tem de coincidir
com `Front/tests/contracts/backend-routes.json` sempre que a superfície mudar.

`route-catalog.json` regista factos, não política de autorização:

- `access`: apenas `public`, `authenticated`, `signature` ou `dead`;
- `consumer`: consumidor comprovado, ou `desconhecido` quando não há evidência;
- `writes`: a rota pode alterar dados próprios em Mongo;
- `destructive`: a rota pode produzir efeitos externos em CursEduca, Guru,
  ActiveCampaign ou Discord, ou apagar dados persistentemente;
- `evidence`: declaração da rota e, quando existe, chamada viva do Front.

`authenticated` é o piso conservador, inclusive para rotas sem consumidor
identificado. `dead` nunca é inferido pela ausência de chamadas.

Papéis são política e ficaram deliberadamente fora deste catálogo. Enquanto
não existir uma matriz de permissões, um papel só-consulta, audit log de admins
e gating equivalente no Front, nenhuma entrada pode usar `role:*`. O teste
`tests/security/routeCatalog.test.ts` fecha essa regra e exige cobertura exata
do manifest.

As 18 montagens de `cron-tags` estão marcadas `deprecated: true`, mas continuam
ativas. Os headers e logs iniciam a janela de observação; remoção exige tráfego
real observado e uma decisão posterior.
