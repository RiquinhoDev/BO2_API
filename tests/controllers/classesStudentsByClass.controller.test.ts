import express from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import { classesController } from '../../src/controllers/classes.controller'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { Class } from '../../src/models/Class'
import { User, UserProduct } from '../../src/models'

let mongoServer: MongoMemoryServer

const app = express()
app.get('/classes/:classId/students', classesController.getStudentsByClass)

const objectId = (suffix: number) =>
  new mongoose.Types.ObjectId(suffix.toString(16).padStart(24, '0'))

const getStudents = (classId: string, query = '') =>
  request(app).get(
    `/classes/${classId}/students?__bo2_offline_loopback=1${query}`,
  )

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'classes_students_by_class_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('classes_students_by_class_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    Class.collection.deleteMany({}),
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
  ])

  await Class.collection.insertMany([
    { classId: 'class-a', name: 'Class A', source: 'curseduca_sync' },
    { classId: 'class-b', name: 'Class B', source: 'curseduca_sync' },
  ])

  await User.collection.insertMany([
    {
      _id: objectId(1),
      name: 'Ana',
      email: 'ana@example.test',
      combined: { status: 'ACTIVE' },
      curseduca: { memberStatus: 'INACTIVE' },
      metadata: { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
    },
    {
      _id: objectId(2),
      name: 'Zoe',
      email: 'zoe@example.test',
      combined: { status: 'ACTIVE' },
      curseduca: { memberStatus: 'ACTIVE' },
      metadata: { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
    },
    {
      _id: objectId(3),
      name: 'Inactive',
      email: 'inactive@example.test',
      combined: { status: 'ACTIVE' },
      curseduca: { memberStatus: 'ACTIVE' },
      metadata: { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
    },
  ])

  await UserProduct.collection.insertMany([
    {
      userId: objectId(1),
      productId: objectId(101),
      platform: 'curseduca',
      status: 'ACTIVE',
      classes: [{ classId: 'class-a', joinedAt: new Date('2026-01-01') }],
    },
    {
      userId: objectId(2),
      productId: objectId(102),
      platform: 'curseduca',
      status: 'ACTIVE',
      classes: [{ classId: 'class-a', joinedAt: new Date('2026-01-01') }],
    },
    {
      userId: objectId(2),
      productId: objectId(103),
      platform: 'curseduca',
      status: 'INACTIVE',
      classes: [{ classId: 'class-b', joinedAt: new Date('2026-01-01') }],
    },
    {
      userId: objectId(3),
      productId: objectId(104),
      platform: 'curseduca',
      status: 'INACTIVE',
      classes: [{ classId: 'class-a', joinedAt: new Date('2026-01-01') }],
    },
  ])
})

test('lists active CursEduca memberships from UserProduct', async () => {
  const response = await getStudents('class-a')

  expect(response.status).toBe(200)
  expect(response.body.students.map((student: { email: string }) => student.email)).toEqual([
    'ana@example.test',
    'zoe@example.test',
  ])
  expect(response.body.pagination).toMatchObject({
    total: 2,
    limit: 100,
    offset: 0,
    hasMore: false,
  })
})

test('filters each membership by its own status', async () => {
  const activeOnly = await getStudents('class-b')
  const includingInactive = await getStudents('class-b', '&includeInactive=true')

  expect(activeOnly.status).toBe(200)
  expect(activeOnly.body.students).toEqual([])
  expect(includingInactive.status).toBe(200)
  expect(includingInactive.body.students).toHaveLength(1)
  expect(includingInactive.body.students[0].email).toBe('zoe@example.test')
})

test('keeps User sorting, limiting and the response envelope', async () => {
  const response = await getStudents(
    'class-a',
    '&sortBy=name&sortOrder=desc&limit=1&offset=0',
  )

  expect(response.status).toBe(200)
  expect(response.body).toMatchObject({
    success: true,
    classId: 'class-a',
    className: 'Class A',
    students: [{ name: 'Zoe', email: 'zoe@example.test', platform: 'curseduca' }],
    pagination: { total: 2, limit: 1, offset: 0, hasMore: true },
    filters: { includeInactive: false, sortBy: 'name', sortOrder: 'desc' },
  })
})
