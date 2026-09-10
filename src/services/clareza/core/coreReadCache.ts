import { cacheService } from '../../cache.service'
import logger from '../../../utils/logger'

// Quanto tempo um leitor espera pela Mongo antes de desistir e servir o
// ultimo valor bom. So conta no caminho de cache-miss; um hit nao passa por
// aqui. Curto de proposito: o objectivo e o utilizador nunca sentir a Mongo.
const COMPUTE_BUDGET_MS = 8_000

// A copia "ultimo valor bom" sobrevive a uma semana de aquecimentos noturnos
// falhados. O aquecimento reescreve-a todas as noites; a expiracao so existe
// para nao acumular lixo de simbolos que sairam do universo.
const STABLE_TTL_SECONDS = 7 * 24 * 60 * 60

function raceBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`clareza cache: compute excedeu ${ms}ms`)),
      ms,
    )
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

export interface CoreCachedRead<Args extends readonly unknown[], Result> {
  (...args: Args): Promise<Result>
  /**
   * Recalcula e reescreve a cache (chave normal + ultimo-valor-bom),
   * ignorando o que la esteja. E o que o aquecimento noturno usa: com o TTL
   * longo, um `get` simples devolveria o valor de ontem e a geracao nova
   * nunca entrava.
   */
  refresh(...args: Args): Promise<Result>
}

// Cache-aside em Redis a frente das leituras publicas do Clareza. Os dados
// mudam uma vez por dia (publicacao das 03h); o TTL longo + aquecimento
// garante que, durante o dia, um leitor nunca toca na Mongo. Se ainda assim
// houver um miss e a Mongo estiver lenta/em baixo, servimos o ultimo valor
// bom em vez de bloquear o leitor. So o escritor noturno depende da Mongo.
export function withCoreCache<Args extends readonly unknown[], Result>(
  keyPrefix: string,
  ttlSeconds: number,
  keyOf: (...args: Args) => string,
  compute: (...args: Args) => Promise<Result>,
): CoreCachedRead<Args, Result> {
  const keyFor = (args: Args): string => `clareza:core:${keyPrefix}:${keyOf(...args)}`
  const stableKeyFor = (args: Args): string => `${keyFor(args)}:last-good`

  const store = async (args: Args, value: Result): Promise<void> => {
    await cacheService.set(keyFor(args), value, ttlSeconds).catch(() => {})
    await cacheService.set(stableKeyFor(args), value, STABLE_TTL_SECONDS).catch(() => {})
  }

  const read = (async (...args: Args): Promise<Result> => {
    const cached = await cacheService.get<Result>(keyFor(args))
    if (cached !== null) return cached

    // Uma vez iniciado, o compute corre ate ao fim e escreve a cache, mesmo
    // que o leitor ja tenha desistido para o ultimo valor bom.
    const fresh = compute(...args).then(async (value) => {
      await store(args, value)
      return value
    })
    fresh.catch(() => {})

    try {
      return await raceBudget(fresh, COMPUTE_BUDGET_MS)
    } catch {
      const stale = await cacheService.get<Result>(stableKeyFor(args))
      if (stale !== null) {
        logger.warn(`clareza cache ${keyFor(args)}: fonte lenta, a servir ultimo valor bom`)
        return stale
      }
      // Sem nada para servir (primeiro arranque durante uma falha): esperar
      // pelo valor real e melhor do que devolver erro.
      return await fresh
    }
  }) as CoreCachedRead<Args, Result>

  read.refresh = async (...args: Args): Promise<Result> => {
    const value = await compute(...args)
    await store(args, value)
    return value
  }

  return read
}

export function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase()
}

export function normalizeQueryKey(raw: string): string {
  return raw.trim().toLowerCase()
}
