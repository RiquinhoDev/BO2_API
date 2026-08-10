import { consolidateClasses as focused } from '../../src/utils/studentData/consolidateClasses'
import { consolidateClasses as legacy } from '../../src/utils/studentDataConsolidator'

describe('student data topology', () => {
  it('keeps the legacy export wired to the focused class consolidator', () => {
    expect(legacy).toBe(focused)
  })
})
