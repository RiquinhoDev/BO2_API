import axios from 'axios'

const http = require('http') as typeof import('http')
const https = require('https') as typeof import('https')

const BLOCKED_MESSAGE = 'BLOQUEADO: chamada de rede real em teste'

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

export function installEgressGuard(): () => void {
  const originalHttpRequest = http.request
  const originalHttpsRequest = https.request
  const originalFetch = global.fetch
  const originalAxiosAdapter = axios.defaults.adapter

  const blockedHttpRequest = ((...args: unknown[]) => {
    throw blockedNetworkError(requestUrl(args, 'http:'))
  }) as typeof http.request
  const blockedHttpsRequest = ((...args: unknown[]) => {
    throw blockedNetworkError(requestUrl(args, 'https:'))
  }) as typeof https.request

  http.request = blockedHttpRequest
  https.request = blockedHttpsRequest
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
    global.fetch = originalFetch
    axios.defaults.adapter = originalAxiosAdapter
  }
}
