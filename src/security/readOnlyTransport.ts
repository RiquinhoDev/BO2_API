import { assertReadOnlyHttpRequest } from './readOnlyMode'

import http from 'node:http'
import https from 'node:https'

function destination(args: unknown[], protocol: string): { method: string; url: string } {
  const first = args[0]
  const base = typeof first === 'string' || first instanceof URL ? new URL(first) : undefined
  const options = (base ? args[1] : first) as import('node:http').RequestOptions | undefined
  const host = options?.hostname ?? options?.host ?? base?.hostname ?? ''
  const port = options?.port ?? base?.port
  const path = options?.path ?? (base ? `${base.pathname}${base.search}` : '/')
  return { method: options?.method ?? 'GET', url: `${options?.protocol ?? base?.protocol ?? protocol}//${host}${port ? `:${port}` : ''}${path}` }
}

/** Installed before loading runtime clients. Restored only on bootstrap failure. */
export function installReadOnlyTransport(): () => void {
  const originals = [http.request, https.request, http.get, https.get] as const
  const originalFetch = globalThis.fetch
  const wrap = (request: typeof http.request, protocol: string): typeof http.request => ((...args: unknown[]) => {
    const target = destination(args, protocol)
    assertReadOnlyHttpRequest(target.method, target.url)
    return Reflect.apply(request, undefined, args)
  }) as typeof http.request
  http.request = wrap(originals[0], 'http:')
  https.request = wrap(originals[1], 'https:')
  http.get = ((...args: unknown[]) => { const request = Reflect.apply(http.request, http, args); request.end(); return request }) as typeof http.get
  https.get = ((...args: unknown[]) => { const request = Reflect.apply(https.request, https, args); request.end(); return request }) as typeof https.get
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    assertReadOnlyHttpRequest(request.method, request.url)
    return originalFetch(request, { redirect: 'error' })
  }
  return () => {
    ;[http.request, https.request, http.get, https.get] = originals
    globalThis.fetch = originalFetch
  }
}
