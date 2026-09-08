import * as compositeExecution from '../../../src/services/cron/compositeExecution.service'
import {
  MAIN_PARITY_EMAIL_BATCH_CAP,
  normalizeMainParityEmails,
  runMainParityExecution,
  runWithMainParityPhaseHooks,
} from '../../../src/services/renewal/mainParityExecution'
import { assertActiveCampaignExecutionOwnership } from '../../../src/services/activeCampaign/activeCampaignExecutionGuard'

test('dry-run não cria receipt e executa apenas a leitura pedida', async () => {
  const receipt = jest.spyOn(compositeExecution, 'runCompositeExecutionWithReceipt')
  const run = jest.fn(async () => ({ dryRun: true, errors: [] }))

  const result = await runMainParityExecution({
    job: 'preview', payload: {}, effect: 'provider', dryRun: true,
    req: {} as never, res: {} as never, run,
  })

  expect(result).toEqual({ dryRun: true, errors: [] })
  expect(run).toHaveBeenCalledTimes(1)
  expect(receipt).not.toHaveBeenCalled()
})

test('batch de emails normaliza e falha fechado acima do cap', () => {
  expect(normalizeMainParityEmails([' A@EXAMPLE.COM ', 'a@example.com']))
    .toEqual(['a@example.com'])
  expect(() => normalizeMainParityEmails([])).toThrow('lista vazia')
  expect(() => normalizeMainParityEmails(['sem-arroba'])).toThrow('formato válido')
  expect(() => normalizeMainParityEmails(
    Array.from({ length: MAIN_PARITY_EMAIL_BATCH_CAP + 1 }, (_, index) => `u${index}@example.com`),
  )).toThrow('Máximo de 200 emails')
})

test('provider transport vê perda de ownership depois de um await', async () => {
  let checks = 0
  const hooks = {
    assertOwnership: () => {
      checks += 1
      if (checks === 2) throw new Error('lease lost before retry')
    },
    providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn(),
  }

  await expect(runWithMainParityPhaseHooks(hooks, async () => {
    assertActiveCampaignExecutionOwnership()
    await Promise.resolve()
    assertActiveCampaignExecutionOwnership()
  })).rejects.toThrow('lease lost before retry')
})

test.each([{ erros: [{ error: 'provider failed' }] }, { step: { erros: [{ error: 'provider failed' }] } }, { success: false }])('partial provider report cannot complete its durable receipt: %j', async report => {
  jest.spyOn(compositeExecution, 'runCompositeExecutionWithReceipt').mockImplementation(async options => options.run({
    assertOwnership: jest.fn(), providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn(),
  }))
  await expect(runMainParityExecution({
    job: 'partial', payload: {}, effect: 'provider-and-local',
    req: { get: () => 'request-1', user: { email: 'test@example.com' } } as never,
    res: { locals: {} } as never, run: async () => report,
  })).rejects.toThrow('MAIN_PARITY_EXECUTION_REPORTED_FAILURES')
  jest.restoreAllMocks()
})
