import axios from 'axios'
import { assertSafeTestMongoUri, getRequiredTestMongoUri } from '../../src/config/testDatabase'
import { installEgressGuard } from '../support/egressGuard'

const http = require('http') as typeof import('http')
const https = require('https') as typeof import('https')
const net = require('net') as typeof import('net')

const BLOCKED_NETWORK = 'BLOQUEADO: chamada de rede real em teste'
const BLOCKED_DATABASE = 'BLOQUEADO: Mongo de teste inseguro'

describe('egress guard', () => {
  const originalHttpRequest = http.request
  const originalHttpsRequest = https.request
  const originalFetch = global.fetch
  const originalAxiosAdapter = axios.defaults.adapter
  const originalSocketConnect = net.Socket.prototype.connect

  beforeEach(() => {
    const lowLevelTrap = () => {
      throw new Error('LOW_LEVEL_TRAP: o teste tentou ultrapassar o guard')
    }

    ;(http as unknown as { request: typeof http.request }).request =
      lowLevelTrap as typeof http.request
    ;(https as unknown as { request: typeof https.request }).request =
      lowLevelTrap as typeof https.request
    global.fetch = (async () => {
      throw new Error('LOW_LEVEL_TRAP: o teste tentou ultrapassar o guard')
    }) as typeof fetch
    net.Socket.prototype.connect = (() => {
      throw new Error('LOW_LEVEL_TRAP: http.get tentou abrir um socket real')
    }) as typeof net.Socket.prototype.connect
  })

  afterEach(() => {
    ;(http as unknown as { request: typeof http.request }).request = originalHttpRequest
    ;(https as unknown as { request: typeof https.request }).request = originalHttpsRequest
    global.fetch = originalFetch
    axios.defaults.adapter = originalAxiosAdapter
    net.Socket.prototype.connect = originalSocketConnect
  })

  test('bloqueia fetch com a URL no erro', async () => {
    const restore = installEgressGuard()

    await expect(fetch('https://guru.example.test/students')).rejects.toThrow(
      `${BLOCKED_NETWORK} → https://guru.example.test/students`,
    )

    restore()
  })

  test('bloqueia axios com a URL no erro', async () => {
    const restore = installEgressGuard()

    await expect(axios.get('https://hotmart.example.test/users')).rejects.toThrow(
      `${BLOCKED_NETWORK} → https://hotmart.example.test/users`,
    )

    restore()
  })

  test.each([
    ['http', http, 'http://activecampaign.example.test/contact'],
    ['https', https, 'https://discord.example.test/roles'],
  ])('bloqueia %s.request com a URL no erro', (_name, client, url) => {
    const restore = installEgressGuard()

    expect(() => client.request(url)).toThrow(`${BLOCKED_NETWORK} → ${url}`)

    restore()
  })

  test.each([
    ['http', http, 'http://activecampaign.example.test/contact'],
    ['https', https, 'https://discord.example.test/roles'],
  ])('bloqueia %s.get com a URL no erro', (_name, client, url) => {
    const restore = installEgressGuard()

    expect(() => client.get(url)).toThrow(`${BLOCKED_NETWORK} → ${url}`)

    restore()
  })
})

describe('Mongo test sentinel', () => {
  test('rejeita uma URI remota', () => {
    expect(() =>
      assertSafeTestMongoUri('mongodb+srv://user:secret@cluster.example/bo2_test'),
    ).toThrow(BLOCKED_DATABASE)
  })

  test('rejeita uma BD local sem sufixo _test', () => {
    expect(() => assertSafeTestMongoUri('mongodb://127.0.0.1:27017/bo2')).toThrow(
      BLOCKED_DATABASE,
    )
  })

  test('aceita apenas loopback explícito com BD _test', () => {
    const uri = 'mongodb://127.0.0.1:27017/bo2_test'

    expect(assertSafeTestMongoUri(uri)).toBe(uri)
  })

  test('não usa MONGO_URI como fallback', () => {
    expect(() =>
      getRequiredTestMongoUri({
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://127.0.0.1:27017/production',
      }),
    ).toThrow(BLOCKED_DATABASE)
  })
})
