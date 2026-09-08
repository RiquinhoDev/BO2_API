import type { Router } from 'express'
import acRenewalDataRouter from '../../src/routes/acRenewalData.routes'
import acTagWatchRouter from '../../src/routes/acTagWatch.routes'
import hotmartSalesHistoryRouter from '../../src/routes/hotmartSalesHistory.routes'
import productSalesPerformanceRouter from '../../src/routes/productSalesPerformance.routes'
import renewalTimelineRouter from '../../src/routes/renewalTimeline.routes'
import { resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import { useTestRuntimeConfig } from '../support/runtimeConfig'

async function invokeFirstHandler(router: Router, endpoint: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === endpoint && entry.route.methods.post)
  if (!layer) throw new Error(`route ausente: ${endpoint}`)
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
  await Promise.resolve(layer.route.stack[0].handle({ body: { dryRun: false }, query: {}, params: {} }, response, () => undefined))
  return response
}

beforeEach(() => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ syncMutableExecutionEnabled: false })
})

afterEach(() => resetRuntimeConfigForTests())

test.each([
  ['renewal-ac-data', acRenewalDataRouter, '/sync'],
  ['ac-tag-watch', acTagWatchRouter, '/correr'],
  ['renewal-hotmart-sales', hotmartSalesHistoryRouter, '/sync'],
  ['products-sales-performance', productSalesPerformanceRouter, '/sync'],
  ['renewal-timeline', renewalTimelineRouter, '/generate'],
] as const)('%s bloqueia mutação quando o interruptor global está desligado', async (_name, router, endpoint) => {
  const response = await invokeFirstHandler(router, endpoint)
  expect(response.statusCode).toBe(403)
  expect(response.body).toMatchObject({
    success: false,
    error: { code: 'SYNC_MUTABLE_EXECUTION_DISABLED' },
  })
})
