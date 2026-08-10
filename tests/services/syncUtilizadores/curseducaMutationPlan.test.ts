import type { UniversalSourceItem } from '../../../src/types/universalSync.types'
import {
  buildCurseducaMutationPlan,
  curseducaPlanToUpdateFields,
  type CurseducaUserState,
} from '../../../src/services/syncUtilizadoresServices/universalSync/builders/curseducaMutationPlan'

function build(over: { item?: Partial<UniversalSourceItem>; user?: CurseducaUserState } = {}) {
  const item = { email: 'c@x.test', groupId: 'G1', groupName: 'Grupo Um', platformData: { situation: 'ACTIVE' }, ...over.item } as UniversalSourceItem
  return buildCurseducaMutationPlan({ item, user: over.user ?? {} })
}

describe('buildCurseducaMutationPlan — ids and group', () => {
  it('keys the class by groupId (string), sets groupName', () => {
    const plan = build({ item: { groupId: 'G1', curseducaUuid: 'uuid-student' } })
    expect(plan.curseduca.groupId).toBe('G1')
    expect(plan.curseduca.groupName).toBe('Grupo Um')
    expect(plan.curseduca.curseducaUuid).toBe('uuid-student')
  })
})

describe('buildCurseducaMutationPlan — member status', () => {
  it.each([
    ['ACTIVE', 'ACTIVE', false],
    ['INACTIVE', 'INACTIVE', true],
    ['SUSPENDED', 'INACTIVE', true],
  ] as const)('situation %s -> memberStatus %s, reconcile %s', (situation, expected, reconcile) => {
    const plan = build({ item: { platformData: { situation } } })
    expect(plan.curseduca.memberStatus).toBe(expected)
    expect(plan.curseduca.situation).toBe(situation)
    expect(plan.reconcileParaInativar).toBe(reconcile)
  })
})

describe('buildCurseducaMutationPlan — enrolledClasses', () => {
  it('maps all groups from allCurseducaGroups', () => {
    const plan = build({
      item: {
        allCurseducaGroups: [
          { groupId: 'G1', groupName: 'Grupo Um', situation: 'ACTIVE' },
          { groupId: 'G2', groupName: 'Grupo Dois', situation: 'ACTIVE' },
        ],
      } as Partial<UniversalSourceItem>,
    })
    expect(plan.curseduca.enrolledClasses).toHaveLength(2)
    expect(plan.curseduca.enrolledClasses?.map((c) => c.classId).sort()).toEqual(['G1', 'G2'])
  })

  it('falls back to a single group from groupId', () => {
    const plan = build({ item: { groupId: 'G9', groupName: 'Solo' } })
    expect(plan.curseduca.enrolledClasses).toHaveLength(1)
    expect(plan.curseduca.enrolledClasses?.[0].classId).toBe('G9')
  })
})

describe('buildCurseducaMutationPlan — combined preserves hotmart', () => {
  it('keeps existing hotmart classes in combined', () => {
    const user: CurseducaUserState = { hotmart: { enrolledClasses: [{ classId: 'H1', className: 'Hot', isActive: true }] } }
    const plan = build({ item: { groupId: 'G1' }, user })
    const sources = plan.combined.allClasses.map((c) => c.source).sort()
    expect(sources).toEqual(['curseduca', 'hotmart'])
  })
})

describe('buildCurseducaMutationPlan — fields and flatten', () => {
  it('maps dates and progress', () => {
    const plan = build({ item: { lastAccess: new Date('2026-05-01T00:00:00.000Z'), enrolledAt: new Date('2026-04-01T00:00:00.000Z'), progress: { percentage: 55 } } })
    expect(plan.curseduca.lastAccess).toEqual(new Date('2026-05-01T00:00:00.000Z'))
    expect(plan.curseduca.joinedDate).toEqual(new Date('2026-04-01T00:00:00.000Z'))
    expect(plan.curseduca.progressEstimated).toBe(55)
  })

  it('flattens to the exact dotted paths', () => {
    const plan = build({ item: { groupId: 'G1', platformData: { situation: 'INACTIVE' } } })
    const fields = curseducaPlanToUpdateFields(plan)
    expect(fields['curseduca.groupId']).toBe('G1')
    expect(fields['curseduca.memberStatus']).toBe('INACTIVE')
    expect(fields['curseduca.enrolledClasses']).toEqual(plan.curseduca.enrolledClasses)
    expect(fields['curseduca.syncVersion']).toBe('3.1')
    expect(fields['metadata.sources.curseduca.version']).toBe('3.1')
    expect(fields['curseduca.lastSyncAt']).toBeUndefined() // stamped by the executor
  })
})
