import { login } from '../../src/controllers/auth.controller'
import Admin from '../../src/models/Admin'

jest.mock('../../src/security/readOnlyMode', () => ({ isReadOnlyMode: () => true }))
jest.mock('../../src/security/jwt', () => ({ signAppToken: () => 'synthetic-session' }))

test.each([true, false])('read-only login checks credentials without persisting account changes: %s', async valid => {
  const save = jest.fn()
  const admin = { isActive: true, isLocked: false, comparePassword: jest.fn().mockResolvedValue(valid), save, permissions: [] }
  const find = jest.spyOn(Admin, 'findOne').mockResolvedValue(admin as never)
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  const next = jest.fn()
  try {
    await login({ body: { email: 'reader@example.test', password: 'synthetic' } } as never, { json, status } as never, next)
    expect(admin.comparePassword).toHaveBeenCalledWith('synthetic')
    expect(save).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    if (valid) expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    else expect(status).toHaveBeenCalledWith(401)
  } finally { find.mockRestore() }
})
