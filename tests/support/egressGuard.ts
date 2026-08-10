import axios from 'axios'

const http = require('http') as typeof import('http')
const https = require('https') as typeof import('https')

const BLOCKED_MESSAGE = 'BLOQUEADO: chamada de rede real em teste'
const LOOPBACK_MARKER = '__bo2_offline_loopback'

function blockedNetworkError(url: string): Error {
  return new Error(`${BLOCKED_MESSAGE} → ${url}`)
}

function requestUrl(args: unknown[], defaultProtocol: 'http:' | 'https:'): string {
  const target = args[0]

  if (typeof target === 'string') return target
  if (target instanceof URL) return target.toString()
  if (!target || typeof target !== 'object') return '<url desconhecida>'

  const options = target as Record<string, unknown>
  const protocol = typeof options.protocol === 'string' ? options.protocol : defaultProtocol
  const hostname =
    typeof options.hostname === 'string'
      ? options.hostname
      : typeof options.host === 'string'
        ? options.host
        : '<host desconhecido>'
  const port = options.port ? `:${String(options.port)}` : ''
  const path = typeof options.path === 'string' ? options.path : '/'

  return `${protocol}//${hostname}${port}${path}`
}

function axiosUrl(config: { baseURL?: string; url?: string }): string {
  const url = config.url ?? '<url desconhecida>'
  if (!config.baseURL) return url

  try {
    return new URL(url, config.baseURL).toString()
  } catch {
    return `${config.baseURL}${url}`
  }
}

function isAllowedLoopback(url: string): boolean {
  try {
    const parsed = new URL(url)
    const port = Number(parsed.port)
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]') &&
      Number.isInteger(port) &&
      parsed.searchParams.get(LOOPBACK_MARKER) === '1'
    )
  } catch {
    return false
  }
}

export function installEgressGuard(): () => void {
  const originalHttpRequest = http.request
  const originalHttpsRequest = https.request
  const originalHttpGet = http.get
  const originalHttpsGet = https.get
  const originalFetch = global.fetch
  const originalAxiosAdapter = axios.defaults.adapter

  const blockedHttpRequest = ((...args: unknown[]) => {
    const url = requestUrl(args, 'http:')
    if (isAllowedLoopback(url)) {
      return (originalHttpRequest as (...requestArgs: unknown[]) => unknown)(...args)
    }
    throw blockedNetworkError(url)
  }) as typeof http.request
  const blockedHttpsRequest = ((...args: unknown[]) => {
    const url = requestUrl(args, 'https:')
    if (isAllowedLoopback(url)) {
      return (originalHttpsRequest as (...requestArgs: unknown[]) => unknown)(...args)
    }
    throw blockedNetworkError(url)
  }) as typeof https.request
  const blockedHttpGet = ((...args: unknown[]) => {
    const url = requestUrl(args, 'http:')
    if (isAllowedLoopback(url)) {
      return (originalHttpGet as (...requestArgs: unknown[]) => unknown)(...args)
    }
    throw blockedNetworkError(url)
  }) as typeof http.get
  const blockedHttpsGet = ((...args: unknown[]) => {
    const url = requestUrl(args, 'https:')
    if (isAllowedLoopback(url)) {
      return (originalHttpsGet as (...requestArgs: unknown[]) => unknown)(...args)
    }
    throw blockedNetworkError(url)
  }) as typeof https.get

  http.request = blockedHttpRequest
  https.request = blockedHttpsRequest
  http.get = blockedHttpGet
  https.get = blockedHttpsGet
  global.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    throw blockedNetworkError(url)
  }) as typeof fetch
  axios.defaults.adapter = (async (config) => {
    throw blockedNetworkError(axiosUrl(config))
  }) as typeof axios.defaults.adapter

  return () => {
    if (http.request === blockedHttpRequest) http.request = originalHttpRequest
    if (https.request === blockedHttpsRequest) https.request = originalHttpsRequest
    if (http.get === blockedHttpGet) http.get = originalHttpGet
    if (https.get === blockedHttpsGet) https.get = originalHttpsGet
    global.fetch = originalFetch
    axios.defaults.adapter = originalAxiosAdapter
  }
}
