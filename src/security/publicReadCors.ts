import cors, { type CorsOptions } from 'cors'
import type { RequestHandler } from 'express'

// Leituras de mercado do Clareza: sem sessão, sem cookies, a mesma resposta
// serve qualquer origem. Um ACAO fixo em vez de refletir a origem evita o
// problema clássico de cache de CDN com CORS credenciado — o Cloudflare (fora
// do Enterprise) não varia a cache por "Vary: Origin", por isso a primeira
// origem que acerta num URL ficava em cache e era servida a todas as outras.
// Com ACAO "*" uma única versão em cache é sempre válida.
export const PUBLIC_READ_PATHS = [
  '/api/clareza/radar',
  '/api/clareza/data',
  '/api/clareza/raiox',
  '/api/clareza/top10',
  '/api/clareza/comparador',
  '/api/clareza/carteira/data',
  '/api/clareza/carteira/search',
  '/api/clareza/carteira/analysis',
  '/api/clareza/earnings/data',
] as const

const PUBLIC_READ_CORS_OPTIONS: CorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}

const publicReadPathSet = new Set<string>(PUBLIC_READ_PATHS)

function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

export function isPublicReadPath(path: string): boolean {
  return publicReadPathSet.has(normalizePath(path))
}

// Escolhe, por pedido, entre o CORS público fixo (leituras de mercado) e o
// CORS credenciado restrito à allowlist (tudo o resto). As duas instâncias
// nunca correm as duas para o mesmo pedido, por isso nenhuma sobrepõe os
// headers da outra — incluindo o preflight OPTIONS, que o pacote "cors"
// responde e termina sozinho.
export function createSplitCors(restrictedOptions: CorsOptions): RequestHandler {
  const restrictedCors = cors(restrictedOptions)
  const publicReadCors = cors(PUBLIC_READ_CORS_OPTIONS)
  return (req, res, next) => {
    if (isPublicReadPath(req.path)) return publicReadCors(req, res, next)
    return restrictedCors(req, res, next)
  }
}
