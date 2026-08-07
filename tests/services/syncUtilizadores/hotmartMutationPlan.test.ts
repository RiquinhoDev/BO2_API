import type { UniversalSourceItem } from '../../../src/types/universalSync.types'
import {
  buildHotmartMutationPlan,
  hotmartPlanToUpdateFields,
  type HotmartMutationInput,
  type HotmartUserState,
} from '../../../src/services/syncUtilizadoresServices/universalSync/builders/hotmartMutationPlan'

const NOW = new Date('2026-06-15T00:00:00.000Z')
const clock = { now: () => NOW }

function build(over: Partial<HotmartMutationInput> & { item?: Partial<UniversalSourceItem>; user?: HotmartUserState }) {
  const item = { email: 'a@x.test', hotmartUserId: 'h-1', ...over.item } as UniversalSourceItem
  return buildHotmartMutationPlan({
    item,
    user: over.user ?? {},
    isNew: over.isNew ?? false,
    realClassName: over.realClassName ?? null,
    clock,
  })
}

describe('buildHotmartMutationPlan — classes', () => {
  it('sets a new class, root ids and combined for an item with classId', () => {
    const plan = build({ item: { classId: 'C1', className: 'Item Name' }, realClassName: 'Nome Real' })
    expect(plan.hotmart.enrolledClasses).toEqual([
      { classId: 'C1', className: 'Nome Real', source: 'hotmart', isActive: true, enrolledAt: NOW },
    ])
    expect(plan.rootClassId).toBe('C1')
    expect(plan.rootClassName).toBe('Nome Real') // real DB name wins
    expect(plan.combined.primaryClass).toEqual({ classId: 'C1', className: 'Nome Real', source: 'hotmart' })
  })

  it('preserves an existing active class when the item has no classId', () => {
    const user: HotmartUserState = { classId: 'X', hotmart: { enrolledClasses: [{ classId: 'ACT', className: 'Ativa', source: 'hotmart', isActive: true }] } }
    const plan = build({ item: { classId: undefined }, user })
    expect(plan.rootClassId).toBe('ACT')
    expect(plan.rootClassName).toBe('Ativa')
    expect(plan.combined.allClasses.map((c) => c.classId)).toEqual(['ACT'])
  })

  it('keeps curseduca classes in combined.allClasses on a hotmart plan', () => {
    const user: HotmartUserState = { curseduca: { enrolledClasses: [{ classId: 'G1', className: 'Grupo', isActive: true, enteredAt: NOW, role: 'student' }] } }
    const plan = build({ item: { classId: 'C1' }, realClassName: 'C1 Nome', user })
    const sources = plan.combined.allClasses.map((c) => c.source).sort()
    expect(sources).toEqual(['curseduca', 'hotmart'])
  })
})

describe('buildHotmartMutationPlan — class history events', () => {
  it('emits a first-enrollment event for an existing user gaining a class', () => {
    const plan = build({ item: { classId: 'C1', className: 'Turma C1' }, isNew: false, user: { hotmart: {} } })
    expect(plan.classHistoryEvent).toMatchObject({ type: 'first-enrollment', classId: 'C1', dateMoved: NOW })
  })

  it('does not emit first-enrollment for a brand new user', () => {
    const plan = build({ item: { classId: 'C1' }, isNew: true, user: { hotmart: {} } })
    expect(plan.classHistoryEvent).toBeUndefined()
  })

  it('emits a class-changed event with previous id/name', () => {
    const user: HotmartUserState = { hotmart: { enrolledClasses: [{ classId: 'OLD', className: 'Antiga', source: 'hotmart', isActive: true }] } }
    const plan = build({ item: { classId: 'C1', className: 'Nova' }, user })
    expect(plan.classHistoryEvent).toMatchObject({
      type: 'class-changed',
      classId: 'C1',
      previousClassId: 'OLD',
      previousClassName: 'Antiga',
    })
  })
})

describe('buildHotmartMutationPlan — fields', () => {
  it('maps dates and engagement', () => {
    const plan = build({
      item: { purchaseDate: new Date('2026-01-10T00:00:00.000Z'), accessCount: 5, engagement: { engagementScore: 42 } },
    })
    expect(plan.hotmart.purchaseDate).toEqual(new Date('2026-01-10T00:00:00.000Z'))
    expect(plan.hotmart.engagement?.accessCount).toBe(5)
    expect(plan.hotmart.engagement?.engagementScore).toBe(42)
    expect(plan.rootAccessCount).toBe(5)
  })

  it('is deterministic under a fixed clock for identical input', () => {
    const a = build({ item: { classId: 'C1' }, realClassName: 'C1' })
    const b = build({ item: { classId: 'C1' }, realClassName: 'C1' })
    expect(a).toEqual(b)
  })
})

describe('hotmartPlanToUpdateFields', () => {
  it('flattens to the exact dotted mongo paths', () => {
    const plan = build({ item: { classId: 'C1', hotmartUserId: 'h-9', accessCount: 3 }, realClassName: 'C1 Nome' })
    const fields = hotmartPlanToUpdateFields(plan)
    expect(fields['hotmart.hotmartUserId']).toBe('h-9')
    expect(fields['hotmart.enrolledClasses']).toEqual(plan.hotmart.enrolledClasses)
    expect(fields['hotmart.engagement.accessCount']).toBe(3)
    expect(fields['accessCount']).toBe(3)
    expect(fields['classId']).toBe('C1')
    expect(fields['className']).toBe('C1 Nome')
    expect(fields['combined.allClasses']).toEqual(plan.combined.allClasses)
    expect(fields['hotmart.syncVersion']).toBe('3.0')
    expect(fields['metadata.sources.hotmart.version']).toBe('3.0')
  })
})
