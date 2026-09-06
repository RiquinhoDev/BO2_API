const mockGuruGet = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: mockGuruGet,
      interceptors: { request: { use: jest.fn() } },
    })),
    isAxiosError: jest.fn(() => false),
  },
}))

jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({
  getGuruUserToken: jest.fn(() => 'offline-test-token'),
}))

import { fetchAllSubscriptionsPaginated } from '../../../src/services/guru/sync/client'

describe('Guru pagination safety', () => {
  beforeAll(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((handler: (...args: unknown[]) => void) => {
      handler()
      return 0 as unknown as NodeJS.Timeout
    }) as typeof setTimeout)
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    mockGuruGet.mockReset()
  })

  test('rejects before accumulation when the item cap is exceeded', async () => {
    mockGuruGet.mockResolvedValueOnce({
      data: {
        data: [{ id: 'one' }, { id: 'two' }],
        total_rows: 2,
        has_more_pages: 0,
        on_last_page: 1,
      },
    })

    await expect(fetchAllSubscriptionsPaginated(undefined, undefined, { maxItems: 1 }))
      .rejects.toThrow('GURU_PAGINATION_ITEM_LIMIT_EXCEEDED')
    expect(mockGuruGet).toHaveBeenCalledTimes(1)
  })

  test('rejects deterministic non-progress cursors before another page can accumulate', async () => {
    mockGuruGet
      .mockResolvedValueOnce({
        data: { data: [{ id: 'one' }], has_more_pages: 1, next_cursor: 'cursor-a' },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 'two' }], has_more_pages: 1, next_cursor: 'cursor-a' },
      })

    await expect(fetchAllSubscriptionsPaginated(undefined, undefined, { maxItems: 10 }))
      .rejects.toThrow('GURU_PAGINATION_NON_PROGRESS')
    expect(mockGuruGet).toHaveBeenCalledTimes(2)
  })
})
