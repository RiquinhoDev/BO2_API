import {
  CriticalTag,
  TagChangeDetail,
  TagChangeNotification,
  WeeklyNativeTagSnapshot,
  WeeklyTagMonitoringConfig,
} from '../../src/models/tagMonitoring'

describe('tag-monitoring model contracts', () => {
  it('exposes the registered instance methods', () => {
    expect(typeof new CriticalTag().toggle).toBe('function')
    expect(typeof new TagChangeNotification().markAsRead).toBe('function')
    expect(typeof new TagChangeNotification().markAsUnread).toBe('function')
  })

  it('exposes the registered static methods', () => {
    expect(typeof CriticalTag.findActiveTags).toBe('function')
    expect(typeof CriticalTag.isCritical).toBe('function')
    expect(typeof CriticalTag.getPriorityLevel).toBe('function')
    expect(typeof TagChangeDetail.findByNotification).toBe('function')
    expect(typeof TagChangeDetail.findByEmail).toBe('function')
    expect(typeof TagChangeDetail.findByProduct).toBe('function')
    expect(typeof TagChangeNotification.findUnread).toBe('function')
    expect(typeof TagChangeNotification.getUnreadCount).toBe('function')
    expect(typeof TagChangeNotification.findByWeek).toBe('function')
    expect(typeof TagChangeNotification.findByTag).toBe('function')
    expect(typeof WeeklyTagMonitoringConfig.getConfig).toBe('function')
    expect(typeof WeeklyTagMonitoringConfig.updateScope).toBe('function')
    expect(typeof WeeklyTagMonitoringConfig.toggleEnabled).toBe('function')
    expect(typeof WeeklyNativeTagSnapshot.findByEmail).toBe('function')
    expect(typeof WeeklyNativeTagSnapshot.findByWeek).toBe('function')
    expect(typeof WeeklyNativeTagSnapshot.findPreviousSnapshot).toBe('function')
  })
})
