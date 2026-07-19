import { buildClassUserStatusUpdate } from '../../src/controllers/classes.controller'

describe('class status user updates', () => {
  test.each([
    [false, 'INACTIVE'],
    [true, 'ACTIVE'],
  ] as const)('persists %s through canonical user fields', (isActive, status) => {
    expect(buildClassUserStatusUpdate(isActive)).toEqual({
      'combined.status': status,
      'hotmart.status': status,
    })
  })
})
