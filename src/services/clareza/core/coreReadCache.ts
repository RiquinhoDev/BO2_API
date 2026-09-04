import { cacheService } from '../../cache.service'

// Cache-aside em Redis à frente das leituras públicas do Clareza. Sem isto,
// cada pedido ia sempre à Mongo — e um soluço do Atlas (visto em produção a
// meio desta sessão: um findOne indexado num documento de 2 registos a
// demorar 15-20s) derruba estes endpoints por igual, mesmo com os dados já
// publicados e corretos na BD. O TTL espelha o Cache-Control já devolvido
// nestes endpoints: o Redis nunca fica "mais desatualizado" do que o browser
// já aceitava ficar. Se o Redis estiver em baixo, cacheService.get/set
// falham em silêncio (ver cache.service.ts) — a leitura cai sempre para a
// Mongo, nunca fica presa à espera do cache.
export function withCoreCache<Args extends readonly unknown[], Result>(
  keyPrefix: string,
  ttlSeconds: number,
  keyOf: (...args: Args) => string,
  compute: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    const key = `clareza:core:${keyPrefix}:${keyOf(...args)}`
    const cached = await cacheService.get<Result>(key)
    if (cached !== null) return cached
    const value = await compute(...args)
    await cacheService.set(key, value, ttlSeconds)
    return value
  }
}

export function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase()
}

export function normalizeQueryKey(raw: string): string {
  return raw.trim().toLowerCase()
}
