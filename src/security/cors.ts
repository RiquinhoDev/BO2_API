export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://www.backoffice.serriquinho.com',
  'https://backoffice.serriquinho.com',
  'https://lp.serriquinho.com',
  'https://osriquinhos.serriquinho.com',
  'https://www.osriquinhos.serriquinho.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://comunidadelogin-production.up.railway.app',
])

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
    return url.origin
  } catch {
    throw new Error(`CONFIG_INVÁLIDA: ALLOWED_ORIGINS contém origem inválida: ${value}`)
  }
}

export function buildAllowedOrigins(value?: string): string[] {
  const configured = value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : []

  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured].map(normalizeOrigin))]
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) return true
  try {
    return allowedOrigins.includes(normalizeOrigin(origin))
  } catch {
    return false
  }
}
