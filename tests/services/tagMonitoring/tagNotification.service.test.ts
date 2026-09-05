const mockNotificationFindOne = jest.fn()
const mockNotificationCreate = jest.fn()
const mockNotificationFindByIdAndUpdate = jest.fn()
const mockCriticalTagFindOne = jest.fn()
const mockDetailCreate = jest.fn()
const mockDetailUpdateMany = jest.fn()
const mockDetailDeleteMany = jest.fn()
const mockDetailFindOneAndUpdate = jest.fn()

jest.mock('../../../src/models/tagMonitoring', () => ({
  __esModule: true,
  TagChangeNotification: {
    findOne: mockNotificationFindOne,
    create: mockNotificationCreate,
    findByIdAndUpdate: mockNotificationFindByIdAndUpdate,
  },
  TagChangeDetail: {
    create: mockDetailCreate,
    updateMany: mockDetailUpdateMany,
    deleteMany: mockDetailDeleteMany,
    findOneAndUpdate: mockDetailFindOneAndUpdate,
  },
  CriticalTag: {
    findOne: mockCriticalTagFindOne,
  },
}))

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import tagNotificationService from '../../../src/services/tagMonitoring/tagNotification.service'

type StudentChange = {
  email: string
  userName: string
  product: string
  currentTags: string[]
}

type FakeNotification = {
  _id: string
  detailsIds: string[]
}

type DetailFilter = {
  notificationId: string
  email: string
}

type DetailUpdate = {
  $set: {
    notificationId: string
    email: string
  }
}

function duplicateKeyError(): Error & { code: number } {
  return Object.assign(new Error('duplicate notification'), { code: 11000 })
}

function student(email: string): StudentChange {
  return {
    email,
    userName: 'Student',
    product: 'Course',
    currentTags: ['TAG_CRITICAL'],
  }
}

beforeEach(() => {
  jest.resetAllMocks()
})

test('concurrent duplicate notification claims converge without orphan details', async () => {
  const notification: FakeNotification = { _id: 'notification-1', detailsIds: [] }
  const details = new Map<string, { _id: string; notificationId: string }>()
  let detailSequence = 0

  mockNotificationFindOne
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(notification)
  mockCriticalTagFindOne.mockResolvedValue({ priority: 'LOW' })
  mockNotificationCreate
    .mockResolvedValueOnce(notification)
    .mockRejectedValueOnce(duplicateKeyError())
  mockDetailCreate.mockImplementation(async (data: { notificationId: string }) => ({
    _id: `legacy-detail-${data.notificationId || 'missing'}`,
    notificationId: data.notificationId,
  }))
  mockDetailUpdateMany.mockResolvedValue({ modifiedCount: 1 })
  mockDetailDeleteMany.mockResolvedValue({ deletedCount: 1 })
  mockDetailFindOneAndUpdate.mockImplementation(async (
    filter: DetailFilter,
    update: DetailUpdate,
  ) => {
    const key = `${filter.notificationId}|${filter.email}`
    const existing = details.get(key)
    if (existing) return existing
    const detail = {
      _id: `detail-${++detailSequence}`,
      notificationId: update.$set.notificationId,
    }
    details.set(key, detail)
    return detail
  })
  mockNotificationFindByIdAndUpdate.mockImplementation(async (
    _id: string,
    update: { $set: { detailsIds: string[] } },
  ) => {
    notification.detailsIds = update.$set.detailsIds
    return notification
  })

  const results = await Promise.all([
    tagNotificationService.createGroupedNotification('TAG_CRITICAL', 'ADDED', 36, 2026, [student('student@example.test')]),
    tagNotificationService.createGroupedNotification('TAG_CRITICAL', 'ADDED', 36, 2026, [student('student@example.test')]),
  ])

  expect(results).toEqual([notification, notification])
  expect(mockNotificationCreate).toHaveBeenCalledTimes(2)
  expect(mockDetailFindOneAndUpdate).toHaveBeenCalledTimes(2)
  expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledTimes(2)
  expect(details.size).toBe(1)
  expect(notification.detailsIds).toEqual(['detail-1'])
  expect([...details.values()].every(detail => detail.notificationId === notification._id)).toBe(true)
})

test('replay repairs a notification left incomplete by a partial detail failure', async () => {
  const notification: FakeNotification = { _id: 'notification-1', detailsIds: [] }
  const details = new Map<string, { _id: string; notificationId: string }>()
  let detailSequence = 0

  mockNotificationFindOne
    .mockResolvedValueOnce(null)
    .mockResolvedValue(notification)
  mockCriticalTagFindOne.mockResolvedValue({ priority: 'LOW' })
  mockNotificationCreate.mockResolvedValue(notification)
  mockDetailCreate
    .mockResolvedValueOnce({ _id: 'legacy-detail-1', notificationId: null })
    .mockRejectedValueOnce(new Error('detail unavailable'))
    .mockResolvedValue({ _id: 'legacy-detail-2', notificationId: null })
  mockDetailFindOneAndUpdate
    .mockImplementationOnce(async (filter: DetailFilter, update: DetailUpdate) => {
      const detail = { _id: `detail-${++detailSequence}`, notificationId: update.$set.notificationId }
      details.set(`${filter.notificationId}|${filter.email}`, detail)
      return detail
    })
    .mockRejectedValueOnce(new Error('detail unavailable'))
    .mockImplementation(async (filter: DetailFilter, update: DetailUpdate) => {
      const key = `${filter.notificationId}|${filter.email}`
      const existing = details.get(key)
      if (existing) return existing
      const detail = { _id: `detail-${++detailSequence}`, notificationId: update.$set.notificationId }
      details.set(key, detail)
      return detail
    })
  mockNotificationFindByIdAndUpdate.mockImplementation(async (
    _id: string,
    update: { $set: { detailsIds: string[] } },
  ) => {
    notification.detailsIds = update.$set.detailsIds
    return notification
  })

  await expect(tagNotificationService.createGroupedNotification(
    'TAG_CRITICAL',
    'ADDED',
    36,
    2026,
    [student('first@example.test'), student('second@example.test')],
  )).rejects.toThrow('detail unavailable')

  const replay = await tagNotificationService.createGroupedNotification(
    'TAG_CRITICAL',
    'ADDED',
    36,
    2026,
    [student('first@example.test'), student('second@example.test')],
  )

  expect(replay).toBe(notification)
  expect(mockNotificationCreate).toHaveBeenCalledTimes(1)
  expect(mockDetailFindOneAndUpdate).toHaveBeenCalledTimes(4)
  expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledTimes(1)
  expect(details.size).toBe(2)
  expect(notification.detailsIds).toEqual(['detail-1', 'detail-2'])
})

test('replay retries the notification link after an update failure', async () => {
  const notification: FakeNotification = { _id: 'notification-1', detailsIds: [] }
  const detail = { _id: 'detail-1', notificationId: notification._id }

  mockNotificationFindOne
    .mockResolvedValueOnce(null)
    .mockResolvedValue(notification)
  mockCriticalTagFindOne.mockResolvedValue({ priority: 'LOW' })
  mockNotificationCreate.mockResolvedValue(notification)
  mockDetailFindOneAndUpdate.mockResolvedValue(detail)
  mockNotificationFindByIdAndUpdate
    .mockRejectedValueOnce(new Error('link unavailable'))
    .mockImplementation(async (
      _id: string,
      update: { $set: { detailsIds: string[] } },
    ) => {
      notification.detailsIds = update.$set.detailsIds
      return notification
    })

  await expect(tagNotificationService.createGroupedNotificationWithStatus(
    'TAG_CRITICAL',
    'ADDED',
    36,
    2026,
    [student('student@example.test')],
  )).rejects.toThrow('link unavailable')

  const replay = await tagNotificationService.createGroupedNotificationWithStatus(
    'TAG_CRITICAL',
    'ADDED',
    36,
    2026,
    [student('student@example.test')],
  )

  expect(replay).toEqual({ notification, created: false })
  expect(mockNotificationCreate).toHaveBeenCalledTimes(1)
  expect(mockDetailFindOneAndUpdate).toHaveBeenCalledTimes(2)
  expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledTimes(2)
  expect(notification.detailsIds).toEqual(['detail-1'])
})

describe.each([1, 10, 100])('notification detail sync N=%i', (size) => {
  test('keeps detail upserts ordered with one write in flight', async () => {
    const notification: FakeNotification = { _id: 'notification-1', detailsIds: [] }
    const students = Array.from({ length: size }, (_, index) => student(`user-${index}@example.test`))
    const detailIds = students.map((_, index) => `detail-${index}`)
    let active = 0
    let peak = 0
    const events: string[] = []

    mockNotificationFindOne.mockResolvedValue(notification)
    mockDetailFindOneAndUpdate.mockImplementation(async (
      filter: DetailFilter,
      update: DetailUpdate,
    ) => {
      active++
      peak = Math.max(peak, active)
      events.push(filter.email)
      await Promise.resolve()
      active--
      return { _id: detailIds[Number(filter.email.match(/user-(\d+)@/)?.[1])], notificationId: update.$set.notificationId }
    })
    mockNotificationFindByIdAndUpdate.mockImplementation(async (
      _id: string,
      update: { $set: { detailsIds: string[] } },
    ) => {
      notification.detailsIds = update.$set.detailsIds
      return notification
    })

    await tagNotificationService.createGroupedNotification('TAG_CRITICAL', 'ADDED', 36, 2026, students)

    expect(mockDetailFindOneAndUpdate).toHaveBeenCalledTimes(size)
    expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledTimes(1)
    expect(peak).toBe(1)
    expect(events).toEqual(students.map(({ email }) => email))
    expect(notification.detailsIds).toEqual(detailIds)
  })
})
