import { ExpiredStudentsCollector } from '../../../src/services/syncUtilizadoresServices/universalSync/expiredStudentsCollector'
import type { ExpiredStudent } from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartExpiration'

const student = (userId: string, over: Partial<ExpiredStudent> = {}): ExpiredStudent => ({
  userId,
  email: `${userId}@x.test`,
  name: userId,
  purchaseDate: null,
  daysSincePurchase: 400,
  expirationSource: 'purchaseDate',
  expirationReason: 'test',
  ...over,
})

describe('ExpiredStudentsCollector', () => {
  it('deduplicates by userId', () => {
    const c = new ExpiredStudentsCollector()
    c.add(student('u1'))
    c.add(student('u1'))
    expect(c.all()).toHaveLength(1)
  })

  it('preserves two distinct userIds', () => {
    const c = new ExpiredStudentsCollector()
    c.add(student('u1'))
    c.add(student('u2'))
    expect(c.all().map((s) => s.userId)).toEqual(['u1', 'u2'])
  })

  it('keeps the first occurrence when a userId repeats', () => {
    const c = new ExpiredStudentsCollector()
    c.add(student('u1', { expirationReason: 'first' }))
    c.add(student('u1', { expirationReason: 'second' }))
    expect(c.all()).toHaveLength(1)
    expect(c.all()[0].expirationReason).toBe('first')
  })

  it('all() returns a copy that does not mutate internal state', () => {
    const c = new ExpiredStudentsCollector()
    c.add(student('u1'))
    const snapshot = c.all()
    snapshot.push(student('u2'))
    expect(c.all()).toHaveLength(1)
  })

  it('clear() empties the collector', () => {
    const c = new ExpiredStudentsCollector()
    c.add(student('u1'))
    c.clear()
    expect(c.all()).toEqual([])
    c.add(student('u2')) // reusable after clear
    expect(c.all().map((s) => s.userId)).toEqual(['u2'])
  })

  it('two collectors do not share state', () => {
    const a = new ExpiredStudentsCollector()
    const b = new ExpiredStudentsCollector()
    a.add(student('u1'))
    b.add(student('u2'))
    expect(a.all().map((s) => s.userId)).toEqual(['u1'])
    expect(b.all().map((s) => s.userId)).toEqual(['u2'])
  })
})
