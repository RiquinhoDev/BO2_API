import mongoose from 'mongoose'
import { determineSaleDate } from '../../src/services/productSales/dateResolver'

describe('product sales date resolver', () => {
  it('preserves the platform-specific precedence without touching persistence', async () => {
    const result = await determineSaleDate(
      {
        platform: 'hotmart',
        enrolledAt: new Date('2025-02-01T00:00:00.000Z'),
        userId: new mongoose.Types.ObjectId(),
      },
      {
        hotmart: { purchaseDate: new Date('2025-01-01T00:00:00.000Z') },
      },
    )

    expect(result).toEqual({
      date: new Date('2025-01-01T00:00:00.000Z'),
      source: 'purchaseDate',
    })
  })

  it('uses the existing first-system entry as the final platform fallback', async () => {
    const result = await determineSaleDate(
      { platform: 'discord', userId: new mongoose.Types.ObjectId() },
      { metadata: { firstSystemEntry: new Date('2024-04-01T00:00:00.000Z') } },
    )

    expect(result.source).toBe('firstSystemEntry')
    expect(result.date).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })
})

