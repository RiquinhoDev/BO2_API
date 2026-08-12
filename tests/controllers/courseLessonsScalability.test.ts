const find = jest.fn()

jest.mock('../../src/models/CourseLesson', () => ({
  __esModule: true,
  default: { find },
}))

import { listCourseLessons } from '../../src/controllers/courseLessons.controller'

type Lesson = {
  _id: number
  pageId: string
  pageName: string
  moduleId: string
  moduleName: string
  moduleSequence: number
  lessonSequence: number
  courseCode: string
  url: string
  isActive: boolean
}

const lessons: Lesson[] = Array.from({ length: 10_000 }, (_, index) => ({
  _id: index + 1,
  pageId: `page-${index + 1}`,
  pageName: `Lesson ${index + 1}`,
  moduleId: `module-${Math.floor(index / 100) + 1}`,
  moduleName: `Module ${Math.floor(index / 100) + 1}`,
  moduleSequence: Math.floor(index / 100) + 1,
  lessonSequence: (index % 100) + 1,
  courseCode: 'ogi',
  url: '',
  isActive: true,
}))

test('lists all 10k lessons in stable grouped order through bounded reads', async () => {
  const requestedLimits: number[] = []

  find.mockImplementation((filter: Record<string, unknown>) => {
    const cursor = filter.$or
      ? (filter.$or as Array<Record<string, unknown>>)[2]?._id as { $gt: number } | undefined
      : undefined
    const start = cursor?.$gt ?? 0
    let limit = Number.POSITIVE_INFINITY
    type QueryDouble = {
      sort: jest.Mock<QueryDouble, []>
      limit: jest.Mock<QueryDouble, [number]>
      lean: jest.Mock<QueryDouble, []>
      exec: jest.Mock<Promise<Lesson[]>, []>
    }
    const query = {} as QueryDouble
    Object.assign(query, {
      sort: jest.fn(() => query),
      limit: jest.fn((value: number) => {
        limit = value
        requestedLimits.push(value)
        return query
      }),
      lean: jest.fn(() => query),
      exec: jest.fn(async () => lessons.slice(start, start + limit)),
    })
    return query
  })

  const json = jest.fn()
  await listCourseLessons(
    {} as never,
    { json } as never,
    jest.fn() as never,
  )

  const envelope = json.mock.calls[0][0]
  const modules = envelope.data.modules as Array<{ lessons: Lesson[] }>
  const returned = modules.flatMap(module => module.lessons)
  expect(returned).toEqual(lessons)
  expect(new Set(returned.map(lesson => lesson.pageId)).size).toBe(10_000)
  expect(envelope.meta.totalLessons).toBe(10_000)
  expect(requestedLimits.length).toBeGreaterThan(1)
  expect(requestedLimits.every(limit => limit <= 200)).toBe(true)
})
