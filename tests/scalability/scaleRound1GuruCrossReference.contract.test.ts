const mockUserProductFind = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
const mockUserFindByIdAndUpdate = jest.fn()
const mockAxiosGet = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: mockAxiosGet, isAxiosError: jest.fn(() => false) },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findByIdAndUpdate: mockUserFindByIdAndUpdate },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: mockUserProductFind,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}))
jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  getOptionalCurseducaRuntimeSettings: jest.fn(() => ({
    apiUrl: 'https://curseduca.invalid', accessToken: 'token', apiKey: 'key',
  })),
}))

import { runCrossReferenceAfterGuruSync } from '../../src/services/guru/crossReference.service'

const productsQuery = (products: unknown[]) => ({
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(products),
})

describe.each([1, 10, 100])('Guru cross-reference actions N=%i', (size) => {
  test('keeps database action order and one write in flight', async () => {
    jest.clearAllMocks()
    const products = Array.from({ length: size }, (_, index) => ({
      _id: `product-${index}`,
      status: 'PARA_INATIVAR',
      userId: {
        _id: `user-${index}`,
        email: `user-${index}@example.test`,
        guru: { status: 'canceled' },
        curseduca: { memberStatus: 'INACTIVE', situation: 'INACTIVE' },
      },
    }))
    mockUserProductFind.mockReturnValue(productsQuery(products))
    let active = 0
    let peak = 0
    const order: string[] = []
    mockFindByIdAndUpdate.mockImplementation(async (id: string) => {
      active++
      peak = Math.max(peak, active)
      order.push(id)
      await Promise.resolve()
      active--
    })

    const result = await runCrossReferenceAfterGuruSync()

    expect(peak).toBe(1)
    expect(order).toEqual(Array.from({ length: size }, (_, index) => `product-${index}`))
    expect(result.processed).toBe(size)
    expect(result.confirmedInactive).toBe(size)
    expect(result.errors).toBe(0)
    expect(mockAxiosGet).not.toHaveBeenCalled()
  })

  test('accounts for every action failure and continues in order', async () => {
    jest.clearAllMocks()
    const products = Array.from({ length: size }, (_, index) => ({
      _id: `product-${index}`,
      status: 'PARA_INATIVAR',
      userId: {
        _id: `user-${index}`,
        email: `user-${index}@example.test`,
        guru: { status: 'canceled' },
        curseduca: { memberStatus: 'INACTIVE', situation: 'INACTIVE' },
      },
    }))
    mockUserProductFind.mockReturnValue(productsQuery(products))
    mockFindByIdAndUpdate.mockImplementation(async (id: string) => {
      const index = Number(id.slice('product-'.length))
      if (index % 10 === 0) throw new Error(`write-${index}`)
    })

    const result = await runCrossReferenceAfterGuruSync()
    const errors = Math.ceil(size / 10)
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(size)
    expect(result.errors).toBe(errors)
    expect(result.confirmedInactive).toBe(size - errors)
    expect(result.details.map(detail => detail.email)).toEqual(
      products.filter((_, index) => index % 10 !== 0).map(product => product.userId.email),
    )
  })
  test('throttles provider reads by 300ms and stops at the budget of 20', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-12T12:00:00.000Z'))
    try {
      jest.clearAllMocks()
      const products = Array.from({ length: size }, (_, index) => ({
        _id: `product-${index}`,
        status: 'PARA_INATIVAR',
        platformUserId: `member-${index}`,
        userId: {
          _id: `user-${index}`,
          email: `user-${index}@example.test`,
          guru: { status: 'canceled' },
          curseduca: { memberStatus: 'ACTIVE', situation: 'ACTIVE' },
        },
      }))
      mockUserProductFind.mockReturnValue(productsQuery(products))
      const callTimes: number[] = []
      mockAxiosGet.mockImplementation(async () => {
        callTimes.push(Date.now())
        return { data: { situation: 'INACTIVE' } }
      })
      mockUserFindByIdAndUpdate.mockResolvedValue(undefined)
      mockFindByIdAndUpdate.mockResolvedValue(undefined)

      const run = runCrossReferenceAfterGuruSync()
      await jest.runAllTimersAsync()
      await run

      const expectedCalls = Math.min(size, 20)
      expect(mockAxiosGet).toHaveBeenCalledTimes(expectedCalls)
      expect(callTimes).toEqual(Array.from(
        { length: expectedCalls },
        (_, index) => Date.parse('2026-08-12T12:00:00.000Z') + index * 300,
      ))
    } finally {
      jest.useRealTimers()
    }
  })
})
