import mongoose from 'mongoose'
import { Class, ClassHistory, InactivationList, Student } from '../../src/models/Class'
import { Class as ClassEntity } from '../../src/models/class/Class'
import { Student as StudentEntity } from '../../src/models/class/Student'
import { ClassHistory as ClassHistoryEntity } from '../../src/models/class/ClassHistory'
import InactivationListEntity from '../../src/models/InactivationList'
import { InactivationList as LegacyInactivationList } from '../../src/models/class/InactivationList'

describe('class model topology', () => {
  it('preserves every registered Mongoose model identity through the facade', () => {
    expect(ClassEntity).toBe(Class)
    expect(StudentEntity).toBe(Student)
    expect(ClassHistoryEntity).toBe(ClassHistory)
    expect(InactivationListEntity).toBe(InactivationList)
    expect(LegacyInactivationList).toBe(InactivationList)
    expect(mongoose.models.Class).toBe(Class)
    expect(mongoose.models.Student).toBe(Student)
    expect(mongoose.models.ClassHistory).toBe(ClassHistory)
    expect(mongoose.models.InactivationList).toBe(InactivationList)
    expect(InactivationList.schema.path('execution.totalProcessed')).toBeDefined()
    expect(InactivationList.schema.path('scheduledDate')).toBeUndefined()
  })
})
