import express from 'express'
import request from 'supertest'
import type { Server } from 'node:http'

const CONCURRENT_REQUESTS = 100
const TOTAL_REQUESTS = 1000
const LOOPBACK_MARKER = { __bo2_offline_loopback: '1' } as const
const describeLoad = process.env.RUN_LOAD_TESTS === 'true' ? describe : describe.skip

function createHealthServer(): Promise<Server> {
  const app = express()
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1')
    server.once('listening', () => resolve(server))
    server.once('error', reject)
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()))
  })
}

async function requestHealth(server: Server): Promise<number> {
  const response = await request(server)
    .get('/api/health')
    .query(LOOPBACK_MARKER)

  return response.status
}

async function captureStatus(server: Server): Promise<number | undefined> {
  try {
    return await requestHealth(server)
  } catch {
    return undefined
  }
}

describeLoad('Load Tests (opt-in)', () => {
  let server: Server

  beforeAll(async () => {
    server = await createHealthServer()
  })

  afterAll(async () => {
    await closeServer(server)
  })

  it('deve aguentar 100 requests concorrentes', async () => {
    const startTime = Date.now()
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => captureStatus(server)),
    )
    const duration = Date.now() - startTime
    const successCount = results.filter(status => status === 200).length

    expect(successCount).toBeGreaterThan(CONCURRENT_REQUESTS * 0.95)
    expect(duration).toBeLessThan(10000)
  })

  it('deve manter performance com 1000 requests sequenciais', async () => {
    const startTime = Date.now()
    const results: Array<number | undefined> = []

    for (let index = 0; index < TOTAL_REQUESTS; index += 1) {
      results.push(await captureStatus(server))
    }

    const duration = Date.now() - startTime
    const successCount = results.filter(status => status === 200).length
    const avgTime = duration / TOTAL_REQUESTS

    expect(successCount).toBeGreaterThan(TOTAL_REQUESTS * 0.95)
    expect(avgTime).toBeLessThan(100)
  }, 120000)
})
