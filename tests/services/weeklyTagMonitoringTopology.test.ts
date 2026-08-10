import weeklyTagMonitoring from '../../src/services/tagMonitoring/weeklyTagMonitoring.service'
import { getStudentsByPriority } from '../../src/services/tagMonitoring/weekly/studentsByPriority'

describe('weekly tag monitoring topology', () => {
  it('keeps reporting query separate from snapshot orchestration', () => {
    expect(typeof getStudentsByPriority).toBe('function')
    expect(typeof weeklyTagMonitoring.performWeeklySnapshot).toBe('function')
    expect(typeof weeklyTagMonitoring.getStudentsByPriority).toBe('function')
  })
})
