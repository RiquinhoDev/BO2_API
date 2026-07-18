import User from '../../src/models/user'
import { studentService } from '../../src/services/syncUtilizadoresServices/hotmartServices/classesService'

describe('classes service legacy class contract', () => {
  it('preserves the top-level class fields used by student movement', () => {
    const user = new User({
      email: 'student@example.test',
      name: 'Student',
      classId: 'hotmart-class',
      className: 'Hotmart Class',
    })

    expect(user.classId).toBe('hotmart-class')
    expect(user.className).toBe('Hotmart Class')
    expect(user.toObject()).toMatchObject({
      classId: 'hotmart-class',
      className: 'Hotmart Class',
    })
  })

  it('does not expose the dead recursive sync adapter', () => {
    expect('syncComplete' in studentService).toBe(false)
  })
})
