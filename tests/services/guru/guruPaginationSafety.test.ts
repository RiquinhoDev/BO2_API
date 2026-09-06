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
        data: { data: [{ id: 'one' }], total_rows: 2, has_more_pages: 1, on_last_page: 0, next_cursor: 'cursor-a' },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 'two' }], total_rows: 2, has_more_pages: 1, on_last_page: 0, next_cursor: 'cursor-a' },
      })

    await expect(fetchAllSubscriptionsPaginated(undefined, undefined, { maxItems: 10 }))
      .rejects.toThrow('GURU_PAGINATION_NON_PROGRESS')
    expect(mockGuruGet).toHaveBeenCalledTimes(2)
  })

  test('does not report a provider page succeeded before cursor validation', async () => {
    mockGuruGet
      .mockResolvedValueOnce({
        data: { data: [{ id: 'one' }], total_rows: 2, has_more_pages: 1, on_last_page: 0, next_cursor: 'cursor-a' },
      })
      .mockResolvedValueOnce({
        data: { data: [], total_rows: 2, has_more_pages: 1, on_last_page: 0, next_cursor: 'cursor-b' },
      })
    const requestSucceeded = jest.fn()

    await expect(fetchAllSubscriptionsPaginated(undefined, undefined, { requestSucceeded }))
      .rejects.toThrow('GURU_PAGINATION_NON_PROGRESS')
    expect(requestSucceeded).toHaveBeenCalledTimes(1)
  })

  test('asserts ownership immediately before every page request', async () => {
    mockGuruGet
      .mockResolvedValueOnce({
        data: { data: [{ id: 'one' }], total_rows: 2, has_more_pages: 1, on_last_page: 0, next_cursor: 'cursor-a' },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 'two' }], total_rows: 2, has_more_pages: 0, on_last_page: 1 },
      })
    let requests = 0

    await expect(fetchAllSubscriptionsPaginated(undefined, undefined, {
      beforeRequest: () => {
        requests++
        if (requests === 2) throw new Error('lease-lost')
      },
    })).rejects.toThrow('lease-lost')
    expect(requests).toBe(2)
    expect(mockGuruGet).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['null data', { data: null, total_rows: 0, has_more_pages: 0, on_last_page: 1 }],
    ['missing total', { data: [], has_more_pages: 0, on_last_page: 1 }],
    ['contradictory flags', { data: [], total_rows: 0, has_more_pages: 1, on_last_page: 1, next_cursor: 'x' }],
    ['final count mismatch', { data: [], total_rows: 1, has_more_pages: 0, on_last_page: 1 }],
  ])('rejects strict provider envelope: %s', async (_name, envelope) => {
    mockGuruGet.mockResolvedValueOnce({ data: envelope })

    await expect(fetchAllSubscriptionsPaginated()).rejects.toThrow(/GURU_PAGINATION_(ENVELOPE|FINAL_COUNT)/)
    expect(mockGuruGet).toHaveBeenCalledTimes(1)
  })

  test('asserts ownership before every fallback subscription request', async () => {
    const { fetchSubscriptionById } = await import('../../../src/services/guru/sync/client')
    let requests = 0

    await expect(fetchSubscriptionById('sub-1', {
      beforeRequest: () => {
        requests++
        throw new Error('lease-lost')
      },
    })).rejects.toThrow('lease-lost')
    expect(requests).toBe(1)
    expect(mockGuruGet).not.toHaveBeenCalled()
  })
})
