import type { Request, Response } from 'express'
import User from '../../src/models/user'
import UserHistory from '../../src/models/UserHistory'
import StudentClassHistory from '../../src/models/StudentClassHistory'
import SyncHistory from '../../src/models/SyncHistory'
import { getStudentHistory } from '../../src/controllers/users.controller'

function historyQuery<T>(rows: T[]) {
  const query = {
    sort: jest.fn(),
    limit: jest.fn(),
    populate: jest.fn(),
    select: jest.fn(),
    lean: jest.fn().mockResolvedValue(rows)
  }
  query.sort.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  query.populate.mockReturnValue(query)
  query.select.mockReturnValue(query)
  return query
}

test('loads user history through the registered model export', async () => {
  const id = '507f1f77bcf86cd799439011'
  const student = {
    _id: id,
    email: 'student@example.test',
    name: 'Student',
    discord: { discordIds: [] },
    get: jest.fn()
  }
  jest.spyOn(User, 'findById').mockResolvedValue(student as never)

  const userRows = [{
    changeDate: new Date('2026-01-03T00:00:00Z'),
    source: 'MANUAL'
  }]
  const userHistoryQuery = historyQuery(userRows)
  const userHistoryFind = jest.spyOn(UserHistory, 'find').mockReturnValue(
    userHistoryQuery as unknown as ReturnType<typeof UserHistory.find>
  )
  jest.spyOn(StudentClassHistory, 'find').mockReturnValue(
    historyQuery([]) as unknown as ReturnType<typeof StudentClassHistory.find>
  )
  jest.spyOn(SyncHistory, 'find').mockReturnValue(
    historyQuery([]) as unknown as ReturnType<typeof SyncHistory.find>
  )

  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  await getStudentHistory(
    { params: { id }, query: {} } as unknown as Request<{ id: string }>,
    { status } as unknown as Response
  )

  expect(userHistoryFind).toHaveBeenCalledWith({
    $or: [
      { userId: expect.anything() },
      { userEmail: student.email }
    ]
  })
  expect(json).toHaveBeenCalledWith(expect.objectContaining({
    userHistory: userRows
  }))
})
