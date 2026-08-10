import type { UniversalSourceItem } from '../../src/types/universalSync.types'
import {
  attachCurseducaMemberships,
  buildCurseducaEnrollment,
  isCurseducaEnrollmentActive,
} from '../../src/services/syncUtilizadoresServices/curseducaServices/curseducaMemberships'

const membership = (
  groupId: string,
  situation: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  isPrimary: boolean,
  isDuplicate: boolean,
): UniversalSourceItem => ({
  email: 'student@example.test',
  name: 'Student',
  curseducaUserId: '42',
  groupId,
  groupName: `Group ${groupId}`,
  enrolledAt: new Date(`2026-0${groupId}-01T00:00:00.000Z`),
  platformData: {
    situation,
    isPrimary,
    isDuplicate,
  },
})

describe('CursEduca denormalized memberships', () => {
  it('keeps one membership unchanged', () => {
    const input = [membership('1', 'ACTIVE', true, false)]

    const result = attachCurseducaMemberships(input)

    expect(result).toHaveLength(1)
    expect(result[0].allCurseducaGroups).toEqual([
      expect.objectContaining({ groupId: '1', situation: 'ACTIVE' }),
    ])
    expect(result[0].platformData).toMatchObject({
      isPrimary: true,
      isDuplicate: false,
    })
  })

  it('attaches the same complete group list without collapsing products', () => {
    const input = [
      membership('1', 'ACTIVE', true, true),
      membership('2', 'INACTIVE', false, true),
    ]

    const result = attachCurseducaMemberships(input)

    expect(result).toHaveLength(2)
    expect(result.map(item => item.groupId)).toEqual(['1', '2'])
    expect(result[0].allCurseducaGroups).toEqual(result[1].allCurseducaGroups)
    expect(result[0].allCurseducaGroups).toEqual([
      expect.objectContaining({ groupId: '1', situation: 'ACTIVE' }),
      expect.objectContaining({ groupId: '2', situation: 'INACTIVE' }),
    ])
    expect(result.map(item => item.platformData?.isPrimary)).toEqual([true, false])
    expect(result.every(item => item.platformData?.isDuplicate === true)).toBe(true)
  })

  it('derives activity independently of processing order', () => {
    expect(isCurseducaEnrollmentActive('ACTIVE')).toBe(true)
    expect(isCurseducaEnrollmentActive('INACTIVE')).toBe(false)
    expect(isCurseducaEnrollmentActive('SUSPENDED')).toBe(false)

    expect(buildCurseducaEnrollment({
      groupId: '1',
      situation: 'ACTIVE',
    }).isActive).toBe(true)
    expect(buildCurseducaEnrollment({
      groupId: '2',
      situation: 'INACTIVE',
    }).isActive).toBe(false)

    const result = attachCurseducaMemberships([
      membership('2', 'INACTIVE', false, true),
      membership('1', 'ACTIVE', true, true),
    ])
    const groups = result[0].allCurseducaGroups
    expect(groups).toBeDefined()
    if (!groups) throw new Error('expected aggregated CursEduca groups')

    const activityByGroup = Object.fromEntries(
      groups.map(group => [
        String(group.groupId),
        isCurseducaEnrollmentActive(group.situation),
      ]),
    )

    expect(activityByGroup).toEqual({ '1': true, '2': false })
  })
})
