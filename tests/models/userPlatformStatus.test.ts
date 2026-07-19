import User from '../../src/models/user'

describe('User platform status persistence', () => {
  it('preserves the Hotmart status written by sync flows', () => {
    const user = new User({
      email: 'status@example.test',
      name: 'Status Test',
      hotmart: {
        status: 'ACTIVE',
      },
    })

    expect(user.toObject().hotmart?.status).toBe('ACTIVE')
  })
})
