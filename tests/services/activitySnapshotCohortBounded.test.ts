import { mapCohortMilestonesBounded } from '../../src/services/syncUtilizadoresServices/activitySnapshot.service'

describe.each([1, 10, 100])('cohort bounded reads N=%i', size => {
  test('caps peak at 10 and preserves input order, duplicates and failures', async () => {
    let active = 0
    let peak = 0
    const milestones = Array.from({ length: size }, (_, index) => index % 7)
    const result = await mapCohortMilestonesBounded(milestones, async (milestone, index) => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      if (index === size - 1 && size > 1) throw new Error(`failure-${index}`)
      return `${index}:${milestone}`
    }).catch(error => error)

    expect(peak).toBeLessThanOrEqual(10)
    if (size > 1) expect(result).toEqual(new Error(`failure-${size - 1}`))
    else expect(result).toEqual(['0:0'])
  })
})
