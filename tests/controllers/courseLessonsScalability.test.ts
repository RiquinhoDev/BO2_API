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
  moduleSequence: Math.floor(index / 1_000) + 1,
  lessonSequence: Math.floor((index % 1_000) / 10) + 1,
  courseCode: 'ogi',
  url: '',
  isActive: true,
}))

test('lists all 10k lessons in stable grouped order through bounded reads', async () => {
  const requestedLimits: number[] = []
  const requestedSorts: Array<Record<string, number>> = []

  find.mockImplementation((filter: Record<string, unknown>) => {
    const clauses = filter.$or as Array<Record<string, unknown>> | undefined
    const filtered = clauses
      ? lessons.filter(lesson => clauses.some(clause => {
          const moduleSequence = clause.moduleSequence as number | { $gt: number }
          if (typeof moduleSequence === 'object') return lesson.moduleSequence > moduleSequence.$gt
          if (lesson.moduleSequence !== moduleSequence) return false
          const lessonSequence = clause.lessonSequence as number | { $gt: number }
          if (typeof lessonSequence === 'object') return lesson.lessonSequence > lessonSequence.$gt
          return lesson.lessonSequence === lessonSequence
            && lesson._id > (clause._id as { $gt: number }).$gt
        }))
      : lessons
    let limit = Number.POSITIVE_INFINITY
    type QueryDouble = {
      sort: jest.Mock<QueryDouble, [Record<string, number>]>
      limit: jest.Mock<QueryDouble, [number]>
      lean: jest.Mock<QueryDouble, []>
      exec: jest.Mock<Promise<Lesson[]>, []>
    }
    const query = {} as QueryDouble
    Object.assign(query, {
      sort: jest.fn((value: Record<string, number>) => {
        requestedSorts.push(value)
        return query
      }),
      limit: jest.fn((value: number) => {
        limit = value
        requestedLimits.push(value)
        return query
      }),
      lean: jest.fn(() => query),
      exec: jest.fn(async () => filtered.slice(0, limit)),
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
  expect(requestedSorts.every(sort => JSON.stringify(sort) === JSON.stringify({
    moduleSequence: 1,
    lessonSequence: 1,
    _id: 1,
  }))).toBe(true)
})

test('declares the full compound index required by the lesson cursor sort', () => {
  const CourseLesson = jest.requireActual('../../src/models/CourseLesson').default
  expect(CourseLesson.schema.indexes()).toContainEqual([
    { moduleSequence: 1, lessonSequence: 1, _id: 1 },
    expect.any(Object),
  ])
})
