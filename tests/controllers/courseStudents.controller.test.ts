import express from 'express'
import request from 'supertest'

const mockFindCourse = jest.fn()
const mockFindProduct = jest.fn()
const mockFindUserProducts = jest.fn()
const mockFindUsers = jest.fn()
const mockFindAcStates = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockFindUsers },
}))

jest.mock('../../src/models', () => ({
  Course: { findOne: mockFindCourse },
  Product: { findOne: mockFindProduct },
  UserProduct: { find: mockFindUserProducts },
}))

jest.mock('../../src/models/acTags/ACContactState', () => ({
  __esModule: true,
  default: { find: mockFindAcStates },
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: {},
}))

import {
  getClarezaStudents,
  getOGIStudents,
} from '../../src/controllers/acTags/activeCampaignCourse.controller'

type CourseCase = {
  name: string
  path: string
  handler: typeof getClarezaStudents
  courseLookup: Record<string, string>
  productLookup: Record<string, string>
  localTags: string[]
  remoteTags: string[]
  expectedStats: Record<string, number>
  zeroStats: Record<string, number>
  expectedStudentFields: Record<string, unknown>
  warning: string
}

const cases: CourseCase[] = [
  {
    name: 'Clareza',
    path: '/clareza/students',
    handler: getClarezaStudents,
    courseLookup: { name: 'Clareza' },
    productLookup: { name: 'Clareza' },
    localTags: ['OTHER', 'CLAREZA_NIVEL_1'],
    remoteTags: ['CLAREZA_NIVEL_1'],
    expectedStats: {
      activeLogins: 1,
      inactive14d: 0,
      inactive21d: 0,
      inactivePercentage: 0,
    },
    zeroStats: {
      activeLogins: 0,
      inactive14d: 0,
      inactive21d: 0,
      inactivePercentage: 0,
    },
    expectedStudentFields: {
      lastReportOpen: null,
      daysInactive: 7,
      isConsistent: false,
    },
    warning: 'Curso Clareza não existe na BD. Execute seed para criar.',
  },
  {
    name: 'OGI',
    path: '/ogi/students',
    handler: getOGIStudents,
    courseLookup: { code: 'OGI' },
    productLookup: { code: 'OGI_V1' },
    localTags: ['OTHER', 'OGI_LEVEL_1'],
    remoteTags: ['OGI_LEVEL_1'],
    expectedStats: {
      activeLogins: 1,
      inactive10d: 0,
      inactive21d: 0,
      inactivePercentage: 0,
    },
    zeroStats: {
      activeLogins: 0,
      inactive10d: 0,
      inactive21d: 0,
      inactivePercentage: 0,
    },
    expectedStudentFields: {
      lastLogin: null,
      daysInactive: 7,
      moduleProgress: 25,
    },
    warning: 'Curso OGI não existe na BD. Execute seed-ogi para criar.',
  },
]

describe.each(cases)('$name course students dashboard', (courseCase) => {
  const userIdHotmart = 'user-hotmart'
  const userIdCurseduca = 'user-curseduca'

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Math, 'random').mockReturnValue(0.25)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('preserves the zero envelope when the course is absent', async () => {
    mockFindCourse.mockResolvedValue(null)
    const app = express()
    app.get(courseCase.path, courseCase.handler)

    const response = await request(app).get(
      `${courseCase.path}?__bo2_offline_loopback=1`,
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: { stats: courseCase.zeroStats, students: [] },
      meta: { warning: courseCase.warning },
    })
    expect(mockFindUsers).not.toHaveBeenCalled()
  })

  it('reconciles local and cached AC tags without changing the dashboard contract', async () => {
    mockFindCourse.mockResolvedValue({ _id: 'course-id' })
    const students = [
      {
        _id: userIdHotmart,
        name: 'Hot Student',
        email: 'hot@example.test',
        hotmart: { hotmartUserId: 'hot-1' },
        curseduca: {},
      },
      {
        _id: userIdCurseduca,
        email: 'course@example.test',
        hotmart: {},
        curseduca: { curseducaUserId: 'course-1' },
      },
    ]
    const sort = jest.fn().mockResolvedValue(students)
    const selectUsers = jest.fn().mockReturnValue({ sort })
    mockFindUsers.mockReturnValue({ select: selectUsers })
    const leanProduct = jest.fn().mockResolvedValue({ _id: 'product-id' })
    const selectProduct = jest.fn().mockReturnValue({ lean: leanProduct })
    mockFindProduct.mockReturnValue({ select: selectProduct })
    const leanUserProducts = jest.fn().mockResolvedValue([
      {
        userId: userIdHotmart,
        activeCampaignData: { tags: courseCase.localTags },
      },
    ])
    const selectUserProducts = jest.fn().mockReturnValue({ lean: leanUserProducts })
    mockFindUserProducts.mockReturnValue({ select: selectUserProducts })
    const leanAcStates = jest.fn().mockResolvedValue([
      {
        email: 'hot@example.test',
        tags: courseCase.remoteTags.map((name, index) => ({
          id: String(index + 1),
          name,
        })),
      },
    ])
    mockFindAcStates.mockReturnValue({ lean: leanAcStates })

    const app = express()
    app.get(courseCase.path, courseCase.handler)
    const response = await request(app).get(
      `${courseCase.path}?__bo2_offline_loopback=1`,
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({ success: true }))
    expect(response.body.data.stats).toEqual(courseCase.expectedStats)
    expect(response.body.data.students).toHaveLength(2)
    expect(response.body.data.students[0]).toEqual({
      _id: 'user-hotmart',
      name: 'Hot Student',
      email: 'hot@example.test',
      appliedTags: courseCase.remoteTags,
      appliedTagsAC: courseCase.remoteTags,
      tagsSynced: true,
      platform: 'Hotmart',
      ...courseCase.expectedStudentFields,
    })
    expect(response.body.data.students[1]).toEqual({
      _id: 'user-curseduca',
      name: 'course',
      email: 'course@example.test',
      appliedTags: [],
      appliedTagsAC: [],
      tagsSynced: true,
      platform: 'Curseduca',
      ...courseCase.expectedStudentFields,
    })
    expect(mockFindCourse).toHaveBeenCalledWith(courseCase.courseLookup)
    expect(mockFindProduct).toHaveBeenCalledWith(courseCase.productLookup)
    expect(selectProduct).toHaveBeenCalledWith('_id')
    expect(leanProduct).toHaveBeenCalledTimes(1)
    expect(selectUserProducts).toHaveBeenCalledWith('userId activeCampaignData')
    expect(leanUserProducts).toHaveBeenCalledTimes(1)
    expect(leanAcStates).toHaveBeenCalledTimes(1)
    expect(selectUsers).toHaveBeenCalledWith(
      'name email hotmart curseduca activeCampaignId',
    )
    expect(sort).toHaveBeenCalledWith({ email: 1 })
    expect(mockFindUserProducts).toHaveBeenCalledWith({
      userId: { $in: [userIdHotmart, userIdCurseduca] },
      productId: 'product-id',
    })
    expect(mockFindAcStates).toHaveBeenCalledWith({
      email: { $in: ['hot@example.test', 'course@example.test'] },
    })
  })
})